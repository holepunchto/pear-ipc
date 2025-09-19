# `pear-ipc`

IPC for Pear

```
npm install pear-ipc
```

## API

```js
const IPC = require('pear-ipc')
```

```js
import IPC from 'pear-ipc'
```

### `const server = new IPC.Server(opts)`

Create a server IPC instance with automatic RPC method handling configured via `methods` option.

#### Options

- `socketPath` `<String>` - Path to Unix socket / Windows pipe file
- `methods` `<Array... { id: <Number[int]>, name: <String>, stream: <Boolean(false)>, send: <Boolean(false)> }>` - an index of method descriptions. The order of methods (and their settings) must be consistent across all RPC instances using the same method set. The index of a method in the array is that methods uint identifier. `['myMethod']` and `[{name: 'myMethod'}]` are equivalent. Generated methods default to being request-based (`stream:false` and `send:false`). Setting `send: true` will generate a fire-and-forget method. Setting `stream: true` will generate a method that returns a [Streamx](https://github.com/mafintosh/streamx) stream response. For more complex cases, the `api` option can be used to wrap define the instance method. Base Properties and Base Methods are illegal RPC method names. See [methods.js](methods.js) for example structure.
- `handlers` - `{ [name]: (params) => <Stream|Promise|Any> }` - Handle incoming calls. Property names on the `handlers` object matching names in the `methods` array passed the incoming `params` object. It is up to the handler to return the correct response for that method.
- `onpipeline` `<Function>` - IPC server pipelines streams returned from handlers to rpc streams. If supplied this function is called each time: `onpipeline(src, dst)`
- `stream` `<Duplex>` - Advanced. Set a custom transport stream

### `const client = new IPC.Client(opts)`

Create a client IPC instance with automatic RPC method setting configured via `methods` option.

#### Options

- `socketPath` `<String>` - Path to Unix socket / Windows pipe file
- `connectTimeout` `<Number[ms]>` - Fail after given milliseconds if unable to connect
- `connect` `<Boolean>|<Function>` - If truthy, attempt to connect. If a function, pear-ipc calls it to boot sidecar.
- `methods` `<Array... { id: <Number[int]>, name: <String>, stream: <Boolean(false)>, send: <Boolean(false)> }>` - an index of method descriptions. The order of methods (and their settings) must be consistent across all RPC instances using the same method set. The index of a method in the array is that methods uint identifier. `['myMethod']` and `[{name: 'myMethod'}]` are equivalent. Generated methods default to being request-based (`stream:false` and `send:false`). Setting `send: true` will generate a fire-and-forget method. Setting `stream: true` will generate a method that returns a [Streamx](https://github.com/mafintosh/streamx) stream response. For more complex cases, the `api` option can be used to wrap define the instance method. Base Properties and Base Methods are illegal RPC method names. See [methods.js](methods.js) for example structure.
- `api` `{ [name]: (method) => (params) => <Stream|Promise|Any> }` - Define outgoing methods on the RPC instance. Property names on the `api` object matching names in the `methods` array will be used to generate instance methods if provided. A [tiny-buffer-rpc](https://github.com/holepunchto/tiny-buffer-rpc/) `method` object will be passed. Call any/all of `method.request` `method.send` or `method.createRequestStream` and make any other calls or alterations as needed.
- `stream` `<Duplex>` - Advanced. Set a custom transport stream

#### Default RPC Methods

Default method declarations can be found in [methods.js](methods.js).

#### Base Server Methods

- `ipc.ready()` - begin listening
- `ipc.client(id)` - get IPC server client instance by `ipc.id`
- `ipc.ref()` - reference as active handle
- `ipc.unref()` - unreference as active handle
- `ipc.close()` - close the server IPC instance

#### Base Client Methods

- `ipc.ready()` - connect to server
- `ipc.ref()` - reference as active handle
- `ipc.unref()` - unreference as active handle
- `ipc.close()` - close the client IPC instance

#### Base Server Properties

- `ipc.id` - Instance ID
- `ipc.clients` - IPC server instance array of IPC client instances
- `ipc.hasClients` - Boolean. Whether IPC server has client instances
- `ipc.opening` - Promise that resolves on open
- `ipc.opened` - Boolean. Server has started
- `ipc.closing` - Promise that resolves on close
- `ipc.closed` - Boolean. Server has shutdown
- `ipc.clients.clock` - A heartbeat counter. If it reaches 0, the client is considered unresponsive and its stream is destroyed

#### Base Client Properties

- `ipc.id` - Instance ID
- `ipc.userData` - Default: `null`. Set `ipc.userData` to an object to efficiently hold client metadata
- `ipc.opening` - Promise that resolves on open
- `ipc.opened` - Boolean. Client has connected
- `ipc.closing` - Promise that resolves on close
- `ipc.closed` - Boolean. Client has disconnected

## License

Apache-2.0
