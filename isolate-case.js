const { isBare, isWindows } = require('which-runtime')
const Pipe = isBare ? require('bare-pipe') : require('net')
const path = isBare ? require('bare-path') : require('path')
const fs = isBare ? require('bare-fs') : require('fs')

const socketPath = isWindows ? '\\\\.\\pipe\\test-pipe' : path.join(__dirname, 'test.sock')

if (!isWindows) try { fs.unlinkSync(socketPath) } catch { }

function makePipe () {
  if (isBare) return new Pipe(socketPath)
  const sock = new Pipe.Socket()
  sock.setNoDelay(true)
  sock.connect(socketPath)
  return sock
}

const server = Pipe.createServer((pipe) => {
  console.log('Client connected')

  pipe.on('end', () => {
    console.log('Server stream end event fired')
  })

  pipe.on('close', () => {
    console.log('Server stream close event fired')
    server.close()
  })

  pipe.write('Hello\n')

  setTimeout(() => {
    console.log('Server closing connection')
    pipe.end()
  }, 500)
})

server.listen(socketPath, () => {
  console.log('Server listening on', socketPath)

  const client = makePipe()

  client.on('data', (data) => {
    console.log('Client received:', data.toString())
  })

  client.on('end', () => {
    console.log('Client stream end event fired')
  })

  client.on('close', () => {
    console.log('Client stream close event fired, closing')
  })
})

