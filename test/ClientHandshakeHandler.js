

const should = require('chai').should();

const crypto = require('react-native-crypto');
const constants = require('constants-browserify');
const fs = require('react-native-level-fs');

const ClientHandshakeHandler = require('../ClientHandshakeHandler');
const SecurityParameterContainer = require('../SecurityParameterContainer');
const dtls = require('../dtls');
const packets = require('../packets');
const CipherInfo = require('../CipherInfo');
const KeyContext = require('../KeyContext');
const prf = require('../prf');

describe('ClientHandshakeHandler', () => {
  const versions = {
    1.2: {
      major: ~1,
      minor: ~2,
    },
    '1.0': {
      major: ~1,
      minor: ~0,
    },
  };

  for (var v in versions) {
    describe(`DTLS v${v}`, () => {
      const ver = versions[v];
      const version = new packets.ProtocolVersion(ver.major, ver.minor);

      describe('send_clientHello', () => {
        it('should send ClientHello', (done) => {
          const parameters = new SecurityParameterContainer();
          const handshakeHandler = new ClientHandshakeHandler(parameters);
          handshakeHandler.version = version;

          handshakeHandler.onSend = function (msgs) {
            msgs.should.have.length(1);

            const msg = msgs[0];

            msg.msgType.should.equal(dtls.HandshakeType.clientHello);
            msg.messageSeq.should.equal(0);
            msg.fragmentOffset.should.equal(0);
            msg.length.should.equal(msg.body.length);

            const clientHello = new packets.ClientHello(msg.body);

            clientHello.clientVersion.major.should.equal(ver.major);
            clientHello.clientVersion.minor.should.equal(ver.minor);

            clientHello.random.getBuffer().should.deep.equal(
              parameters.parameters[1].clientRandom);

            clientHello.sessionId.should.have.length(0);
            clientHello.cookie.should.have.length(0);

            clientHello.cipherSuites.should.deep.equal([
              CipherInfo.TLS_RSA_WITH_AES_128_CBC_SHA.id]);
            clientHello.compressionMethods.should.deep.equal([0]);

            // Extensions not handled correctly at the moment.
            // clientHello.extensions.should.have.length( 0 );

            done();
          };

          handshakeHandler.send_clientHello();
          handshakeHandler.setResponse(null);
        });

        it('should create new SecurityParameter', () => {
          const parameters = new SecurityParameterContainer();
          const handshakeHandler = new ClientHandshakeHandler(parameters);
          handshakeHandler.onSend = function () { };

          should.not.exist(parameters.pending);

          handshakeHandler.send_clientHello();
          handshakeHandler.setResponse(null);

          should.exist(parameters.pending);
          parameters.pending.epoch.should.equal(parameters.current + 1);
        });
      });

      describe('#handle_helloVerifyRequest()', () => {
        it('should cause ClientHello', () => {
          const parameters = new SecurityParameterContainer();
          const handshakeHandler = new ClientHandshakeHandler(parameters);

          const cookie = new Buffer(20);

          const action = handshakeHandler.handle_helloVerifyRequest({
            body: new packets.HelloVerifyRequest({
              serverVersion: new packets.ProtocolVersion({
                major: ver.major, minor: ver.minor,
              }),
              cookie: cookie,
            }).getBuffer(),
          });

          action.should.equal(handshakeHandler.send_clientHello);
          handshakeHandler.setResponse(null);

          handshakeHandler.cookie.should.deep.equal(cookie);
        });
      });

      describe('#handle_serverHello()', () => {
        it('should set the parameters', () => {
          const parameters = new SecurityParameterContainer();
          const handshakeHandler = new ClientHandshakeHandler(parameters);

          const random = new packets.Random();
          const sessionId = crypto.pseudoRandomBytes(16);
          const cipherSuite = CipherInfo.TLS_RSA_WITH_AES_128_CBC_SHA;

          const param = handshakeHandler.newParameters =
            parameters.initNew(version);

          let setFrom = false;
          param.setFrom = function (suite) {
            setFrom = true;
            suite.should.equal(cipherSuite);
          };

          const action = handshakeHandler.handle_serverHello({
            body: new packets.ServerHello({
              serverVersion: version,
              random: random,
              sessionId: sessionId,
              cipherSuite: cipherSuite.id,
              compressionMethod: 0,
              extensions: [],
            }).getBuffer(),
          });

          // ServerHello alone doesn't result in action. Client should
          // wait for Certificate and HelloDone.
          should.not.exist(action);

          param.version.major.should.equal(ver.major);
          param.version.minor.should.equal(ver.minor);
          param.serverRandom.should.deep.equal(random.getBuffer());
          param.compressionMethod.should.equal(0);

          setFrom.should.be.true;
        });
      });

      describe('#handle_certificate()', () => {
        it('should store certificate', () => {
          const parameters = new SecurityParameterContainer();
          const handshakeHandler = new ClientHandshakeHandler(parameters);

          const certificateList = [
            crypto.pseudoRandomBytes(1024),
          ];

          const param = handshakeHandler.newParameters =
            parameters.initNew(version);

          const action = handshakeHandler.handle_certificate({
            body: new packets.Certificate({
              certificateList: certificateList,
            }).getBuffer(),
          });

          // Certificate alone doesn't result in action. Client should wait
          // for HelloDone.
          should.not.exist(action);
          handshakeHandler.certificate.should.deep.equal(certificateList[0]);
        });
      });

      describe('#handle_serverHelloDone()', () => {
        it('should send pre-master key', () => {
          const clientRandom = crypto.pseudoRandomBytes(16);
          const serverRandom = crypto.pseudoRandomBytes(16);

          const parameters = new SecurityParameterContainer();
          const handshakeHandler = new ClientHandshakeHandler(parameters);
          const param = handshakeHandler.newParameters =
            parameters.initNew(version);

          handshakeHandler.version = param.version = version;
          param.clientRandom = clientRandom;
          param.serverRandom = serverRandom;

          const action = handshakeHandler.handle_serverHelloDone({
            body: new packets.ServerHelloDone().getBuffer(),
          });

          should.exist(param.masterKey);
          should.exist(param.preMasterKey);
          action.should.equal(handshakeHandler.send_keyExchange);
          handshakeHandler.setResponse(null);
        });
      });

      describe('#send_keyExchange()', () => {
        it('should send key', (done) => {
          const parameters = new SecurityParameterContainer();
          const handshakeHandler = new ClientHandshakeHandler(parameters);
          const param = handshakeHandler.newParameters =
            parameters.initNew(version);

          const clientRandom = new packets.Random();
          const serverRandom = new packets.Random();
          param.clientRandom = clientRandom.getBuffer();
          param.serverRandom = serverRandom.getBuffer();

          const preMasterKey = crypto.pseudoRandomBytes(20);
          param.calculateMasterKey(preMasterKey);

          const pem = fs.readFileSync('test/assets/certificate.pem');
          const keyContext = new KeyContext({
            key: pem,
            cert: pem,
          });

          param.preMasterKey = preMasterKey;
          handshakeHandler.certificate = keyContext.certificate;

          handshakeHandler.onSend = function (msgs) {
            msgs.should.have.length(3);

            msgs[0].type.should.equal(dtls.MessageType.handshake);
            msgs[1].type.should.equal(dtls.MessageType.changeCipherSpec);
            msgs[2].type.should.equal(dtls.MessageType.handshake);

            msgs[0].msgType.should.equal(
              dtls.HandshakeType.clientKeyExchange);
            msgs[2].msgType.should.equal(
              dtls.HandshakeType.finished);

            const keyExchange = new packets.ClientKeyExchange_rsa(
              msgs[0].body);
            const actualPreMaster = crypto.privateDecrypt({
              key: keyContext.key,
              padding: constants.RSA_PKCS1_PADDING,
            }, keyExchange.exchangeKeys);

            actualPreMaster.should.deep.equal(preMasterKey);

            msgs[1].value.should.equal(1);

            // Pop the 'Finished' handshake off the params.
            param.handshakeDigest.pop();
            const digest = param.getHandshakeDigest();

            const expected = prf(version)(
              param.masterKey,
              'client finished',
              digest, 12);

            msgs[2].body.should.deep.equal(expected);

            done();
          };

          const fragments = handshakeHandler.send_keyExchange();
          handshakeHandler.setResponse(null);
        });
      });

      describe('#handle_finished', () => {
        it('should finish handshake', (done) => {
          const parameters = new SecurityParameterContainer();
          const handshakeHandler = new ClientHandshakeHandler(parameters);
          const param = handshakeHandler.newParameters =
            parameters.initNew(version);

          param.masterKey = crypto.pseudoRandomBytes(16);

          const verifyData = prf(param.version)(
            param.masterKey,
            'server finished',
            param.getHandshakeDigest(), 32);

          handshakeHandler.onHandshake = function () {
            done();
          };

          const action = handshakeHandler.handle_finished({
            body: new packets.Finished({
              verifyData: verifyData,
            }).getBuffer(),
          });
        });
      });
    });
  }
});
