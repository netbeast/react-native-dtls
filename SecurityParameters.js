

const crypto = require('react-native-crypto');
const dtls = require('./dtls');
const prf = require('./prf');
const BufferReader = require('./BufferReader');
const SequenceNumber = require('./SequenceNumber');

const SecurityParameters = function (epoch, version) {
  this.epoch = epoch;
  this.version = version;
  this.isServer = true;

  this.entity = dtls.ConnectionEnd.server;

  // Cipher suite prf
  this.prfAlgorithm = dtls.PRFAlgorithm.tlsPrfSha256;

  // Cipher suite cipher
  this.bulkCipherAlgorithm = dtls.BulkCipherAlgorithm.none;
  this.cipherType = dtls.CipherType.block;
  this.encKeyLength = 0;
  this.blockLength = 0;
  this.fixedIvLength = 0;
  this.recordIvLength = 0;

  // Cipher suite mac
  this.macAlgorithm = dtls.MACAlgorithm.none;
  this.macLength = 0;
  this.macKeyLength = 0;

  // Handshake
  this.compressionAlgorithm = dtls.CompressionMethod.none;
  this.masterKey = null;
  this.clientRandom = null;
  this.serverRandom = null;

  this.handshakeDigest = [];

  this.sendSequence = new SequenceNumber();
};

SecurityParameters.prototype.setFrom = function (suite) {
  this.prfAlgorithm = suite.prf;

  this.bulkCipherAlgorithm = suite.cipher.algorithm;
  this.cipherType = suite.cipher.type;
  this.encKeyLength = suite.cipher.keyMaterial;
  this.blockLength = suite.cipher.blockSize;
  this.fixedIvLength = 0;
  this.recordIvLength = suite.cipher.ivSize;

  this.macAlgorithm = suite.mac.algorithm;
  this.macLength = suite.mac.length;
  this.macKeyLength = suite.mac.keyLength;
};

SecurityParameters.prototype.calculateMasterKey = function (preMasterKey) {
  this.preMasterKey = preMasterKey;
  this.masterKey = prf(this.version)(
    preMasterKey,
    'master secret',
    Buffer.concat([
      this.clientRandom,
      this.serverRandom]), 48);
};

SecurityParameters.prototype.init = function () {
  const keyBlock = prf(this.version)(
    this.masterKey,
    'key expansion',
    Buffer.concat([this.serverRandom, this.clientRandom]),
    this.macKeyLength * 2 + this.encKeyLength * 2 + this.recordIvLength * 2);

  const bufferReader = new BufferReader(keyBlock);
  this.clientWriteMacKey = bufferReader.readBytes(this.macKeyLength);
  this.serverWriteMacKey = bufferReader.readBytes(this.macKeyLength);
  this.clientWriteKey = bufferReader.readBytes(this.encKeyLength);
  this.serverWriteKey = bufferReader.readBytes(this.encKeyLength);
  this.clientWriteIv = bufferReader.readBytes(this.recordIvLength);
  this.serverWriteIv = bufferReader.readBytes(this.recordIvLength);

  console.info('Key content');
  console.info('C-Mac:', this.clientWriteMacKey);
  console.info('S-Mac:', this.serverWriteMacKey);
  console.info('C-Key:', this.clientWriteKey);
  console.info('S-Key:', this.serverWriteKey);
  console.info('C-IV: ', this.clientWriteIv);
  console.info('S-IV: ', this.serverWriteIv);
};

SecurityParameters.prototype.getDecipher = function (iv) {
  const key = this.isServer ? this.clientWriteKey : this.serverWriteKey;
  return crypto.createDecipheriv('aes-128-cbc', key, iv);
};

SecurityParameters.prototype.calculateIncomingMac = function (buffer) {
  const key = this.isServer ? this.clientWriteMacKey : this.serverWriteMacKey;
  return this.calculateMac(key, buffer);
};

SecurityParameters.prototype.calculateOutgoingMac = function (buffer) {
  const key = this.isServer ? this.serverWriteMacKey : this.clientWriteMacKey;
  return this.calculateMac(key, buffer);
};

SecurityParameters.prototype.calculateMac = function (key, buffer) {
  const mac = crypto.createHmac('sha1', key);

  // Accept both single buffers and buffer arrays.
  if (buffer instanceof Array) {
    buffer.forEach((b) => { mac.update(b); });
  } else {
    mac.update(buffer);
  }

  return mac.digest();
};

SecurityParameters.prototype.getCipher = function (iv) {
  const key = this.isServer ? this.serverWriteKey : this.clientWriteKey;
  return crypto.createCipheriv('aes-128-cbc', key, iv);
};

SecurityParameters.prototype.resetHandshakeDigest = function () {
  this.handshakeDigest = [];
};

SecurityParameters.prototype.digestHandshake = function (msg) {
  if (!this.handshakeDigest) { return; }

  if (msg instanceof Array) {
    for (const m in msg) { this._digestHandshake(msg[m]); }
  } else { this._digestHandshake(msg); }
};

SecurityParameters.prototype._digestHandshake = function (msg) {
  if (msg.fragment) { msg = msg.fragment; }

  if (!(msg instanceof Buffer)) { throw new Error('Message must be a buffer or containing buffer fragment.'); }

  console.log('Handshake digest:');
  for (let i = 0; i < msg.length; i += 16) {
    console.log(i.toString(16), '\t', msg.slice(i, Math.min(msg.length, i + 16)));
  }
  console.log('Length:', msg.length);

  this.handshakeDigest.push(msg);
};

SecurityParameters.prototype.getHandshakeDigest = function () {
  console.info('Digesting', this.handshakeDigest.length, 'messages');
  const hash = prf(this.version).createHash();
  this.handshakeDigest.forEach((d) => {
    hash.update(d);
  });

  const digest = hash.digest();
  console.log('DIGEST:', digest.toString('hex'));
  return digest;
};

module.exports = SecurityParameters;
