'use strict'
const { isBare, isWindows } = require('which-runtime')
const Pipe = isBare ? require('bare-pipe') : require('net')
const path = require('path')
const fs = require('fs')
const streamx = require('streamx')
const RPC = require('tiny-buffer-rpc')
const any = require('tiny-buffer-rpc/any')
const ReadyResource = require('ready-resource')
const FramedStream = require('framed-stream')
const API = require('./api')
const methods = require('./methods')

const CONNECT_TIMEOUT = 20_000
const noop = Function.prototype

class PearIPC extends ReadyResource {
  #connect = null
  constructor (opts = {}) {
    super()
    this._opts = opts
    this._socketPath = opts.socketPath
    this._handlers = opts.handlers || {}
    this._methods = opts.methods ? [...methods, ...opts.methods] : methods
    const lock = path.join(opts.socketPath, '..', 'corestores', 'platform', 'primary-key')
    const api = new API(lock)
    if (opts.api) Object.assign(api, opts.api)
    this._api = api
    this._connectTimeout = opts.connectTimeout || CONNECT_TIMEOUT
    this.#connect = opts.connect || null
    this._sc = null
    this._rpc = null
    this._clients = new Freelist()
    this.id = -1
    this.server = null
    this.rawStream = opts.stream || null
    this.stream = null
    this.unhandled = opts.unhandled || ((def) => { throw new Error('Method not found:' + def.name) })
    this.userData = opts.userData || null
  }

  get clients () { return this._clients.alloced.filter(Boolean) }

  get hasClients () { return !this._clients.emptied() }

  client (id) { return this._clients.from(id) || null }

  async _open () {
    if (this.rawStream === null) {
      if (this.#connect) await this._connect()
      else this._serve()
    }

    if (this.closing) return

    if (this.server) {
      try {
        if (!isWindows) await fs.promises.unlink(this._socketPath)
      } catch {}
      if (this.closing) return
      await this.server.listen(this._socketPath)
      return
    }

    this.stream = new FramedStream(this.rawStream)

    this._rpc = new RPC((data) => {
      this.stream.write(data)
    })

    this.stream.on('data', (data) => {
      this._rpc.recv(data)
    })

    const onclose = this.close.bind(this)

    this.stream.on('error', onclose)
    this.stream.on('close', onclose)

    this._register()
  }

  _register () {
    for (const { id, ...def } of this._methods) {
      const fn = this._handlers[def.name] || null
      const api = (this._api[def.name] || (
        def.send
          ? (method) => fn
              ? (params = {}) => fn.call(this._handlers, params, this)
              : (params) => {
                  return method.send(params)
                }
          : (def.stream
              ? (method) => fn
                  ? (params = {}) => fn.call(this._handlers, params, this)
                  : (params = {}) => {
                      const stream = method.createRequestStream()
                      stream.write(params)
                      return stream
                    }
              : (method) => fn
                  ? (params = {}) => fn.call(this._handlers, params, this)
                  : (params = {}) => {
                      return method.request(params)
                    }
            )
      )).bind(this._api)

      this[def.name] = api(this._rpc.register(+id, {
        request: any,
        response: any,
        onrequest: def.stream
          ? null
          : (params) => {
              return fn ? fn.call(this._handlers, params, this) : this.unhandled(def, params)
            },
        onstream: def.stream ? this._createOnStream(fn, (params) => this.unhandled(def, params)) : null
      }), this)
    }
  }

  _createOnStream (fn, unhandled) {
    if (fn === null) fn = unhandled
    return async (stream) => {
      try {
        stream.on('error', noop)
        for await (const params of stream) {
          streamx.pipeline(streamx.Readable.from(fn.call(this._handlers, params, this)), stream)
        }
      } catch (err) {
        stream.destroy(err)
      }
    }
  }

  _serve () {
    this.server = Pipe.createServer()
    this.server.on('connection', async (stream) => {
      const client = new this.constructor({ ...this._opts, stream })
      client.id = this._clients.alloc(client)
      stream.once('end', () => { client.close().finally(() => client.emit('close')) })
      client.once('close', () => { this._clients.free(client.id) })
      await client.ready()
      this.emit('client', client)
    })
    this._rpc = new RPC(noop)
    this._register()
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

    this.timeout = setTimeout(() => {
      timedout = true
      this.close()
    }, this._connectTimeout)

    const onerror = () => {
      this.rawStream.removeListener('error', onerror)
      this.rawStream.removeListener('connect', onconnect)
      next(false)
    }

    const onconnect = () => {
      this.rawStream.removeListener('error', onerror)
      this.rawStream.removeListener('connect', onconnect)
      clearTimeout(this.timeout)
      next(true)
    }

    while (!this.closing) {
      const promise = new Promise((resolve) => { next = resolve })
      this.rawStream = this._pipe(this._socketPath)
      this.rawStream.on('connect', onconnect)
      this.rawStream.on('error', onerror)

      if (await promise) break
      if (timedout) throw new Error('Could not connect in time')
      if (trycount++ === 0 && typeof this.#connect === 'function') this.#connect()

      await new Promise((resolve) => setTimeout(resolve, trycount < 2 ? 5 : trycount < 10 ? 10 : 100))
    }

    clearTimeout(this.timeout)

    if (this.closing) {
      if (this.rawStream) this.rawStream.destroy()
      return
    }

    const onclose = this.close.bind(this)

    this.rawStream.on('error', onclose)
    this.rawStream.on('close', onclose)
  }

  unref () {
    if (this.rawStream?.unref) this.rawStream.unref()
    this.server?.unref()
  }

  ref () {
    if (this.rawStream?.ref) this.rawStream.ref()
    this.server?.ref()
  }

  _close () {
    clearTimeout(this.timeout)
    this.rawStream?.destroy()
    return this.server && new Promise((resolve) => {
      const closingClients = []
      for (const client of this._clients) {
        const close = client.close()
        close.catch(noop)
        closingClients.push(close)
      }
      this.server.close(async () => {
        await Promise.allSettled(closingClients)
        resolve()
      })
    })
  }
}

class Freelist {
  alloced = []
  freed = []

  nextId () {
    return this.freed.length === 0 ? this.alloced.length : this.freed[this.freed.length - 1]
  }

  alloc (item) {
    const id = this.freed.length === 0 ? this.alloced.push(null) - 1 : this.freed.pop()
    this.alloced[id] = item
    return id
  }

  free (id) {
    this.freed.push(id)
    this.alloced[id] = null
  }

  from (id) {
    return id < this.alloced.length ? this.alloced[id] : null
  }

  emptied () {
    return this.freed.length === this.alloced.length
  }

  * [Symbol.iterator] () {
    for (const item of this.alloced) {
      if (item === null) continue
      yield item
    }
  }
}

module.exports = PearIPC
