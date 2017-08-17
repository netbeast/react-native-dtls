

const crypto = require('react-native-crypto');
const constants = require('constants-browserify');

const dtls = require('./dtls');
const HandshakeBuilder = require('./HandshakeBuilder');
const CipherInfo = require('./CipherInfo');
const prf = require('./prf');

const DtlsHandshake = require('./packets/DtlsHandshake');
const DtlsClientHello = require('./packets/DtlsClientHello');
const DtlsHelloVerifyRequest = require('./packets/DtlsHelloVerifyRequest');
const DtlsServerHello = require('./packets/DtlsServerHello');
const DtlsCertificate = require('./packets/DtlsCertificate');
const DtlsServerHelloDone = require('./packets/DtlsServerHelloDone');
const DtlsClientKeyExchange_rsa = require('./packets/DtlsClientKeyExchange_rsa');
const DtlsChangeCipherSpec = require('./packets/DtlsChangeCipherSpec');
const DtlsFinished = require('./packets/DtlsFinished');
const DtlsRandom = require('./packets/DtlsRandom');
const DtlsExtension = require('./packets/DtlsExtension');

/* Note the methods in this class aren't grouped with similar methods. Instead
 * the handle_ and send_ methods follow the consoleical order as defined in the
 * DTLS/TLS specs.
 */

/**
 * Implements the DTLS server handshake.
 */
const ServerHandshakeHandler = function (parameters, keyContext, rinfo) {
  this.parameters = parameters;
  this.keyContext = keyContext;
  this.rinfo = rinfo;

  this.handshakeBuilder = new HandshakeBuilder();

  // Handshake builder makes sure that the normal handling methods never
  // receive duplicate packets. Duplicate packets may mean that the last
  // flight of packets we sent got lost though so we need to handle these.
  this.handshakeBuilder.onRetransmission = this.retransmitLast.bind(this);
};

/**
 * Processes an incoming handshake message from the client.
 *
 * @param {DtlsPlaintext} message
 *      The TLS envelope containing the handshake message.
 */
ServerHandshakeHandler.prototype.process = function (message) {
  // Enqueue the current handshake.
  const newHandshake = new DtlsHandshake(message.fragment);
  const newHandshakeName = dtls.HandshakeTypeName[newHandshake.msgType];
  console.info('Received handshake fragment; sequence:',
    `${newHandshake.messageSeq}:${newHandshakeName}`);
  this.handshakeBuilder.add(newHandshake);

  // Process available defragmented handshakes.
  let handshake = this.handshakeBuilder.next();
  while (handshake) {
    const handshakeName = dtls.HandshakeTypeName[handshake.msgType];

    const handler = this[`handle_${handshakeName}`];
    if (!handler) {
      console.error('Handshake handler not found for ', handshakeName);
      continue;
    }

    console.info('Processing handshake:',
      `${handshake.messageSeq}:${handshakeName}`);
    const action = this[`handle_${handshakeName}`](handshake, message);

    // Digest this message after handling it.
    // This way the ClientHello can create the new SecurityParamters before
    // we digest this so it'll get digested in the correct context AND the
    // Finished message can verify its digest without counting itself in
    // it.
    //
    // TODO: Make sure 'message' contains the defragmented buffer.
    // We read the buffer in HandshakeBuilder anyway so there's no real
    // reason to call getBuffer() here.
    if (this.newParameters) {
      this.newParameters.digestHandshake(handshake.getBuffer());
    }

    // However to get the digests in correct order, the handle_ method
    // above couldn't have invoked the send_ methods as those take care of
    // digesting their own messages. So instead they returned the action
    // and we'll invoke them after the digest.
    if (action) { action.call(this); }

    handshake = this.handshakeBuilder.next();
  }
};

/**
 * Handles the ClientHello message.
 *
 * The message is accepted only if it contains the correct cookie. If the
 * cookie is wrong, we'll send a HelloVerifyRequest packet instead of
 * proceeding with the handshake.
 */
ServerHandshakeHandler.prototype.handle_clientHello = function (handshake, message) {
  const clientHello = new DtlsClientHello(handshake.body);

  // TODO: If this is the very first handshake, the version of the initial
  // SecurityParameters hasn't been set. Set it to equal the current version.
  if (!this.parameters.first.version) { this.parameters.first.version = clientHello.clientVersion; }

  // Derive the cookie from the internal cookieSecret and client specific
  // information, including client address and information present in
  // the ClientHello message.
  //
  // The information used from ClientHello includes the cipher suites,
  // compression methods and extensions. Assuming extensions don't contain
  // random data, these fields should remain static between handshakes.
  //
  // (It might be worth it to exclude extensions from these though.. as
  // we can't guarantee that all extensions use static values in
  // ClientHello)
  //
  // The cookie is derived using the PRF of the clientHello.clientVersion
  // which means the clientVersion affects the cookie formation as well.
  if (!this.cookie) {
    this.cookie = prf(clientHello.clientVersion)(
      this.keyContext.cookieSecret,
      this.rinfo.address,
      handshake.body.slice(
        /* clientVersion */ 2 +
        /* Random */ 32 +
        /* sessionId */ clientHello.sessionId.length +
        /* cookie */ clientHello.cookie.length
      ), 16);
  }

  if (clientHello.cookie.length === 0 ||
    !clientHello.cookie.equals(this.cookie)) {
    console.log('ClientHello without cookie. Requesting verify.');

    const cookieVerify = new DtlsHelloVerifyRequest({
      serverVersion: clientHello.clientVersion,
      cookie: this.cookie,
    });

    // Generate the Handshake message containing the HelloVerifyRequest
    // This message should be small enough to not require fragmentation.
    const handshakes = this.handshakeBuilder.createHandshakes(cookieVerify);

    // The server MUST use the record sequence number in the ClientHello
    // as the record sequence number in the HelloVerifyRequest.
    //  - RFC
    handshakes.__sequenceNumber = message.sequenceNumber;

    this.setResponse(handshakes);
  } else {
    console.log('ClientHello received. Client version:',
      `${~clientHello.clientVersion.major}.${
        ~clientHello.clientVersion.minor}`);

    // ClientHello is the first message of a new handshake. This is a good
    // place to create the new SecurityParamters that will be negotiated
    // with this handshake sequence.
    // TODO: Validate client version
    this.version = clientHello.clientVersion;

    this.newParameters = this.parameters.initNew(this.version);
    this.newParameters.clientRandom = clientHello.random.getBuffer();

    console.log('Client ciphers');
    console.log(clientHello.cipherSuites);

    // The handle_ methods should RETURN the response action.
    // See the handle() method for explanation.
    return this.send_serverHello;
  }
};

/**
 * Sends the ServerHello message
 */
ServerHandshakeHandler.prototype.send_serverHello = function () {
  // TLS spec require all implementations MUST implement the
  // TLS_RSA_WITH_AES_128_CBC_SHA cipher.
  const cipher = CipherInfo.TLS_RSA_WITH_AES_128_CBC_SHA;

  const serverHello = new DtlsServerHello({
    serverVersion: this.version,
    random: new DtlsRandom(),
    sessionId: new Buffer(0),
    cipherSuite: cipher.id,
    compressionMethod: 0,

    // TODO: Remove the requirement for extensions. Currently packets with
    // 0 extensions will serialize wrong. I don't even remember which
    // extension this is. Maybe heartbeat? Whatever it is, we definitely do
    // not implement it. :)
    extensions: [
      new DtlsExtension({
        extensionType: 0x000f,
        extensionData: new Buffer([1]),
      }),
    ],
  });

  console.info('Server cipher used:', cipher.id);

  // Store more parameters.
  this.newParameters.serverRandom = serverHello.random.getBuffer();
  this.newParameters.setFrom(cipher);

  const certificate = new DtlsCertificate({
    certificateList: [this.keyContext.certificate],
  });

  const helloDone = new DtlsServerHelloDone();

  console.info('Sending ServerHello, Certificate, HelloDone');
  let handshakes = this.handshakeBuilder.createHandshakes([
    serverHello,
    certificate,
    helloDone,
  ]);

  handshakes = handshakes.map((h) => { return h.getBuffer(); });
  this.newParameters.digestHandshake(handshakes);

  const packets = this.handshakeBuilder.fragmentHandshakes(handshakes);

  this.setResponse(packets);
};

/**
 * Handles the ClientKeyExchange message.
 */
ServerHandshakeHandler.prototype.handle_clientKeyExchange = function (handshake) {
  const clientKeyExchange = new DtlsClientKeyExchange_rsa(handshake.body);

  // TODO: if this fails, create random preMasterKey to guard against chosen
  // ciphertext/PKCS#1 attack.
  const preMasterSecret = crypto.privateDecrypt({
    key: this.keyContext.key,
    padding: constants.RSA_PKCS1_PADDING,
  }, clientKeyExchange.exchangeKeys);

  this.newParameters.calculateMasterKey(preMasterSecret);

  // Do nothing here. We're still waiting for the Finished message.
  //
  // Set the response to null though as we know the client got the last
  // flight.
  this.setResponse(null);
};

/**
 * Handles the client Finished message.
 *
 * Technically there is a ChangeCipherSpec message between ClientKeyExchange
 * and Finished messages. ChangeCipherSpec isn't a handshake message though so
 * it never makes it here. That message is handled in the RecordLayer.
 */
ServerHandshakeHandler.prototype.handle_finished = function (handshake, message) {
  const finished = new DtlsFinished(handshake.body);

  const prf_func = prf(this.version);

  const expected = prf_func(
    this.newParameters.masterKey,
    'client finished',
    this.newParameters.getHandshakeDigest(),
    finished.verifyData.length
  );

  if (!finished.verifyData.equals(expected)) {
    console.warn('Finished digest does not match. Expected:',
      expected,
      'Actual:',
      finished.verifyData);
    return;
  }

  // The handle_ methods should RETURN the response action.
  // See the handle() method for explanation.
  return this.send_serverFinished;
};

ServerHandshakeHandler.prototype.send_serverFinished = function () {
  const changeCipherSpec = new DtlsChangeCipherSpec({ value: 1 });

  const prf_func = prf(this.version);

  const finished = new DtlsFinished({
    verifyData: prf_func(
      this.newParameters.masterKey,
      'server finished',
      this.newParameters.getHandshakeDigest(), 12
    ),
  });

  let handshakes = this.handshakeBuilder.createHandshakes([finished]);
  handshakes = this.handshakeBuilder.fragmentHandshakes(handshakes);
  handshakes.unshift(changeCipherSpec);

  console.info('Verify data:', finished.verifyData);
  console.info('Sending ChangeCipherSpec, Finished');

  const messages = this.setResponse(handshakes, this.onHandshake);
};

/**
 * Sets the response for the last client message.
 *
 * The last flight of packets is stored so we can somewhat automatically handle
 * retransmission when we see the client doing it.
 */
ServerHandshakeHandler.prototype.setResponse = function (packets, done) {
  this.lastFlight = packets;

  if (packets) { this.onSend(packets, done); }
};

/**
 * Retransmits the last response in case it got lost on the way last time.
 *
 * @param {DtlsPlaintext} message
 *      The received packet that triggered this retransmit.
 */
ServerHandshakeHandler.prototype.retransmitLast = function (message) {
  if (this.lastFlight) { this.onSend(this.lastFlight); }
};

module.exports = ServerHandshakeHandler;
