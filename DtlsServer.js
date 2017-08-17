

const util = require('util');
const EventEmitter = require('events').EventEmitter;
const DtlsSocket = require('./DtlsSocket');
const KeyContext = require('./KeyContext');

const DtlsServer = function (dgramSocket, options) {
  this.dgram = dgramSocket;
  this.keyContext = new KeyContext(options);

  this.sockets = {};

  this.dgram.on('message', this._onMessage.bind(this));
};
util.inherits(DtlsServer, EventEmitter);

DtlsServer.createServer = function (options, callback) {
  const dgram = require('react-native-udp');

  const dgramSocket = dgram.createSocket(options);
  const dtlsServer = new DtlsServer(dgramSocket, options);

  if (callback) { dtlsServer.on('message', callback); }

  return dtlsServer;
};

DtlsServer.prototype.close = function () {
  this.dgram.close();
};


DtlsServer.prototype.bind = function (port) {
  if (!this.keyContext) {
    throw new Error(
      'Cannot act as a server without a certificate. ' +
      'Use options.cert to specify certificate.');
  }

  this.dgram.bind(port);
};

DtlsServer.prototype._onMessage = function (message, rinfo) {
  const socketKey = `${rinfo.address}:${rinfo.port}`;
  let socket = this.sockets[socketKey];
  if (!socket) {
    this.sockets[socketKey] = socket =
      new DtlsSocket(this.dgram, rinfo, this.keyContext, true);

    socket.once('secureConnect', (socket) => {
      console.info('Handshake done');
      this.emit('secureConnection', socket);
    });
  }

  socket.handle(message);
};

module.exports = DtlsServer;
