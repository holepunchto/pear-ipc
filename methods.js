'use strict'

const stream = (name) => ({ name, stream: true })
const send = (name) => ({ name, send: true })
const methods = [
  stream('info'),
  stream('dump'),
  stream('seed'),
  stream('stage'),
  stream('release'),
  stream('messages'),
  'message',
  'config',
  stream('reconfig'),
  'checkpoint',
  'versions',
  'address',
  'detached',
  'trust',
  'identify',
  'wakeup',
  'warming',
  'warmup',
  'start',
  'restart',
  'unloading',
  'closeClients',
  'createReport',
  stream('reports'),
  send('shutdown'),

  // deprecated, assess for removal from May 2024
  'setPreference',
  'getPreference',
  stream('iteratePreferences'),
  stream('preferencesUpdates')

]

module.exports = methods
