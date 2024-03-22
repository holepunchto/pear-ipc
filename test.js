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

// test('ipc send (/w custom methods) ', async (t) => {
//   t.plan(4)

//   const methods = [{ id: 888, name: 'test', send: true }, { id: 889, name: 'response', stream: true }]
//   const responseStream = new streamx.PassThrough()

//   const handlers = {
//     response () { return responseStream },
//     test (params) {
//       console.log('test', params)
//       t.is(params.result, 'good')
//       responseStream.push('ex')
//       setImmediate(() => {
//         responseStream.push('streamly')
//         setImmediate(() => {
//           responseStream.push(params.result)
//         })
//       })
//     }
//   }

//   const server = new IPC({
//     socketPath: 'test.sock',
//     methods,
//     handlers
//   })
//   t.teardown(() => server.close())
//   const client = new IPC({
//     socketPath: 'test.sock',
//     methods
//   })
//   await server.ready()
//   await client.ready()
//   const stream = client.response()
//   client.test(({ result: 'good' }))
//   let count = 0
//   for await (const data of stream) {
//     count += 1
//     if (count === 1) t.is(data, 'ex')
//     if (count === 2) t.is(data, 'streamly')
//     if (count === 3) {
//       t.is(data, 'good')
//       break
//     }
//   }
//   stream.end()
// })

// test('ipc send api wrapped', async (t) => {
//   t.plan(4)

//   const methods = [{ name: 'test', send: true }, { name: 'response', stream: true }]
//   const responseStream = new streamx.PassThrough()

//   const handlers = {
//     response () { return responseStream },
//     test (params) {
//       t.is(params.result, 'very good')
//       responseStream.push('ex')
//       setImmediate(() => {
//         responseStream.push('streamly')
//         setImmediate(() => {
//           responseStream.push(params.result)
//         })
//       })
//     },
//     other () {}
//   }

//   const api = {
//     test (method) {
//       return (params) => {
//         method.send({ result: 'very ' + params.result })
//       }
//     }
//   }

//   const server = new IPC({
//     methods,
//     handlers,
//     stream: new streamx.Duplex({
//       write (data, cb) {
//         client.stream.push(data)
//         cb()
//       }
//     })
//   })
//   const client = new IPC({
//     api,
//     methods,
//     stream: new streamx.Duplex({
//       write (data, cb) {
//         server.stream.push(data)
//         cb()
//       }
//     })
//   })
//   await server.ready()
//   await client.ready()
//   const stream = client.response()
//   client.test(({ result: 'good' }))
//   let count = 0
//   for await (const data of stream) {
//     count += 1
//     if (count === 1) t.is(data, 'ex')
//     if (count === 2) t.is(data, 'streamly')
//     if (count === 3) {
//       t.is(data, 'very good')
//       break
//     }
//   }
//   stream.end()
// })

// test('ipc request over socket with tryboot bootstrap', async (t) => {
//   const socketPath = path.join(__dirname, 'test.sock')

//   t.teardown(() => fs.promises.unlink(socketPath).catch(noop))

//   const methods = ['test', 'more']

//   const handlers = {
//     someother () { },
//     test (params) {
//       t.is(params.result, 'good')
//       return params.result
//     },
//     other () {}
//   }

//   const client = new IPC({
//     methods,
//     socketPath,
//     async tryboot () {
//       const server = new IPC({
//         methods,
//         handlers,
//         socketPath
//       })
//       t.teardown(() => server.close())
//       await server.ready()
//     }
//   })
//   t.teardown(() => client.close())
//   await client.ready()

//   t.is(await client.test({ result: 'good' }), 'good')
// })

// test('opt.stream as transport', async (t) => {
//   t.plan(1)
//   const server = new IPC({
//     handlers: { start: (params) => params.result },
//     stream: new streamx.Duplex({
//       write (data, cb) {
//         client.stream.push(data)
//         cb()
//       }
//     })
//   })
//   t.teardown(() => server.close())
//   const client = new IPC({
//     stream: new streamx.Duplex({
//       write (data, cb) {
//         server.stream.push(data)
//         cb()
//       }
//     })
//   })
//   t.teardown(() => server.close())
//   await server.ready()
//   await client.ready()
//   t.is(await client.start({ result: 'good' }), 'good')
// })
