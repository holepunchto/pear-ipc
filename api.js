'use strict'

class Internal {
  _pinging = true
  _ping(method) {
    return () => this._pinging && method.request({ beat: 'ping' })
  }
}

class API extends Internal {
  #ipc = null

  constructor(ipc) {
    super()
    this.#ipc = ipc
  }

  wakeup(method) {
    return (link, storage, appdev, selfwake, startId) =>
      method.request({ args: [link, storage, appdev, selfwake, startId] })
  }

  shutdown(method) {
    return async () => {
      if (this.#ipc.closed || this.#ipc.closing) return
      this._pinging = false
      method.send()
      await this.#ipc.close()
    }
  }
}

module.exports = API
