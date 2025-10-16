'use strict'
const { isWindows } = require('which-runtime')
const test = require('brittle')
const streamx = require('streamx')
const { Server, Client } = require('.')

const socketPath = isWindows ? '\\\\.\\pipe\\pear-ipc-test-pipe' : 'test.sock'

test('ipc request', async (t) => {
  t.plan(1)
  const server = new Server({
    socketPath,
    handlers: { get: (params) => params.result }
  })
  t.teardown(() => server.close())
  const client = new Client({
    socketPath,
    connect: true
  })

  await server.ready()
  await client.ready()
  t.is(await client.get({ result: 'good' }), 'good')
})

test('ipc request api wrapped', async (t) => {
  t.plan(1)

  const api = {
    get(method) {
      return async (params) => {
        const result = await method.request(params)
        return 'very ' + result
      }
    }
  }

  const server = new Server({
    socketPath,
    handlers: { get: (params) => params.result }
  })
  t.teardown(() => server.close())
  const client = new Client({
    socketPath,
    api,
    connect: true
  })
  t.teardown(() => server.close())
  await server.ready()
  await client.ready()
  t.is(await client.get({ result: 'good' }), 'very good')
})

test('ipc stream', async (t) => {
  t.plan(4)

  const server = new Server({
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
  const client = new Client({
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

  const server = new Server({
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
  const client = new Client({
    socketPath,
    connect: true,
    api: {
      messages(method) {
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
  const server = new Server({
    socketPath,
    onpipeline(src, dst) {
      t.is(src, serverStream)
      t.is(src._readableState.pipeTo, dst)
    },
    handlers: {
      messages: (params) => {
        t.is(params.result, 'good')
        const stream = new streamx.PassThrough()
        serverStream = stream
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
  const client = new Client({
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

test('server client.at timestamp', async (t) => {
  t.plan(3)
  const server = new Server({
    socketPath,
    handlers: { get: (params) => params.result }
  })
  server.on('client', (client) => {
    t.ok(Number.isInteger(client.at))
    t.ok(Date.now() >= client.at)
  })
  t.teardown(() => server.close())
  const client = new Client({
    socketPath,
    connect: true
  })

  await server.ready()
  await client.ready()

  t.is(await client.get({ result: 'good' }), 'good')
})

test('ipc client clock reaches 0 if client does not responde', async (t) => {
  t.plan(2)
  const server = new Server({
    socketPath
  })
  t.teardown(() => server.close())
  const client = new Client({
    socketPath,
    connect: true
  })
  let pinged = false

  const serverRegister = Server.prototype._register
  const clientRegister = Client.prototype._register

  Server.prototype._register = function (...args) {
    if (this._server === null && this.id > -1) {
      const { _ping } = this._internalHandlers
      this._internalHandlers._ping = (params, client) => {
        pinged = true
        Server.prototype._register = serverRegister
        return _ping(params, client)
      }
      return serverRegister.apply(this, args)
    }
  }
  Client.prototype._register = function (...args) {
    return clientRegister.apply(this, args)
  }

  await server.ready()
  await client.ready()

  client._beat = () => {
    if (server.clients[0].clock === 0) {
      t.is(pinged, true)
      t.pass()
    }
  } // simulate heartbeat failure
})
