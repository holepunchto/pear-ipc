'use strict'
const fs = require('fs')
const fsext = require('fs-native-extensions')

const LOCK_POLL_INTERVAL = 500
const POLL_MAX_TRIES = 20

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

  shutdown (method) {
    return async () => {
      if (this.#ipc.closed || this.#ipc.closing) return
      this._pinging = false
      method.send()
      let tries = 0
      const fd = await new Promise((resolve, reject) => {
        const interval = setInterval(() => {
          fs.open(this.#ipc._lock, 'r+', (err, fd) => {
            if (!err) {
              clearInterval(interval)
              resolve(fd)
            } else {
              tries++
              if (tries > POLL_MAX_TRIES) reject(err)
            }
          })
        }, LOCK_POLL_INTERVAL)
      })

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
