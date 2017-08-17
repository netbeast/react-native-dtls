

const crypto = require('react-native-crypto');

const DtlsPlaintext = require('./packets/DtlsPlaintext');
const DtlsProtocolVersion = require('./packets/DtlsProtocolVersion');
const dtls = require('./dtls');

const DtlsRecordLayer = function (dgram, rinfo, parameters) {
  this.dgram = dgram;
  this.rinfo = rinfo;

  this.parameters = parameters;

  this.receiveEpoch = 0;
  this.sendEpoch = 0;
  this.version = new DtlsProtocolVersion({ major: ~1, minor: ~0 });
};

DtlsRecordLayer.prototype.getPackets = function (buffer, callback) {
  const packets = DtlsPlaintext.readPackets(buffer);
  for (const p in packets) {
    const packet = packets[p];

    // Ignore early packets.
    // TODO: Buffer these
    if (packet.epoch > this.receiveEpoch) { continue; }

    // Get the security parameters. Ignore the packet if we don't have
    // the parameters for the epoch.
    const parameters = this.parameters.get(packet);
    if (!parameters) {
      console.warn('Packet with unknown epoch:', packet.epoch);
      continue;
    }

    if (parameters.bulkCipherAlgorithm) {
      this.decrypt(packet);
    }

    if (parameters.compressionAlgorithm) {
      this.decompress(packet);
    }

    if (packet.type === dtls.MessageType.changeCipherSpec) {
      if (packet.epoch !== this.receiveEpoch) { continue; }

      this.parameters.changeCipher(packet.epoch);
      this.receiveEpoch = this.parameters.current;
    }

    callback(packet);
  }
};

DtlsRecordLayer.prototype.send = function (msg, callback) {
  const buffers = [];
  if (!(msg instanceof Array)) { msg = [msg]; }

  for (const m in msg) {
    if (msg[m].__epoch === undefined) { msg[m].__epoch = this.sendEpoch; }

    const parameters = this.parameters.getCurrent(msg[m].__epoch);

    if (msg[m].__sequenceNumber) { parameters.sendSequence.setNext(msg[m].__sequenceNumber); }

    const envelope = new DtlsPlaintext({
      type: msg[m].type,
      version: parameters.version || this.version,
      epoch: msg[m].__epoch,
      sequenceNumber: parameters.sendSequence.next(),
      fragment: msg[m].getBuffer ? msg[m].getBuffer() : msg[m].buffer,
    });

    if (!parameters) {
      console.error('Local epoch parameters not found:', this.sendEpoch);
      return;
    }

    if (parameters.bulkCipherAlgorithm) {
      this.encrypt(envelope);
    }

    buffers.push(envelope.getBuffer());
    if (msg[m].type === dtls.MessageType.changeCipherSpec &&
      !msg[m].__sent) {
      console.info('Change cipher spec');
      this.sendEpoch++;
    }

    msg[m].__sent = true;
  }

  this.sendInternal(buffers, callback);
};

DtlsRecordLayer.prototype.sendInternal = function (buffers, callback) {
  // Define the single packet callback only if the caller was interested in a
  // callback.
  let singlePacketCallback = null;
  let pending = 0;
  if (callback) {
    const errors = [];
    singlePacketCallback = function (err) {
      if (err) errors.push(err);
      if (--pending === 0) {
        callback(errors.length ? errors : null);
      }
    };
  }

  let flight = [buffers.shift()];
  let flight_length = flight[0].length;
  while (buffers.length > 0) {
    if (buffers[0].length + flight_length > 1000) {
      pending++;
      this.dgram.send(Buffer.concat(flight),
        0, flight_length,
        this.rinfo.port, this.rinfo.address, singlePacketCallback);

      flight_length = 0;
      flight = [];
    }

    flight_length += buffers[0].length;
    flight.push(buffers.shift());
  }

  pending++;
  this.dgram.send(flight.length === 1 ? flight[0] : Buffer.concat(flight),
    0, flight_length,
    this.rinfo.port, this.rinfo.address, singlePacketCallback);
};

DtlsRecordLayer.prototype.decrypt = function (packet) {
  const parameters = this.parameters.get(packet);

  const iv = packet.fragment.slice(0, parameters.recordIvLength);
  const ciphered = packet.fragment.slice(parameters.recordIvLength);

  // Decrypt the fragment
  const cipher = parameters.getDecipher(iv);
  cipher.setAutoPadding(false);
  let decrypted = Buffer.concat([
    cipher.update(ciphered),
    cipher.final()]);

  // Remove the padding.
  const padding = decrypted[decrypted.length - 1];
  decrypted = decrypted.slice(0, decrypted.length - padding - 1);

  // Remove the MAC
  packet.fragment = decrypted.slice(0, decrypted.length - 20);
  let mac = decrypted.slice(packet.fragment.length);

  // Verify MAC
  const header = this.getMacHeader(packet);
  const expectedMac = parameters.calculateIncomingMac([header, packet.fragment]);
  mac = mac.slice(0, expectedMac.length);
  if (!mac.slice(0, expectedMac.length).equals(expectedMac)) {
    throw new Error(
      `Mac mismatch: ${expectedMac.toString('hex')} vs ${mac.toString('hex')}\n` +
      `Full fragment: ${iv.toString('hex')} - ${ciphered.toString('hex')}\n` +
      `Keys:\n${
        parameters.clientWriteMacKey.toString('hex')}\n${
        parameters.serverWriteMacKey.toString('hex')}\n${
        parameters.clientWriteKey.toString('hex')}\n${
        parameters.serverWriteKey.toString('hex')}\n${
        parameters.clientWriteIv.toString('hex')}\n${
        parameters.serverWriteIv.toString('hex')}`);
  }
};

DtlsRecordLayer.prototype.encrypt = function (packet) {
  const parameters = this.parameters.get(packet);

  // Figure out MAC
  const iv = crypto.pseudoRandomBytes(16);
  const header = this.getMacHeader(packet);
  const mac = parameters.calculateOutgoingMac([header, packet.fragment]);

  const cipher = parameters.getCipher(iv);

  const blockSize = 16;
  const overflow = (iv.length + packet.fragment.length + mac.length + 1) % blockSize;
  const padAmount = (overflow === 0) ? 0 : (blockSize - overflow);
  const padding = new Buffer([padAmount]);

  cipher.write(iv); // The first chunk is used as IV and it's content is garbage.
  cipher.write(packet.fragment);
  cipher.write(mac);
  cipher.write(padding);
  cipher.end();

  packet.fragment = cipher.read();
};

DtlsRecordLayer.prototype.getMacHeader = function (packet) {
  const header = new Buffer(13);
  header.writeUInt16BE(packet.epoch, 0);
  packet.sequenceNumber.copy(header, 2);
  header.writeUInt8(packet.type, 8);
  header.writeInt8(packet.version.major, 9);
  header.writeInt8(packet.version.minor, 10);
  header.writeUInt16BE(packet.fragment.length, 11);

  return header;
};

module.exports = DtlsRecordLayer;
