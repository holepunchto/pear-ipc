'use strict'
const { isBare } = require('which-runtime')
const Pipe = isBare ? require('bare-pipe') : require('net')
const streamx = require('streamx')
const FramedStream = require('framed-stream')
const Protomux = require('protomux')
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
    this._methods = opts.methods ? [ ...methods, ...opts.methods ] : methods
    this._methods = Object.entries(this._methods.map((m) => typeof m === 'string' ? { name: m } : m))
    this._api = opts.api || {}
    this._connectTimeout = opts.connectTimeout || CONNECT_TIMEOUT
    this._tryboot = opts.tryboot || null
    this._rpc = null
    this._sc = null
    this.server = null
    this.pipe = null
    this.stream = opts.stream || null
  }

  ref () {
    this.stream?.stream?.rawStream?.ref()
    this.server?.ref()
  }

  unref () {
    this.stream?.stream?.rawStream?.unref()
    this.server?.unref()
  }
  async _open () {
    if (this.stream === null) {
      if (this._tryboot) await this._connect()
      else this._serve()
    }
    if (this.server) return
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
        onrequest: def.stream ? null : fn,
        onstream: def.stream ? createOnStream(fn) : null
      }), this)
    }
  }

  _serve () {
    this.server = Pipe.createServer()
    this.server.on('connection', (pipe) => {
      const framed = new FramedStream(pipe)
      const stream = new Protomux(framed)
      this.emit('instance', new this.constructor({ ...this._opts, handlers: null, stream }))
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
      this.pipe.removeListener('error', onerror)
      this.pipe.removeListener('connect', onconnect)
      next(false)
    }

    const onconnect = () => {
      this.pipe.removeListener('error', onerror)
      this.pipe.removeListener('connect', onconnect)
      clearTimeout(timeout)
      next(true)
    }

    while (true) {
      const promise = new Promise((resolve) => { next = resolve })
      this.pipe = this._pipe(this._socketPath)
      this.pipe.on('connect', onconnect)
      this.pipe.on('error', onerror)

      if (await promise) break
      if (timedout) throw new Error('Could not connect in time')
      if (trycount++ === 0) this._tryboot()

      await new Promise((resolve) => setTimeout(resolve, trycount < 2 ? 5 : trycount < 10 ? 10 : 100))
    }

    clearTimeout(timeout)

    this.pipe.once('close', () => this.close())
    const framed = new FramedStream(this.pipe)
    this.stream = new Protomux(framed)
  }

  _close () {
    this.stream?.stream?.end()
    this.stream?.stream?.rawStream?.destroy()
    this.server?.close()
    return this.server?.closing
  }
}

function createOnStream (fn) {
  if (fn === null) return null
  return async function onstream (stream) {
    try {
      stream.on('error', noop)
      for await (const params of stream) streamx.pipeline(fn(params), stream)
    } catch (err) {
      stream.destroy(err)
    }
  }
}

module.exports = PearRPC