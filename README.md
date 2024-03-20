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

### `const ipc = new IPC(opts)`

**Options**

* `socketPath` `<String>` - Path to Unix socket / Windows pipe file
* `connectTimeout` `<Number[ms]>` - Fail after given milliseconds if unable to connect
* `connect` `<Boolean>|<Function>` - If truthy, attempt to connect. If a function, pear-ipc calls it to boot sidecar.
* `methods` `<Array... { id: <Number[int]>, name: <String>, stream: <Boolean(false)>, send: <Boolean(false)> }>` - an index of method descriptions. The order of methods (and their settings) must be consistent across all RPC instances using the same method set. The index of a method in the array is that methods uint identifier. `['myMethod']` and `[{name: 'myMethod'}]` are equivalent. Generated methods default to being request-based (`stream:false` and `send:false`). Setting `send: true` will generate a fire-and-forget method. Setting `stream: true` will generate a method that returns a [Streamx][https://github.com/mafintosh/streamx] stream response. For more complex cases, the `api` option can be used to wrap define the instance method.
* `api` `{ [name]: (method) => (params) => <Stream|Promise|Any> }` - Define outgoing methods on the RPC instance. Property names on the `api` object matching names in the `methods` array will be used to generate instance methods if provided. A [tiny-buffer-rpc](https://github.com/holepunchto/tiny-buffer-rpc/) `method` object will be passed. Call any/all of `method.request` `method.send` or `method.createRequestStream` and make any other calls or alterations as needed.
* `handlers` - `{ [name]: (params) => <Stream|Promise|Any> }` - Handle incoming calls. Property names on the `handlers` object matching names in the `methods` array passed the incoming `params` object. It is up to the handler to return the correct response for that method. 
* `stream` `<Duplex>` - Advanced. Set a custom transport stream


## License

Apache-2.0