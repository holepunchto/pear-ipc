'use strict'
class Internal {
  constructor (ipc) { this._ipc = ipc }
  _shutting = false
  _ping (method) {
    return () => {
      const ping = this._shutting === false && this._ipc.closed === false
      return ping && method.request({ beat: 'ping' })
    }
  }
}

class API extends Internal {
  wakeup (method) {
    return (link, storage, appdev) => method.request({ args: [link, storage, appdev] })
  }

  shutdown (method) {
    return async () => {
      method.send()
      this._shutting = true
      await this._ipc.constructor.waitForLock(this._ipc._lock)
    }
  }
}

module.exports = API
