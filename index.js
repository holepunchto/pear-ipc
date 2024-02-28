'use strict'
const streamx = require('streamx')
const RPC = require('tiny-buffer-rpc')
const any = require('tiny-buffer-rpc/any')
const noop = Function.prototype

class PearRPC {
  constructor (opts = {}) {
    this.stream = opts.stream || new streamx.Duplex()
    this._handlers = opts.handlers || {}
    this._api = opts.api || {}
    if (Array.isArray(opts.methods) === false) throw new Error('methods option is required and must be an array')
    this._methods = opts.methods.sort()
    this._rpc = new RPC((data) => { this.stream.write(data) })
    this.stream.on('data', (data) => { this._rpc.recv(data) })
    for (const [id, desc] of Object.entries(this._methods)) {
      const name = typeof desc === 'string' ? desc : desc.name
      if (typeof name !== 'string') throw new Error('invalid name: ' + name)
      if (desc.send && desc.stream) throw new Error('method may be stream or send but not both')
      const fn = this._handlers[name] || null
      if (fn !== null && typeof fn !== 'function') throw new Error('invalid handler')
      const api = this._api[name] || (
        desc.send
          ? (method) => (params) => method.send(params)
          : (desc.stream
              ? (method) => (params) => {
                  const stream = method.createRequestStream()
                  stream.write(params)
                  return stream
                }
              : (method) => (params) => method.request(params)
            )
      )
      this[name] = api(this._rpc.register(+id, {
        request: any,
        response: any,
        onrequest: desc.stream ? null : fn,
        onstream: desc.stream ? createOnStream(fn) : null
      }))
    }
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
