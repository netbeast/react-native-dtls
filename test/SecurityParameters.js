

const should = require('chai').should();

const packets = require('../packets');
const dtls = require('../dtls');
const CipherInfo = require('../CipherInfo');

const SecurityParameters = require('../SecurityParameters');

describe('SecurityParameters', () => {
  describe('#ctor()', () => {
    it('should initialize the object', () => {
      const version = new packets.ProtocolVersion(~1, ~2);
      const sp = new SecurityParameters(1, version);

      sp.epoch.should.equal(1);
      sp.version.should.equal(version);
      sp.entity.should.equal(dtls.ConnectionEnd.server);

      sp.bulkCipherAlgorithm.should.equal(dtls.BulkCipherAlgorithm.none);
      sp.cipherType.should.equal(dtls.CipherType.block);
      sp.encKeyLength.should.equal(0);
      sp.blockLength.should.equal(0);
      sp.fixedIvLength.should.equal(0);
      sp.recordIvLength.should.equal(0);

      sp.macAlgorithm.should.equal(dtls.MACAlgorithm.none);
      sp.macLength.should.equal(0);
      sp.macKeyLength.should.equal(0);

      sp.compressionAlgorithm.should.equal(dtls.CompressionMethod.none);
      should.not.exist(sp.masterKey);
      should.not.exist(sp.clientRandom);
      should.not.exist(sp.serverRandom);

      sp.handshakeDigest.should.have.length(0);
      sp.sendSequence.current.should.deep.equal(new Buffer([0, 0, 0, 0, 0, 0]));
    });
  });

  describe('DTLS 1.2', () => {
    const version = new packets.ProtocolVersion(~1, ~2);

    describe('#setFrom()', () => {
      it('should set parameters from cipher suite', () => {
        const sp = new SecurityParameters(0, version);

        const suite = CipherInfo.TLS_RSA_WITH_AES_128_CBC_SHA;
        sp.setFrom(suite);

        sp.prfAlgorithm.should.equal(suite.prf);

        sp.bulkCipherAlgorithm.should.equal(suite.cipher.algorithm);
        sp.cipherType.should.equal(suite.cipher.type);
        sp.encKeyLength.should.equal(suite.cipher.keyMaterial);
        sp.blockLength.should.equal(suite.cipher.blockSize);
        sp.fixedIvLength.should.equal(0);
        sp.recordIvLength.should.equal(suite.cipher.ivSize);

        sp.macAlgorithm.should.equal(suite.mac.algorithm);
        sp.macLength.should.equal(suite.mac.length);
        sp.macKeyLength.should.equal(suite.mac.keyLength);
      });
    });

    describe('#calculateMasterKey()', () => {
      it('should calcualte master key correctly', () => {
        const pre = new Buffer([0x33, 0x42, 0xea, 0xb5, 0x5e]);
        const sr = new Buffer([0xbf, 0x98, 0xdc, 0x2f, 0x32]);
        const cr = new Buffer([0x34, 0x14, 0x0b, 0x40, 0xaf]);

        const sp = new SecurityParameters(0, version);
        sp.serverRandom = sr;
        sp.clientRandom = cr;

        sp.calculateMasterKey(pre);

        const expected = new Buffer(
          '398e0dea84b8fae9aea65d09f538f22a' +
          '5e1b7eebce276f6e9a97ca6bb8934577' +
          'f57c8b15b95daf8571ee19aeaa0550ab',
          'hex');
        sp.masterKey.should.deep.equal(expected);
      });
    });

    describe('#init()', () => {
      it('should calculate key material correctly', () => {
        const b = new Buffer([0x5f, 0x1f, 0xd2, 0x29, 0x6b]);
        const sr = new Buffer([0x02, 0x86, 0xea, 0x29, 0x91]);
        const cr = new Buffer([0x33, 0x55, 0x4d, 0x81, 0x54]);

        const expected = {
          cwmk: new Buffer('c83a7b69c782891a61ddc9306f35bc37a25f69db', 'hex'),
          swmk: new Buffer('4e7321133d2a6af97851feebb97f373d4098169c', 'hex'),
          cwk: new Buffer('373f963f4a2fbc13ffa22b256c46d36a', 'hex'),
          swk: new Buffer('41585768b95aa0fa9a18be07be5f1d3c', 'hex'),
          cwi: new Buffer('c9babf9590a2ff90ad79c63f4d4ae2df', 'hex'),
          swi: new Buffer('6ac49161350293e99e67fa7833e32f2b', 'hex'),
        };

        const sp = new SecurityParameters(0, version);
        sp.setFrom(CipherInfo.TLS_RSA_WITH_AES_128_CBC_SHA);
        sp.masterKey = b;
        sp.serverRandom = sr;
        sp.clientRandom = cr;

        sp.init();

        sp.clientWriteMacKey.should.deep.equal(expected.cwmk);
        sp.serverWriteMacKey.should.deep.equal(expected.swmk);
        sp.clientWriteKey.should.deep.equal(expected.cwk);
        sp.serverWriteKey.should.deep.equal(expected.swk);
        sp.clientWriteIv.should.deep.equal(expected.cwi);
        sp.serverWriteIv.should.deep.equal(expected.swi);
      });
    });
  });

  describe('AES_128_CBC cipher', () => {
    const version = new packets.ProtocolVersion(~1, ~2);

    describe('#getCipher()', () => {
      it('should return working server-write aes-128-cbc cipher', () => {
        const sp = new SecurityParameters(1, version);
        sp.isServer = true;
        sp.clientWriteKey = new Buffer('373f963f4a2fbc13ffa22b256c46d36a', 'hex');
        sp.serverWriteKey = new Buffer('41585768b95aa0fa9a18be07be5f1d3c', 'hex');

        const iv = new Buffer('75b16855266f79a050903e2fba5cfd6f', 'hex');
        const data = new Buffer(
          '48edcabd93af9026843f4326be93c81f' +
          '0cb8556a2e56bc25cc9698f5ad19acad' +
          'd1a47ddedc875100ec73b2094d486a38' +
          '2651894e05695abdc42214170de48f09', 'hex');

        const cipher = sp.getCipher(iv);

        const encrypted = Buffer.concat([
          cipher.update(data),
          cipher.final(),
        ]);

        const expected = new Buffer(
          '477c287763301575026ef7b399e8d23c' +
          '7440fbf02cb0b8da6078fc15d257047d' +
          '61520998f5b93a462fb2d8c7fb88ca1e' +
          '4986558eedf87389dd22dc0cfd938d30' +
          'be4a7ad5486fa08ec5e9ff30ba4507d5', 'hex');

        encrypted.should.deep.equal(expected);
      });

      it('should return working client-write aes-128-cbc cipher', () => {
        const sp = new SecurityParameters(1, version);
        sp.isServer = false;
        sp.clientWriteKey = new Buffer('373f963f4a2fbc13ffa22b256c46d36a', 'hex');
        sp.serverWriteKey = new Buffer('41585768b95aa0fa9a18be07be5f1d3c', 'hex');

        const iv = new Buffer('75b16855266f79a050903e2fba5cfd6f', 'hex');
        const data = new Buffer(
          '48edcabd93af9026843f4326be93c81f' +
          '0cb8556a2e56bc25cc9698f5ad19acad' +
          'd1a47ddedc875100ec73b2094d486a38' +
          '2651894e05695abdc42214170de48f09', 'hex');

        const cipher = sp.getCipher(iv);

        const encrypted = Buffer.concat([
          cipher.update(data),
          cipher.final(),
        ]);

        const expected = new Buffer(
          '3ba3ad25235f5b5baa5467f556e71d96' +
          '7223d0484149fa70e7e4c6ff9a19f647' +
          'b2a10a1179e73240e89b0a959869c200' +
          '370137001b14b8378d06f954e18ff6dd' +
          'e18ec5cce8db90a4b8d39c70d041c4a2', 'hex');

        encrypted.should.deep.equal(expected);
      });
    });

    describe('#getDecipher()', () => {
      it('should return working client-read aes-128-cbc decipher', () => {
        const sp = new SecurityParameters(1, version);
        sp.isServer = false;
        sp.clientWriteKey = new Buffer('373f963f4a2fbc13ffa22b256c46d36a', 'hex');
        sp.serverWriteKey = new Buffer('41585768b95aa0fa9a18be07be5f1d3c', 'hex');

        const iv = new Buffer('75b16855266f79a050903e2fba5cfd6f', 'hex');
        const data = new Buffer(
          '477c287763301575026ef7b399e8d23c' +
          '7440fbf02cb0b8da6078fc15d257047d' +
          '61520998f5b93a462fb2d8c7fb88ca1e' +
          '4986558eedf87389dd22dc0cfd938d30' +
          'be4a7ad5486fa08ec5e9ff30ba4507d5', 'hex');

        const decipher = sp.getDecipher(iv);

        const decrypted = Buffer.concat([
          decipher.update(data),
          decipher.final(),
        ]);

        const expected = new Buffer(
          '48edcabd93af9026843f4326be93c81f' +
          '0cb8556a2e56bc25cc9698f5ad19acad' +
          'd1a47ddedc875100ec73b2094d486a38' +
          '2651894e05695abdc42214170de48f09', 'hex');

        decrypted.should.deep.equal(expected);
      });

      it('should return working server-read aes-128-cbc decipher', () => {
        const sp = new SecurityParameters(1, version);
        sp.isServer = true;
        sp.clientWriteKey = new Buffer('373f963f4a2fbc13ffa22b256c46d36a', 'hex');
        sp.serverWriteKey = new Buffer('41585768b95aa0fa9a18be07be5f1d3c', 'hex');

        const iv = new Buffer('75b16855266f79a050903e2fba5cfd6f', 'hex');
        const data = new Buffer(
          '3ba3ad25235f5b5baa5467f556e71d96' +
          '7223d0484149fa70e7e4c6ff9a19f647' +
          'b2a10a1179e73240e89b0a959869c200' +
          '370137001b14b8378d06f954e18ff6dd' +
          'e18ec5cce8db90a4b8d39c70d041c4a2', 'hex');

        const decipher = sp.getDecipher(iv);

        const decrypted = Buffer.concat([
          decipher.update(data),
          decipher.final(),
        ]);

        const expected = new Buffer(
          '48edcabd93af9026843f4326be93c81f' +
          '0cb8556a2e56bc25cc9698f5ad19acad' +
          'd1a47ddedc875100ec73b2094d486a38' +
          '2651894e05695abdc42214170de48f09', 'hex');

        decrypted.should.deep.equal(expected);
      });
    });

    describe('#calculateIncomingMac()', () => {
      it('should calculate correct client-outgoing sha1 mac', () => {
        const sp = new SecurityParameters(1, version);
        sp.isServer = false;
        sp.clientWriteMacKey = new Buffer('c83a7b69c782891a61ddc9306f35bc37a25f69db', 'hex');
        sp.serverWriteMacKey = new Buffer('4e7321133d2a6af97851feebb97f373d4098169c', 'hex');

        const data = new Buffer(
          '7804afb92904ad81ee5b046427c1a4dc' +
          '0f8c76031d25d29db259ebf86b7ad34e' +
          '227159354963c64e8c76c8500ab755e4' +
          '72e72aaf6fede1657bd638ecb01ca56e' +
          'ce72cd1e03b57376a1732aba242fa0b6' +
          '2a94238f3107201b424b3d44cca9d3f5' +
          'e43cdf7174f4d45ab724369b7c9f18c6' +
          '355295e4d1b7b4ccb700733cc3bc4958', 'hex');

        const actual = sp.calculateIncomingMac(data);
        const expected = new Buffer(
          '827451fec1fffae0c0f4955f1da9fe53f1b42c30', 'hex');

        actual.should.deep.equal(expected);
      });

      it('should calculate correct server-outgoing sha1 mac', () => {
        const sp = new SecurityParameters(1, version);
        sp.isServer = true;
        sp.clientWriteMacKey = new Buffer('c83a7b69c782891a61ddc9306f35bc37a25f69db', 'hex');
        sp.serverWriteMacKey = new Buffer('4e7321133d2a6af97851feebb97f373d4098169c', 'hex');

        const data = new Buffer(
          '7804afb92904ad81ee5b046427c1a4dc' +
          '0f8c76031d25d29db259ebf86b7ad34e' +
          '227159354963c64e8c76c8500ab755e4' +
          '72e72aaf6fede1657bd638ecb01ca56e' +
          'ce72cd1e03b57376a1732aba242fa0b6' +
          '2a94238f3107201b424b3d44cca9d3f5' +
          'e43cdf7174f4d45ab724369b7c9f18c6' +
          '355295e4d1b7b4ccb700733cc3bc4958', 'hex');

        const actual = sp.calculateIncomingMac(data);
        const expected = new Buffer(
          'ce9f001479227dbc11d60757bf94d113e9e7be9a', 'hex');

        actual.should.deep.equal(expected);
      });
    });

    describe('#calculateOutgoingMac()', () => {
      it('should calculate correct client-outgoing sha1 mac', () => {
        const sp = new SecurityParameters(1, version);
        sp.isServer = false;
        sp.clientWriteMacKey = new Buffer('c83a7b69c782891a61ddc9306f35bc37a25f69db', 'hex');
        sp.serverWriteMacKey = new Buffer('4e7321133d2a6af97851feebb97f373d4098169c', 'hex');

        const data = [
          new Buffer('7804afb92904ad81ee5b046427c1a4dc', 'hex'),
          new Buffer('0f8c76031d25d29db259ebf86b7ad34e', 'hex'),
          new Buffer('227159354963c64e8c76c8500ab755e4', 'hex'),
          new Buffer('72e72aaf6fede1657bd638ecb01ca56e', 'hex'),
          new Buffer('ce72cd1e03b57376a1732aba242fa0b6', 'hex'),
          new Buffer('2a94238f3107201b424b3d44cca9d3f5', 'hex'),
          new Buffer('e43cdf7174f4d45ab724369b7c9f18c6', 'hex'),
          new Buffer('355295e4d1b7b4ccb700733cc3bc4958', 'hex'),
        ];

        const actual = sp.calculateOutgoingMac(data);
        const expected = new Buffer(
          'ce9f001479227dbc11d60757bf94d113e9e7be9a', 'hex');

        actual.should.deep.equal(expected);
      });

      it('should calculate correct server-outgoing sha1 mac', () => {
        const sp = new SecurityParameters(1, version);
        sp.isServer = true;
        sp.clientWriteMacKey = new Buffer('c83a7b69c782891a61ddc9306f35bc37a25f69db', 'hex');
        sp.serverWriteMacKey = new Buffer('4e7321133d2a6af97851feebb97f373d4098169c', 'hex');

        const data = [
          new Buffer('7804afb92904ad81ee5b046427c1a4dc', 'hex'),
          new Buffer('0f8c76031d25d29db259ebf86b7ad34e', 'hex'),
          new Buffer('227159354963c64e8c76c8500ab755e4', 'hex'),
          new Buffer('72e72aaf6fede1657bd638ecb01ca56e', 'hex'),
          new Buffer('ce72cd1e03b57376a1732aba242fa0b6', 'hex'),
          new Buffer('2a94238f3107201b424b3d44cca9d3f5', 'hex'),
          new Buffer('e43cdf7174f4d45ab724369b7c9f18c6', 'hex'),
          new Buffer('355295e4d1b7b4ccb700733cc3bc4958', 'hex'),
        ];

        const actual = sp.calculateOutgoingMac(data);
        const expected = new Buffer(
          '827451fec1fffae0c0f4955f1da9fe53f1b42c30', 'hex');


        actual.should.deep.equal(expected);
      });
    });

    describe('#digestHandshake()', () => {
      it('should perform TLS 1.2 digest on single data', () => {
        const sp = new SecurityParameters(1, version);

        const data = new Buffer(
          '7804afb92904ad81ee5b046427c1a4dc' +
          '0f8c76031d25d29db259ebf86b7ad34e' +
          '227159354963c64e8c76c8500ab755e4' +
          '72e72aaf6fede1657bd638ecb01ca56e' +
          'ce72cd1e03b57376a1732aba242fa0b6' +
          '2a94238f3107201b424b3d44cca9d3f5' +
          'e43cdf7174f4d45ab724369b7c9f18c6' +
          '355295e4d1b7b4ccb700733cc3bc4958', 'hex');

        sp.digestHandshake(data);

        const actual = sp.getHandshakeDigest();

        const expected = new Buffer(
          '44ea752d8cd1c819007758528c81da75' +
          '604feba1727222548221cea68db8c0d2', 'hex');

        actual.should.deep.equal(expected);
      });

      it('should perform TLS 1.2 digest on Handshake packets', () => {
        const sp = new SecurityParameters(1, version);

        const data = [
          new Buffer('7804afb92904ad81ee5b046427c1a4dc', 'hex'),
          new Buffer('0f8c76031d25d29db259ebf86b7ad34e', 'hex'),
          new Buffer('227159354963c64e8c76c8500ab755e4', 'hex'),
          new Buffer('72e72aaf6fede1657bd638ecb01ca56e', 'hex'),
          new Buffer('ce72cd1e03b57376a1732aba242fa0b6', 'hex'),
          new Buffer('2a94238f3107201b424b3d44cca9d3f5', 'hex'),
          new Buffer('e43cdf7174f4d45ab724369b7c9f18c6', 'hex'),
          new Buffer('355295e4d1b7b4ccb700733cc3bc4958', 'hex'),
        ];

        for (const d in data) {
          const packet = new packets.Plaintext({
            type: 0,
            version: version,
            epoch: 0,
            sequenceNumber: new Buffer([0x01]),
            fragment: data[d],
          });
          sp.digestHandshake(packet);
        }

        const actual = sp.getHandshakeDigest();

        const expected = new Buffer(
          '44ea752d8cd1c819007758528c81da75' +
          '604feba1727222548221cea68db8c0d2', 'hex');

        actual.should.deep.equal(expected);
      });

      it('should perform TLS 1.2 digest on array data', () => {
        const sp = new SecurityParameters(1, version);

        const data = [
          new Buffer('7804afb92904ad81ee5b046427c1a4dc', 'hex'),
          new Buffer('0f8c76031d25d29db259ebf86b7ad34e', 'hex'),
          new Buffer('227159354963c64e8c76c8500ab755e4', 'hex'),
          new Buffer('72e72aaf6fede1657bd638ecb01ca56e', 'hex'),
          new Buffer('ce72cd1e03b57376a1732aba242fa0b6', 'hex'),
          new Buffer('2a94238f3107201b424b3d44cca9d3f5', 'hex'),
          new Buffer('e43cdf7174f4d45ab724369b7c9f18c6', 'hex'),
          new Buffer('355295e4d1b7b4ccb700733cc3bc4958', 'hex'),
        ];

        sp.digestHandshake(data);
        const actual = sp.getHandshakeDigest();

        const expected = new Buffer(
          '44ea752d8cd1c819007758528c81da75' +
          '604feba1727222548221cea68db8c0d2', 'hex');

        actual.should.deep.equal(expected);
      });
    });
  });
});

