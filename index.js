'use strict'
const { isBare, isWindows } = require('which-runtime')
const Pipe = isBare ? require('bare-pipe') : require('net')
const path = require('path')
const fs = require('fs')
const streamx = require('streamx')
const RPC = require('tiny-buffer-rpc')
const any = require('tiny-buffer-rpc/any')
const ReadyResource = require('ready-resource')
const API = require('./api')
const methods = require('./methods')

const CONNECT_TIMEOUT = 20_000
const noop = Function.prototype

class PearRPC extends ReadyResource {
  constructor (opts = {}) {
    super()
    const pearDir = global.Pear?.config.pearDir || opts.pearDir
    const lock = pearDir ? path.join(pearDir, 'corestores', 'platform', 'primary-key') : null
    const api = new API(lock)
    if (opts.api) Object.assign(api, opts.api)
    this._opts = opts
    this._socketPath = opts.socketPath
    this._handlers = opts.handlers || {}
    const _methods = opts.methods ? [...methods, ...opts.methods] : methods
    this._methods = Object.entries(_methods.map((m) => typeof m === 'string' ? { name: m } : m))
    this._api = opts.api || {}
    this._connectTimeout = opts.connectTimeout || CONNECT_TIMEOUT
    this._tryboot = opts.tryboot || null
    this._sc = null
    this._rpc = null
    this._clients = new Freelist()
    this.id = -1
    this.server = null
    this.stream = opts.stream || null
    this.userData = opts.userData || null
  }

  get clients () { return this._clients.alloced.filter(Boolean) }

  get clientless () { return this._clients.emptied() }

  client (id) { return this._clients.from(id) || null }

  async _open () {
    if (this.stream === null) {
      if (this._tryboot) await this._connect()
      else this._serve()
    }
    if (this.server) {
      try {
        if (!isWindows) await fs.promises.unlink(this._socketPath)
      } catch {}
      return this.server.listen(this._socketPath)
    }
    this._rpc = new RPC((data) => { this.stream.write(data) })
    this.stream.on('data', (data) => {
      this._rpc.recv(data)
    })
    this._register()
  }

  _register () {
    for (const [id, def] of this._methods) {
      const fn = this._handlers[def.name] || null
      const api = this._api[def.name] || (
        def.send
          ? (method) => (params) => method.send(params)
          : (def.stream
              ? (method) => (params) => {
                  const stream = method.createRequestStream()
                  stream.write(params)
                  return stream
                }
              : (method) => (params = {}) => {
                  const m = method.request(params)
                  return m
                }
            )
      )
      this[def.name] = api(this._rpc.register(+id, {
        request: any,
        response: any,
        onrequest: def.stream
          ? null
          : (params) => {
              return fn.call(this._handlers, params, this)
            },
        onstream: def.stream ? this._createOnStream(fn) : null
      }), this).bind(this._api)
    }
  }

  _createOnStream (fn) {
    if (fn === null) return null
    return async (stream) => {
      try {
        stream.on('error', noop)
        for await (const params of stream) streamx.pipeline(streamx.Readable.from(fn.call(this._handlers, params, this)), stream)
      } catch (err) {
        stream.destroy(err)
      }
    }
  }

  _serve () {
    this.server = Pipe.createServer()
    this.server.on('connection', async (stream) => {
      const client = new this.constructor({ ...this._opts, stream })
      client.id = this._clients.nextId()
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
      this.stream.removeListener('error', onerror)
      this.stream.removeListener('connect', onconnect)
      next(false)
    }

    const onconnect = () => {
      this.stream.removeListener('error', onerror)
      this.stream.removeListener('connect', onconnect)
      clearTimeout(this.timeout)
      next(true)
    }

    while (true) {
      const promise = new Promise((resolve) => { next = resolve })
      this.stream = this._pipe(this._socketPath)
      this.stream.on('connect', onconnect)
      this.stream.on('error', onerror)

      if (await promise) break
      if (timedout) throw new Error('Could not connect in time')
      if (trycount++ === 0) this._tryboot()

      await new Promise((resolve) => setTimeout(resolve, trycount < 2 ? 5 : trycount < 10 ? 10 : 100))
    }

    clearTimeout(this.timeout)

    this.stream.once('close', () => this.close())
  }

  unref () {
    this.stream?.unref()
    this.server?.unref()
  }

  ref () {
    this.stream?.ref()
    this.server?.ref()
  }

  _close () {
    clearTimeout(this.timeout)
    this.stream?.destroy()
    return this.server && new Promise((resolve) => {
      this.server.close(() => {
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

module.exports = PearRPC
