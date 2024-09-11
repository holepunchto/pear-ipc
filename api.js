'use strict'
class Internal {
  _ping (method) { return () => {
    // console.trace('API _ping')
    return method.request({ beat: 'ping' })
   } }
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
      await this.#ipc.waitForLock()
    }
  }
}

module.exports = API
