

const DtlsHandshake = require('./packets/DtlsHandshake');

const HandshakeBuilder = function () {
  this.buffers = {};
  this.merged = {};

  this.messageSeqToDecode = 0;
  this.messageSeqToRead = 0;

  this.outgoingMessageSeq = 0;

  this.packetLength = 1000;
};

HandshakeBuilder.prototype.createHandshakes = function (message) {
  let handshakes = [];

  // If parameter was an array, recurse into this function with single values.
  if (message instanceof Array) {
    for (const m in message) { handshakes = handshakes.concat(this.createHandshakes(message[m])); }
    return handshakes;
  }

  const buffer = message.getBuffer();
  const handshake = new DtlsHandshake({
    msgType: message.messageType,
    length: buffer.length,
    messageSeq: this.outgoingMessageSeq,
    fragmentOffset: 0,
    body: buffer,
  });
  this.outgoingMessageSeq++;

  return handshake;
};

HandshakeBuilder.prototype.fragmentHandshakes = function (packet) {
  let packets = [];

  // If parameter was an array, recurse into this function with single values.
  if (packet instanceof Array) {
    for (const p in packet) { packets = packets.concat(this.fragmentHandshakes(packet[p])); }
    return packets;
  }

  if (packet instanceof DtlsHandshake) { packet = packet.getBuffer(); }

  // Get the raw body.
  // The header before body includes:
  // msgType        : uint8  (1 byte),
  // length         : uint24 (3 bytes),
  // messageSeq     : uint16 (2 bytes),
  // fragmentOffset : uint24 (3 bytes),
  // bodyLength     : uint24 (3 bytes)
  let remainingBody = packet.slice(1 + 3 + 2 + 3 + 3);

  // Create the fragments
  // Make sure there is at least one fragment even if body is 0 bytes.
  let offset = 0;
  let first = true;
  while (first || remainingBody.length) {
    first = false;

    // Create each handshake message and insert the fragment into it.
    const fragmentSize = Math.min(this.packetLength, remainingBody.length);
    packets.push(new DtlsHandshake({
      msgType: packet.readUInt8(0),
      length: packet.readUInt32BE(0) & 0x00ffffff,
      messageSeq: packet.readUInt16BE(4),
      fragmentOffset: offset,
      body: remainingBody.slice(0, fragmentSize),
    }));

    // Advance the packet
    remainingBody = remainingBody.slice(fragmentSize);
    offset += fragmentSize;
  }

  return packets;
};

HandshakeBuilder.prototype.add = function (handshake) {
  // Ignore this if it's part of a handshake we've already read.
  if (handshake.messageSeq < this.messageSeqToDecode) {
    console.warn('seq < decode');
    return false;
  }
  console.info('Received fragment of sequence:', handshake.messageSeq);

  const buffer = this._getBuffer(handshake);

  // Ignore this fragment if we've already got all bytes it would contain.
  if (handshake.body.length > 0 &&
        handshake.fragmentOffset + handshake.body.length <= buffer.bytesRead) {
    console.warn('no new data');
    return false;
  }

  // Buffer the data if we're not ready to read it yet.
  if (handshake.fragmentOffset > buffer.bytesRead) {
    console.warn('not ready to handle');
    buffer.fragments.push(handshake);
    return false;
  }

  console.info('Valid data');

  // Write the fragment into the buffer
  this._writeToBuffer(handshake, buffer);

  // Sort the buffered fragments so we can read them in order.
  buffer.fragments.sort((a, b) => {
    return a.fragmentOffset - b.fragmentOffset;
  });

  // Go through as many of the buffered fragments as we can while
  // still not skipping any bytes in the body buffer.
  while (buffer.fragments.length > 0 &&
        buffer.fragments[0].fragmentOffset <= buffer.bytesRead) {
    this._writeToBuffer(buffer.fragments.shift(), buffer);
  }

  // Check if the buffer is ready.
  // Return false if it isn't. We'll keep buffering more.
  if (buffer.bytesRead < buffer.length) { return false; }

  // Store the completed Handshake message in the merged array.
  console.info('Merged');
  this.merged[buffer.messageSeq] = new DtlsHandshake({
    msgType: buffer.msgType,
    length: buffer.length,
    messageSeq: buffer.messageSeq,
    fragmentOffset: 0,
    body: buffer.body,
  });

  // Clear the buffer and raise the messageSeqToDecode so we won't read this
  // message again.
  delete this.buffers[buffer.messageSeq];
  this.messageSeqToDecode++;
  console.info('Raised decode++', this.messageSeqToDecode);

  return true;
};

HandshakeBuilder.prototype.next = function () {
  // Return false if we are still buffering the next to read packet.
  if (this.messageSeqToRead === this.messageSeqToDecode) { return false; }

  // Pop the next to read out of the merged collection and advance the
  // counter.
  const msg = this.merged[this.messageSeqToRead];
  delete this.merged[this.messageSeqToRead];
  this.messageSeqToRead++;

  return msg;
};

HandshakeBuilder.prototype._getBuffer = function (handshake) {
  if (!this.buffers[handshake.messageSeq]) {
    this.buffers[handshake.messageSeq] = {
      msgType: handshake.msgType,
      messageSeq: handshake.messageSeq,
      length: handshake.length,
      bytesRead: 0,
      fragments: [],
      body: new Buffer(handshake.length),
    };
  }

  return this.buffers[handshake.messageSeq];
};

HandshakeBuilder.prototype._writeToBuffer = function (handshake, buffer) {
  // Ignore this fragment if we've already got all bytes it would contain.
  //
  // We do this check again because we might have buffered overlapping
  // fragments.
  if (handshake.fragmentOffset + handshake.body.length <= buffer.bytesRead) {
    return;
  }

  handshake.body.copy(buffer.body, handshake.fragmentOffset);
  buffer.bytesRead = handshake.fragmentOffset + handshake.body.length;
};

module.exports = HandshakeBuilder;

