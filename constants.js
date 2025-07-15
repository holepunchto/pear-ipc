const { isWindows, isMac } = require('which-runtime')
const path = require('path')
const os = require('os')

const PEAR_DIR = global.Pear?.config.pearDir || (isMac
  ? path.join(os.homedir(), 'Library', 'Application Support', 'pear')
  : isWindows
    ? path.join(os.homedir(), 'AppData', 'Roaming', 'pear')
    : path.join(os.homedir(), '.config', 'pear'))

const CONNECT_TIMEOUT = 20_000
const HEARTBEAT_INTERVAL = 1500
const HEARTBEAT_CLOCK = 20
const HEARTBEAT_THRESHOLD = 3
const ILLEGAL_METHODS = new Set(['id', 'userData', 'clients', 'hasClients', 'client', 'ref', 'unref', 'ready', 'opening', 'opened', 'close', 'closing', 'closed'])

module.exports = {
  PEAR_DIR,
  CONNECT_TIMEOUT,
  HEARTBEAT_INTERVAL,
  HEARTBEAT_CLOCK,
  HEARTBEAT_THRESHOLD,
  ILLEGAL_METHODS
}
