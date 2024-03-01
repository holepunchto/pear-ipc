'use strict'
const { isBare, isWindows } = require('which-runtime')
const Pipe = isBare ? require('bare-pipe') : require('net')
const fs = require('fs')
const streamx = require('streamx')
const RPC = require('tiny-buffer-rpc')
const any = require('tiny-buffer-rpc/any')
const ReadyResource = require('ready-resource')
const methods = require('./methods')

const CONNECT_TIMEOUT = 20_000
const noop = Function.prototype

class PearRPC extends ReadyResource {
  constructor (opts = {}) {
    super()
    this._opts = opts
    this._socketPath = opts.socketPath
    this._handlers = opts.handlers || {}
    this._methods = opts.methods ? [...methods, ...opts.methods] : methods
    this._methods = Object.entries(this._methods.map((m) => typeof m === 'string' ? { name: m } : m))
    this._api = opts.api || {}
    this._connectTimeout = opts.connectTimeout || CONNECT_TIMEOUT
    this._tryboot = opts.tryboot || null
    this._rpc = null
    this._sc = null
    this.id = -1
    this.server = null
    this.stream = opts.stream || null
    this.userData = opts.userData || null
  }

  ref () {
    this.server?.ref()
  }

  unref () {
    this.server?.unref()
  }

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
    this._register()
  }

  _register () {
    this._rpc = new RPC((data) => { this.stream.write(data) })
    this.stream.on('data', (data) => { this._rpc.recv(data) })
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
              : (method) => (params) => method.request(params)
            )
      )
      this[def.name] = api(this._rpc.register(+id, {
        request: any,
        response: any,
        onrequest: def.stream ? null : (params) => fn(params, this),
        onstream: def.stream ? this._createOnStream(fn) : null
      }), this)
    }
  }

  _createOnStream (fn) {
    if (fn === null) return null
    return async (stream) => {
      try {
        stream.on('error', noop)
        for await (const params of stream) streamx.pipeline(streamx.Readable.from(fn(params, this)), stream)
      } catch (err) {
        stream.destroy(err)
      }
    }
  }

  _serve () {
    this.server = Pipe.createServer()
    this.server.on('connection', (stream) => {
      const client = new this.constructor({ ...this._opts, handlers: null, stream })
      this.emit('client', client)
    })
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

    const timeout = setTimeout(() => {
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
      clearTimeout(timeout)
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

    clearTimeout(timeout)

    this.stream.once('close', () => this.close())
  }

  _close () {
    this.stream?.end()
    this.server?.close()
    return this.server?.closing
  }
}

module.exports = PearRPC
