'use strict'
const fs = require('fs')
const fsext = require('fs-native-extensions')

class Internal {
  _pinging = true
  _ping (method) { return () => this._pinging && method.request({ beat: 'ping' }) }
}

class API extends Internal {
  #ipc = null

  constructor (ipc) {
    super()
    this.#ipc = ipc
  }

  wakeup (method) {
    return (link, storage, appdev) => method.request({ args: [link, storage, appdev] })
  }

  restart (method) {
    return async (args) => {
      if (this.#ipc.closed || this.#ipc.closing) return
      this._pinging = false

      method.send(args)
    }
  }

  shutdown (method) {
    return async () => {
      if (this.#ipc.closed || this.#ipc.closing) return
      this._pinging = false
      method.send()
      const fd = await new Promise((resolve, reject) => fs.open(this.#ipc._lock, 'r+', (err, fd) => {
        if (err) {
          reject(err)
          return
        }
        resolve(fd)
      }))
      await fsext.waitForLock(fd)
      fsext.unlock(fd)
      await new Promise((resolve, reject) => fs.close(fd, (err) => {
        if (err) {
          reject(err)
          return
        }
        resolve()
      }))
      await this.#ipc.close()
    }
  }
}

module.exports = API
