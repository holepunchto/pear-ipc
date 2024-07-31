'use strict'

class API {
  #ipc = null

  constructor (ipc) {
    this.#ipc = ipc
  }

  wakeup (method) {
    return (link, storage, appdev) => method.request({ args: [link, storage, appdev] })
  }

  shutdown (method) {
    return async () => {
      method.send()
      await this.#ipc.waitForLock()
    }
  }
}

module.exports = API
