'use strict'
class Internal {
  constructor (ipc) { this._ipc = ipc }
  _ping (method) {
    return () => {
      const ping = !this._ipc._shutting && !this._ipc.closed && !this._ipc.closing
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
      this._ipc._shutting = true
      await this._ipc.constructor.waitForLock(this._ipc._lock)
    }
  }
}

module.exports = API
