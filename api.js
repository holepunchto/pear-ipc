'use strict'
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
      method.send()
      this._pinging = false
      await this.#ipc.constructor.waitForLock(this.#ipc._lock)
    }
  }
}

module.exports = API
