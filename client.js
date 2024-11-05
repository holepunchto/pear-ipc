'use strict'
const { isBare, isWindows, isMac } = require('which-runtime')
const Pipe = require('net') // import mapped to bare-pipe, less resolves
const path = require('path')
const os = require('os')
const streamx = require('streamx')
const RPC = require('tiny-buffer-rpc')
const any = require('tiny-buffer-rpc/any')
const ReadyResource = require('ready-resource')
const FramedStream = require('framed-stream')

const PEAR_DIR = global.Pear?.config.pearDir || (isMac
  ? path.join(os.homedir(), 'Library', 'Application Support', 'pear')
  : isWindows
    ? path.join(os.homedir(), 'AppData', 'Roaming', 'pear')
    : path.join(os.homedir(), '.config', 'pear'))
const API = require('./api')
const methods = require('./methods')

const CONNECT_TIMEOUT = 20_000
const HEARTBEAT_INTERVAL = 1500
const HEARBEAT_CLOCK = 5
const ILLEGAL_METHODS = new Set(['id', 'userData', 'clients', 'hasClients', 'client', 'ref', 'unref', 'ready', 'opening', 'opened', 'close', 'closing', 'closed'])

class PearIPCClient extends ReadyResource {
  #connect = null
  constructor (opts = {}) {
    super()
    this._opts = opts
    this._socketPath = opts.socketPath
    this._handlers = opts.handlers || {}
    this._methods = opts.methods ? [...methods, ...opts.methods] : methods
    this._lock = opts.lock || path.join(PEAR_DIR, 'corestores', 'platform', 'primary-key')
    const api = new API(this)
    if (opts.api) Object.assign(api, opts.api)
    this._api = api
    this._connectTimeout = opts.connectTimeout || CONNECT_TIMEOUT
    this.#connect = opts.connect || null
    this._rpc = null
    this._clock = HEARBEAT_CLOCK
    this._internalHandlers = null

    this._rawStream = opts.stream || null
    this._stream = null
    this._unhandled = opts.unhandled || ((def) => { throw new Error('Method not found:' + def.name) })

    this.id = -1
    this.userData = opts.userData || null

    this._onclose = this.close.bind(this)
    this._onpipeline = opts.onpipeline || null
  }

  ref () {
    this._heartbeat?.ref()
    this._timeout?.ref()
    if (this._rawStream?.ref) this._rawStream.ref()
  }

  unref () {
    this._heartbeat?.unref()
    this._timeout?.unref()
    if (this._rawStream?.unref) this._rawStream.unref()
  }

  async _open () {
    if (this._rawStream === null) {
      if (this.#connect) await this._connect()
      else this._serve()
    }
  }

  _setup () {
    this._stream = new FramedStream(this._rawStream)

    this._rpc = new RPC((data) => { this._stream.write(data) })
    this._stream.on('data', (data) => { this._rpc.recv(data) })
    this._stream.on('end', () => { this._stream.end() })
    this._stream.on('error', this._onclose)
    this._stream.on('close', this._onclose)

    this._register()

    this._heartbeat = setInterval(() => {
      this._beat()
    }, HEARTBEAT_INTERVAL)
    this._beat()
  }

  async _beat () {
    try { await this._ping() } catch { /* ignore */ }
  }

  _register () {
    for (const { id, ...def } of this._methods) {
      if (ILLEGAL_METHODS.has(def.name)) throw new Error('Illegal Method: ' + def.name)
      const fn = this._handlers[def.name] || this._internalHandlers?.[def.name] || null
      const api = this._api[def.name]?.bind(this._api) || (fn
        ? () => (params = {}) => fn.call(this._handlers, params, this)
        : (
            def.send
              ? (method) => (params = {}) => method.send(params)
              : (!def.stream
                  ? (method) => (params = {}) => method.request(params)
                  : (method) => (params = {}) => {
                      const stream = method.createRequestStream()
                      stream.on('end', () => { stream.end() })
                      stream.write(params)
                      return stream
                    }
                )
          ))

      this[def.name] = api(this._rpc.register(+id, {
        request: any,
        response: any,
        onrequest: def.stream
          ? null
          : (params) => {
              return fn ? fn.call(this._handlers, params, this) : this._unhandled(def, params)
            },
        onstream: def.stream ? this._createOnStream(fn, (params) => this._unhandled(def, params)) : null
      }), this)
    }
  }

  _createOnStream (fn, unhandled) {
    if (fn === null) fn = unhandled
    return async (stream) => {
      stream.on('end', () => stream.end())
      try {
        for await (const params of stream) {
          const src = fn.call(this._handlers, params, this)
          const isStream = streamx.isStream(src)
          if (isStream) {
            streamx.pipeline(src, stream)
            if (typeof this._onpipeline === 'function') this._onpipeline(src, stream)
          } else {
            if (typeof this._onpipeline === 'function') this._onpipeline(src, stream)
            for await (const data of src) stream.write(data)
            stream.end()
          }
        }
      } catch (err) {
        stream.destroy(err)
      }
    }
  }

  _pipe () {
    if (isBare) return new Pipe(this._socketPath)
    const sock = new Pipe.Socket()
    sock.setNoDelay(true)
    sock.connect(this._socketPath)
    return sock
  }

  async _connect () {
    let trycount = 0
    let timedout = false
    let next = null

    this._timeout = setTimeout(() => {
      timedout = true
      this.close()
    }, this._connectTimeout)

    const onerror = () => {
      this._rawStream.removeListener('error', onerror)
      this._rawStream.removeListener('connect', onconnect)
      next(false)
    }

    const onconnect = () => {
      this._rawStream.removeListener('error', onerror)
      this._rawStream.removeListener('connect', onconnect)
      clearTimeout(this._timeout)
      next(true)
    }

    while (!this.closing) {
      const promise = new Promise((resolve) => { next = resolve })
      this._rawStream = this._pipe(this._socketPath)
      this._rawStream.on('connect', onconnect)
      this._rawStream.on('error', onerror)

      if (await promise) break
      if (timedout) throw new Error('Could not connect in time')
      if (trycount++ === 0 && typeof this.#connect === 'function') this.#connect()

      await new Promise((resolve) => setTimeout(resolve, trycount < 2 ? 5 : trycount < 10 ? 10 : 100))
    }

    clearTimeout(this._timeout)

    this._setup()

    if (this.closing) {
      if (this._rawStream) this._rawStream.destroy()
    }
  }

  _waitForClose () {
    return new Promise((resolve) => {
      if (this._stream.destroyed) {
        resolve()
      } else {
        this._stream.once('close', resolve)
        this._stream.end()
      }
    })
  }

  async _close () { // never throws, must never throw
    clearInterval(this._heartbeat)
    clearTimeout(this._timeout)

    if (this._stream) {
      await this._waitForClose()
      this._rawStream = null
      this._stream = null
    }
    this._rpc.destroy()
  }
}

module.exports = PearIPCClient
