'use strict'
const PearIPCRawClient = require('./raw-client')
const API = require('./api')
const constants = require('./constants')
class PearIPCClient extends PearIPCRawClient {
  constructor(opts = {}) {
    super(opts)
    const api = new API(this)
    if (opts.api) Object.assign(api, opts.api)
    this._api = api
  }

  ref() {
    this._heartbeat?.ref()
    return super.ref()
  }

  unref() {
    this._heartbeat?.unref()
    return super.unref()
  }

  _setup() {
    super._setup()
    this._heartbeat = setInterval(() => {
      this._beat()
    }, constants.HEARTBEAT_INTERVAL)
    this._beat()
  }

  async _beat() {
    try {
      await this._ping()
    } catch {
      /* ignore */
    }
  }

  async _close() {
    // never throws, must never throw
    clearInterval(this._heartbeat)
    return super._close()
  }
}

module.exports = PearIPCClient
