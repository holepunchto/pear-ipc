'use strict'
const fs = require('fs')
const fsext = require('fs-native-extensions')
const PearRPC = require('.')

class API {
  constructor (lock) {
    this.lock = lock
  }
  
  start (method) {
    return (...args) => method.request({ args })
  }

  wakeup (method) {
    return (link, storage, appdev) => method.request({ args: [link, storage, appdev] })
  }
  
  shutdown (method) {
    return async () => {
      method.send()
  
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


class PearClient extends PearRPC {
  constructor (opts = {}) {
    const lock = path.join(global.Pear?.config.pearDir || opts.pearDir, 'corestores', 'platform', 'primary-key')
    const api = new API(lock)
    opts.api = opts.api ? { ...api, ...opts.api } : api
    super(opts)
  }
}

module.exports = PearClient