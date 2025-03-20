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
      const fd = await new Promise((resolve, reject) => {
        let tries = 0
        let interval = null
        const poll = () => {
          fs.open(this.#ipc._lock, 'r+', (err, fd) => {
            if (!err) {
              clearInterval(interval)
              resolve(fd)
            } else {
              tries++
              if (tries > POLL_MAX_TRIES) {
                clearInterval(interval)
                reject(err)
              }
            }
          })
        }
        interval = setInterval(poll, LOCK_POLL_INTERVAL)
        poll()
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
