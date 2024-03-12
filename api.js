'use strict'
const fs = require('fs')
const fsext = require('fs-native-extensions')

class API {
  constructor (lock) {
    this.lock = lock
  }

  wakeup (method) {
    return (link, storage, appdev) => method.request({ args: [link, storage, appdev] })
  }

  shutdown (method) {
    return async () => {
      method.send()
      if (!this.lock) return
      const fd = await new Promise((resolve, reject) => fs.open(this.lock, 'r+', (err, fd) => {
        if (err) {
          reject(err)
          return
        }
        resolve(fd)
      }))

      await fsext.waitForLock(fd)

      await new Promise((resolve, reject) => fs.close(fd, (err) => {
        if (err) {
          reject(err)
          return
        }
        resolve()
      }))
    }
  }
}

module.exports = API
