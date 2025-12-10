'use strict'
const { isBare } = require('which-runtime')
const Pipe = require('net') // import mapped to bare-pipe, less resolves
const RPC = require('tiny-buffer-rpc')
const any = require('tiny-buffer-rpc/any')
const ReadyResource = require('ready-resource')
const FramedStream = require('framed-stream')

const API = require('./api')
const methods = require('./methods')
const constants = require('./constants')

class PearIPCClient extends ReadyResource {
  #connect = null
  constructor(opts = {}) {
    super()
    this._opts = opts
    this._socketPath = opts.socketPath
    this._methods = opts.methods ? [...methods, ...opts.methods] : methods
    const api = new API(this)
    if (opts.api) Object.assign(api, opts.api)
    this._api = api
    this._connectTimeout = opts.connectTimeout || constants.CONNECT_TIMEOUT
    this.#connect = opts.connect || null
    this._rpc = null
    this._internalHandlers = null

    this._rawStream = opts.stream || null
    this._stream = null

    this.userData = opts.userData || null

    this._onclose = this.close.bind(this)
  }

  ref() {
    this._heartbeat?.ref()
    this._timeout?.ref()
    if (this._rawStream?.ref) this._rawStream.ref()
  }

  unref() {
    this._heartbeat?.unref()
    this._timeout?.unref()
    if (this._rawStream?.unref) this._rawStream.unref()
  }

  async _open() {
    if (this._rawStream === null) {
      await this._connect()
    }
  }

  _setup() {
    this._stream = new FramedStream(this._rawStream)

    this._rpc = new RPC((data) => {
      this._stream.write(data)
    })
    this._stream.on('data', (data) => {
      this._rpc.recv(data)
    })
    this._stream.on('end', () => {
      this._stream.end()
    })
    this._stream.on('error', this._onclose)
    this._stream.on('close', this._onclose)

    this._register()

    this._heartbeat = setInterval(() => {
      this._beat()
    }, constants.HEARTBEAT_INTERVAL)
    this._beat()
  }

  async _beat() {
    try {
      await this._ping()
    } catch {
      /* ignore */
    }
  }

  _createSendMethod(method) {
    return (params = {}) => method.send(params)
  }

  _createRequestMethod(method) {
    return (params = {}) => method.request(params)
  }

  _createStreamMethod(method) {
    return (params = {}) => {
      const stream = method.createRequestStream()
      stream.on('end', () => {
        stream.end()
      })
      stream.write(params)
      return stream
    }
  }

  _createMethod(definition) {
    if (definition.send) {
      return this._createSendMethod
    }

    if (!definition.stream) {
      return this._createRequestMethod
    }

    return this._createStreamMethod
  }

  _register() {
    for (const { id, ...def } of this._methods) {
      if (constants.ILLEGAL_METHODS.has(def.name)) {
        throw new Error('Illegal Method: ' + def.name)
      }
      const api =
        this._api[def.name]?.bind(this._api) || this._createMethod(def)

      this[def.name] = api(
        this._rpc.register(+id, {
          request: any,
          response: any
        }),
        this
      )
    }
  }

  _pipe() {
    if (isBare) return new Pipe(this._socketPath)
    const sock = new Pipe.Socket()
    sock.setNoDelay(true)
    sock.connect(this._socketPath)
    return sock
  }

  async _connect() {
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
      const promise = new Promise((resolve) => {
        next = resolve
      })
      this._rawStream = this._pipe(this._socketPath)
      this._rawStream.on('connect', onconnect)
      this._rawStream.on('error', onerror)

      if (await promise) break
      if (timedout) throw new Error('Could not connect in time')
      if (trycount++ === 0 && typeof this.#connect === 'function') {
        this.#connect()
      }

      await new Promise((resolve) =>
        setTimeout(resolve, trycount < 2 ? 5 : trycount < 10 ? 10 : 100)
      )
    }

    clearTimeout(this._timeout)

    this._setup()

    if (this.closing) {
      if (this._rawStream) this._rawStream.destroy()
    }
  }

  _waitForClose() {
    return new Promise((resolve) => {
      if (this._stream.destroyed) {
        resolve()
      } else {
        this._stream.once('close', resolve)
        this._stream.end()
      }
    })
  }

  async _close() {
    // never throws, must never throw
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
