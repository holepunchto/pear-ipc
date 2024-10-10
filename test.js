'use strict'
const { isWindows } = require('which-runtime')
const test = require('brittle')
const streamx = require('streamx')
const IPC = require('.')

const socketPath = isWindows ? '\\\\.\\pipe\\pear-ipc-test-pipe' : 'test.sock'

test('ipc request', async (t) => {
  t.plan(1)
  const server = new IPC({
    socketPath,
    handlers: { start: (params) => params.result }
  })
  t.teardown(() => server.close())
  const client = new IPC({
    socketPath,
    connect: true
  })

  await server.ready()
  await client.ready()
  t.is(await client.start({ result: 'good' }), 'good')
})

test('ipc request api wrapped', async (t) => {
  t.plan(1)

  const api = {
    start (method) {
      return async (params) => {
        const result = await method.request(params)
        return 'very ' + result
      }
    }
  }

  const server = new IPC({
    socketPath,
    handlers: { start: (params) => params.result }
  })
  t.teardown(() => server.close())
  const client = new IPC({
    socketPath,
    api,
    connect: true
  })
  t.teardown(() => server.close())
  await server.ready()
  await client.ready()
  t.is(await client.start({ result: 'good' }), 'very good')
})

test('ipc stream', async (t) => {
  t.plan(4)

  const server = new IPC({
    socketPath,
    handlers: {
      messages: (params) => {
        t.is(params.result, 'good')
        const stream = new streamx.PassThrough()
        stream.push('ex')
        setImmediate(() => {
          stream.push('streamly')
          setImmediate(() => {
            stream.push(params.result)
            stream.end()
          })
        })
        return stream
      }
    }
  })
  t.teardown(() => server.close())
  const client = new IPC({
    socketPath,
    connect: true
  })
  await server.ready()
  await client.ready()
  const stream = client.messages({ result: 'good' })
  let count = 0
  for await (const data of stream) {
    count += 1
    if (count === 1) t.is(data, 'ex')
    if (count === 2) t.is(data, 'streamly')
    if (count === 3) {
      t.is(data, 'good')
      break
    }
  }
})

test('ipc stream api wrapped', async (t) => {
  t.plan(4)

  const server = new IPC({
    socketPath,
    handlers: {
      messages: (params) => {
        t.is(params.result, 'very good')
        const stream = new streamx.PassThrough()
        stream.push('ex')
        setImmediate(() => {
          stream.push('streamly')
          setImmediate(() => {
            stream.push(params.result)
          })
        })
        return stream
      }
    }
  })
  t.teardown(() => server.close())
  const client = new IPC({
    socketPath,
    connect: true,
    api: {
      messages (method) {
        return (params) => {
          const stream = method.createRequestStream()
          stream.write({ result: 'very ' + params.result })
          return stream
        }
      }
    }
  })
  await server.ready()
  await client.ready()
  const stream = client.messages({ result: 'good' })
  let count = 0
  for await (const data of stream) {
    count += 1
    if (count === 1) t.is(data, 'ex')
    if (count === 2) t.is(data, 'streamly')
    if (count === 3) {
      t.is(data, 'very good')
      break
    }
  }
})

test('ipc stream w/ opts.onpipeline', async (t) => {
  t.plan(6)
  let serverStream = null
  const server = new IPC({
    socketPath,
    onpipeline (src, dst) {
      t.is(src, serverStream)
      t.is(src._readableState.pipeTo, dst)
    },
    handlers: {
      messages: (params) => {
        t.is(params.result, 'good')
        const stream = new streamx.PassThrough()
        serverStream = stream
        stream.name = 'boobyjoew'
        stream.push('ex')
        setImmediate(() => {
          stream.push('streamly')
          setImmediate(() => {
            stream.push(params.result)
            stream.end()
          })
        })

        return stream
      }
    }
  })
  t.teardown(() => server.close())
  const client = new IPC({
    socketPath,
    connect: true
  })
  await server.ready()
  await client.ready()
  const stream = client.messages({ result: 'good' })
  let count = 0
  for await (const data of stream) {
    count += 1
    if (count === 1) t.is(data, 'ex')
    if (count === 2) t.is(data, 'streamly')
    if (count === 3) {
      t.is(data, 'good')
      break
    }
  }
})

test('ipc client close when heartbeat fails', async (t) => {
  t.plan(2)
  const server = new IPC({
    socketPath,
    handlers: { start: (params) => params.result }
  })
  t.teardown(() => server.close())
  const client = new IPC({
    socketPath,
    connect: true
  })
  let pinged = false
  const { _register } = IPC.prototype
  IPC.prototype._register = function (...args) {
    if (this._server === null && this.id > -1) {
      const { _ping } = this._internalHandlers
      this._internalHandlers._ping = (params, client) => {
        pinged = true
        IPC.prototype._register = _register
        return _ping(params, client)
      }
    }
    return _register.apply(this, args)
  }
  client.once('close', () => {
    t.pass('client closed by server when heartbeat fails')
    t.is(pinged, true)
  })
  await server.ready()
  await client.ready()
  client._beat = () => {} // simulate heartbeat failure
})
