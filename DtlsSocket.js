

const util = require('util');
const EventEmitter = require('events').EventEmitter;
const dgram = require('react-native-udp');

const dtls = require('./dtls');
const SecurityParameterContainer = require('./SecurityParameterContainer');
const DtlsRecordLayer = require('./DtlsRecordLayer');
const ServerHandshakeHandler = require('./ServerHandshakeHandler');
const ClientHandshakeHandler = require('./ClientHandshakeHandler');

const DtlsSocket = function (dgram, rinfo, keyContext, isServer) {
  console.info('New session');

  this.dgram = dgram;
  this.rinfo = rinfo;
  this.keyContext = keyContext;
  this.isServer = isServer;

  this.parameters = new SecurityParameterContainer();
  this.recordLayer = new DtlsRecordLayer(dgram, rinfo, this.parameters);
  this.handshakeHandler = isServer
    ? new ServerHandshakeHandler(this.parameters, this.keyContext, rinfo)
    : new ClientHandshakeHandler(this.parameters);

  this.handshakeHandler.onSend = function (packets, callback) {
    this.recordLayer.send(packets, callback);
  }.bind(this);

  this.handshakeHandler.onHandshake = function () {
    console.info('Handshake done');
    this.emit('secureConnect', this);
  }.bind(this);
};
util.inherits(DtlsSocket, EventEmitter);

DtlsSocket.connect = function (port, address, type, callback) {
  const dgramSocket = dgram.createSocket(type);

  const socket = new DtlsSocket(dgramSocket, { address: address, port: port });
  socket.renegotiate();

  dgramSocket.on('message', socket.handle.bind(socket));

  if (callback) { socket.once('secureConnect', callback); }

  return socket;
};

DtlsSocket.prototype.renegotiate = function () {
  this.handshakeHandler.renegotiate();
};

DtlsSocket.prototype.send = function (buffer, offset, length, callback) {
  // Slice the buffer if we have offset specified and wrap it into a packet
  // structure that holds the message type as well.
  if (offset) { buffer = buffer.slice(offset, offset + length); }

  const packet = {
    type: dtls.MessageType.applicationData,
    buffer: buffer,
  };

  this.recordLayer.send(packet, callback);
};

DtlsSocket.prototype.close = function () {
  if (this.isServer) {
    throw new Error(
      'Attempting to close a server socket. Close the server instead');
  }

  this.dgram.close();
};

DtlsSocket.prototype.handle = function (buffer) {
  const self = this;

  this.recordLayer.getPackets(buffer, (packet) => {
    const handler = DtlsSocket.handlers[packet.type];

    if (!handler) {
      const msgType = dtls.MessageTypeName[packet.type];
      return console.error('Handler not found for', msgType, 'message');
    }

    handler.call(self, packet);
  });
};

DtlsSocket.handlers = [];
DtlsSocket.handlers[dtls.MessageType.handshake] = function (message) {
  this.handshakeHandler.process(message);
};

DtlsSocket.handlers[dtls.MessageType.changeCipherSpec] = function (message) {
  // Record layer does the work here.
  console.info('Changed Cipher Spec');
};

DtlsSocket.handlers[dtls.MessageType.applicationData] = function (message) {
  this.emit('message', message.fragment);
};

module.exports = DtlsSocket;
