'use strict'

const stream = (name) => ({ name, stream: true })

const methods = [
  stream('info'),
  stream('dump'),
  stream('seed'),
  stream('stage'),
  stream('release'),
  stream('messages'),
  'message',
  'config',
  'checkpoint',
  'versions',
  'address',
  'detached',
  'trust',
  'identify',
  'wakeup',
  'start',
  'restart',
  'unloading',
  'shutdown',
  'closeClients'
]

module.exports = methods
