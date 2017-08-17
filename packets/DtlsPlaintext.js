

const util = require('util');
const Packet = require('./Packet');
const PacketSpec = require('./PacketSpec');
const DtlsProtocolVersion = require('./DtlsProtocolVersion');
const dtls = require('../dtls');

const DtlsPlaintext = function (data) {
  for (const d in data) {
    this[d] = data[d];
  }
};
util.inherits(DtlsPlaintext, Packet);

DtlsPlaintext.prototype.spec = new PacketSpec([

  { type: 'uint8' },
  { version: DtlsProtocolVersion },
  { epoch: 'uint16' },
  { name: 'sequenceNumber', type: 'bytes', size: 48 / 8 },
  { name: 'fragment', type: 'var16' },
]);

const contentTypes = {};
DtlsPlaintext.prototype.getFragmentType = function () {
  const ct = contentTypes[this.type];
  if (!ct) return console.error('Unknown content type:', this.type);

  return ct;
};

DtlsPlaintext.readPackets = function (data) {
  let start = 0;
  const plaintexts = [];
  while (data.length > start) {
    // Start by checking the length:
    const fragmentLength = data.readUInt16BE(start + 11);
    if (data.length < start + (12 + fragmentLength)) { break; }

    const type = data.readUInt8(start, true);
    const version = new DtlsProtocolVersion({
      major: data.readInt8(start + 1, true),
      minor: data.readInt8(start + 2, true),
    });
    const epoch = data.readUInt16BE(start + 3, true);
    const sequenceNumber = data.slice(start + 5, start + 11);
    const fragment = data.slice(start + 13, start + 13 + fragmentLength);

    const dtpt = new DtlsPlaintext({
      type: type,
      version: version,
      epoch: epoch,
      sequenceNumber: sequenceNumber,
      fragment: fragment,
    });

    plaintexts.push(dtpt);

    start += 13 + fragmentLength;
  }

  return plaintexts;
};

DtlsPlaintext.prototype.getBuffer = function () {
  const buffer = new Buffer(13 + this.fragment.length);
  buffer.writeUInt8(this.type, 0, true);
  buffer.writeUInt8(this.version.major, 1, true);
  buffer.writeUInt8(this.version.minor, 2, true);
  buffer.writeUInt16BE(this.epoch, 3, true);
  this.sequenceNumber.copy(buffer, 5, 0, 6);
  buffer.writeUInt16BE(this.fragment.length, 11, true);
  this.fragment.copy(buffer, 13);
  return buffer;
};

contentTypes[dtls.MessageType.handshake] = require('./DtlsHandshake');
contentTypes[dtls.MessageType.changeCipherSpec] = require('./DtlsChangeCipherSpec');

module.exports = DtlsPlaintext;
