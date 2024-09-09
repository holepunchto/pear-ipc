'use strict'
const test = require('brittle')
const streamx = require('streamx')
const IPC = require('.')

test('ipc request', async (t) => {
  t.plan(1)
  const server = new IPC({
    socketPath: 'test.sock',
    handlers: { start: (params) => params.result }
  })
  t.teardown(() => server.close())
  const client = new IPC({
    socketPath: 'test.sock',
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
    socketPath: 'test.sock',
    handlers: { start: (params) => params.result }
  })
  t.teardown(() => server.close())
  const client = new IPC({
    socketPath: 'test.sock',
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
    socketPath: 'test.sock',
    handlers: {
      messages: (params) => {
        t.is(params.result, 'good')
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
    socketPath: 'test.sock',
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
    socketPath: 'test.sock',
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
    socketPath: 'test.sock',
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