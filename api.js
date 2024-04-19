'use strict'
const os = require('os')
const fs = require('fs')
const path = require('path')
const fsext = require('fs-native-extensions')
const { isWindows, isMac } = require('which-runtime')

const PEAR_DIR = isMac
  ? path.join(os.homedir(), 'Library', 'Application Support', 'pear')
  : isWindows
    ? path.join(os.homedir(), 'AppData', 'Roaming', 'pear')
    : path.join(os.homedir(), '.config', 'pear')

class API {

  wakeup (method) {
    return (link, storage, appdev) => method.request({ args: [link, storage, appdev] })
  }

  shutdown (method) {
    return async () => {
      method.send()
      const lock = path.join(PEAR_DIR, 'corestores', 'platform', 'primary-key')
      const fd = await new Promise((resolve, reject) => fs.open(lock, 'r+', (err, fd) => {
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
