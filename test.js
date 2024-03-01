'use strict'
const test = require('brittle')
const streamx = require('streamx')
const RPC = require('.')

test('rpc request', async (t) => {
  t.plan(2)

  const methods = ['test', 'more']

  const handlers = {
    someother () { },
    test (params) {
      t.is(params.result, 'good')
      return params.result
    },
    other () {}
  }

  const server = new RPC({
    methods,
    handlers,
    stream: new streamx.Duplex({
      write (data, cb) {
        client.stream.push(data)
        cb()
      }
    })
  })
  const client = new RPC({
    methods,
    stream: new streamx.Duplex({
      write (data, cb) {
        server.stream.push(data)
        cb()
      }
    })
  })
  await server.ready()
  await client.ready()
  t.is(await client.test({ result: 'good' }), 'good')
})

test('rpc request api wrapped', async (t) => {
  t.plan(2)

  const methods = ['test', 'more']

  const handlers = {
    someother () { },
    test (params) {
      t.is(params.result, 'good')
      return params.result
    },
    other () {}
  }

  const api = {
    test (method) {
      return async (params) => {
        const result = await method.request(params)
        return 'very ' + result
      }
    }
  }

  const server = new RPC({
    methods,
    handlers,
    stream: new streamx.Duplex({
      write (data, cb) {
        client.stream.push(data)
        cb()
      }
    })
  })
  const client = new RPC({
    methods,
    api,
    stream: new streamx.Duplex({
      write (data, cb) {
        server.stream.push(data)
        cb()
      }
    })
  })
  await server.ready()
  await client.ready()
  t.is(await client.test({ result: 'good' }), 'very good')
})

test('rpc stream', async (t) => {
  t.plan(4)

  const methods = [{ name: 'test', stream: true }, 'more']

  const handlers = {
    someother () { },
    test (params) {
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
    },
    other () {}
  }

  const server = new RPC({
    methods,
    handlers,
    stream: new streamx.Duplex({
      write (data, cb) {
        client.stream.push(data)
        cb()
      }
    })
  })
  const client = new RPC({
    methods,
    stream: new streamx.Duplex({
      write (data, cb) {
        server.stream.push(data)
        cb()
      }
    })
  })
  await server.ready()
  await client.ready()
  const stream = client.test({ result: 'good' })
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
  stream.end()
})

test('rpc stream api wrapped', async (t) => {
  t.plan(4)

  const methods = [{ name: 'test', stream: true }, 'more']

  const handlers = {
    someother () { },
    test (params) {
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
    },
    other () {}
  }

  const api = {
    test (method) {
      return (params) => {
        const stream = method.createRequestStream()
        stream.write({ result: 'very ' + params.result })
        return stream
      }
    }
  }

  const server = new RPC({
    methods,
    handlers,
    stream: new streamx.Duplex({
      write (data, cb) {
        client.stream.push(data)
        cb()
      }
    })
  })
  const client = new RPC({
    api,
    methods,
    stream: new streamx.Duplex({
      write (data, cb) {
        server.stream.push(data)
        cb()
      }
    })
  })
  await server.ready()
  await client.ready()
  const stream = client.test({ result: 'good' })
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
  stream.end()
})

test('rpc stream from async iterator handler', async (t) => {
  t.plan(4)

  const methods = [{ name: 'test', stream: true }, 'more']

  const handlers = {
    someother () { },
    async * test (params) {
      t.is(params.result, 'good')
      yield 'ex'
      await null
      yield 'streamly'
      await null
      yield params.result
    },
    other () {}
  }

  const server = new RPC({
    methods,
    handlers,
    stream: new streamx.Duplex({
      write (data, cb) {
        client.stream.push(data)
        cb()
      }
    })
  })
  const client = new RPC({
    methods,
    stream: new streamx.Duplex({
      write (data, cb) {
        server.stream.push(data)
        cb()
      }
    })
  })
  await server.ready()
  await client.ready()
  const stream = client.test({ result: 'good' })
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
  stream.end()
})

test('rpc send', async (t) => {
  t.plan(4)

  const methods = [{ name: 'test', send: true }, { name: 'response', stream: true }]
  const responseStream = new streamx.PassThrough()

  const handlers = {
    response () { return responseStream },
    test (params) {
      t.is(params.result, 'good')
      responseStream.push('ex')
      setImmediate(() => {
        responseStream.push('streamly')
        setImmediate(() => {
          responseStream.push(params.result)
        })
      })
    },
    other () {}
  }

  const server = new RPC({
    methods,
    handlers,
    stream: new streamx.Duplex({
      write (data, cb) {
        client.stream.push(data)
        cb()
      }
    })
  })
  const client = new RPC({
    methods,
    stream: new streamx.Duplex({
      write (data, cb) {
        server.stream.push(data)
        cb()
      }
    })
  })
  await server.ready()
  await client.ready()
  const stream = client.response()
  client.test(({ result: 'good' }))
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
  stream.end()
})

test('rpc send api wrapped', async (t) => {
  t.plan(4)

  const methods = [{ name: 'test', send: true }, { name: 'response', stream: true }]
  const responseStream = new streamx.PassThrough()

  const handlers = {
    response () { return responseStream },
    test (params) {
      t.is(params.result, 'very good')
      responseStream.push('ex')
      setImmediate(() => {
        responseStream.push('streamly')
        setImmediate(() => {
          responseStream.push(params.result)
        })
      })
    },
    other () {}
  }

  const api = {
    test (method) {
      return (params) => {
        method.send({ result: 'very ' + params.result })
      }
    }
  }

  const server = new RPC({
    methods,
    handlers,
    stream: new streamx.Duplex({
      write (data, cb) {
        client.stream.push(data)
        cb()
      }
    })
  })
  const client = new RPC({
    api,
    methods,
    stream: new streamx.Duplex({
      write (data, cb) {
        server.stream.push(data)
        cb()
      }
    })
  })
  await server.ready()
  await client.ready()
  const stream = client.response()
  client.test(({ result: 'good' }))
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
  stream.end()
})
