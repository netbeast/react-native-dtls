
"use strict";

var should = require( 'chai' ).should();
var crypto = require( 'crypto' );
var packets = require( '../packets' );
var dtls = require( '../dtls' );
var CipherInfo = require( '../CipherInfo' );
var prf = require( '../prf' );

var SecurityParameters = require( '../SecurityParameters' );

describe( 'SecurityParameters', function() {

    describe( '#ctor()', function() {

        it( 'should initialize the object', function() {

            var version = new packets.ProtocolVersion( ~1, ~2 );
            var sp = new SecurityParameters( 1, version );

            sp.epoch.should.equal( 1 );
            sp.version.should.equal( version );
            sp.entity.should.equal( dtls.ConnectionEnd.server );

            sp.bulkCipherAlgorithm.should.equal( dtls.BulkCipherAlgorithm.none );
            sp.cipherType.should.equal( dtls.CipherType.block );
            sp.encKeyLength.should.equal( 0 );
            sp.blockLength.should.equal( 0 );
            sp.fixedIvLength.should.equal( 0 );
            sp.recordIvLength.should.equal( 0 );

            sp.macAlgorithm.should.equal( dtls.MACAlgorithm.none );
            sp.macLength.should.equal( 0 );
            sp.macKeyLength.should.equal( 0 );

            sp.compressionAlgorithm.should.equal( dtls.CompressionMethod.none );
            should.not.exist( sp.masterKey );
            should.not.exist( sp.clientRandom );
            should.not.exist( sp.serverRandom );

            sp.handshakeDigest.should.have.length( 0 );
            sp.sendSequence.current.should.deep.equal( new Buffer([ 0, 0, 0, 0, 0, 0 ]) );
        });
    });

    describe( 'DTLS 1.2', function() {
        var version = new packets.ProtocolVersion( ~1, ~2 );

        describe( '#setFrom()', function() {

            it( 'should set parameters from cipher suite', function() {

                var sp = new SecurityParameters( 0, version );

                var suite = CipherInfo.TLS_RSA_WITH_AES_128_CBC_SHA;
                sp.setFrom( suite );

                sp.prfAlgorithm.should.equal( suite.prf );

                sp.bulkCipherAlgorithm.should.equal( suite.cipher.algorithm );
                sp.cipherType.should.equal( suite.cipher.type );
                sp.encKeyLength.should.equal( suite.cipher.keyMaterial );
                sp.blockLength.should.equal( suite.cipher.blockSize );
                sp.fixedIvLength.should.equal( 0 );
                sp.recordIvLength.should.equal( suite.cipher.ivSize );

                sp.macAlgorithm.should.equal( suite.mac.algorithm );
                sp.macLength.should.equal( suite.mac.length );
                sp.macKeyLength.should.equal( suite.mac.keyLength );
            });
        });

        describe( '#calculateMasterKey()', function() {
            it( 'should calcualte master key correctly', function() {

                var pre = new Buffer([ 0x33, 0x42, 0xea, 0xb5, 0x5e ]);
                var sr = new Buffer([ 0xbf, 0x98, 0xdc, 0x2f, 0x32 ]);
                var cr = new Buffer([ 0x34, 0x14, 0x0b, 0x40, 0xaf ]);

                var sp = new SecurityParameters( 0, version );
                sp.serverRandom = sr;
                sp.clientRandom = cr;

                sp.calculateMasterKey( pre );

                var expected = new Buffer(
                    '398e0dea84b8fae9aea65d09f538f22a' +
                    '5e1b7eebce276f6e9a97ca6bb8934577' +
                    'f57c8b15b95daf8571ee19aeaa0550ab',
                    'hex' );
                sp.masterKey.should.deep.equal( expected );
            });
        });

        describe( '#init()', function() {

            it( 'should calculate key material correctly', function() {

                var b = new Buffer([ 0x5f, 0x1f, 0xd2, 0x29, 0x6b ]);
                var sr = new Buffer([ 0x02, 0x86, 0xea, 0x29, 0x91 ]);
                var cr = new Buffer([ 0x33, 0x55, 0x4d, 0x81, 0x54 ]);

                var expected = {
                    cwmk: new Buffer( 'c83a7b69c782891a61ddc9306f35bc37a25f69db', 'hex' ),
                    swmk: new Buffer( '4e7321133d2a6af97851feebb97f373d4098169c', 'hex' ),
                    cwk: new Buffer( '373f963f4a2fbc13ffa22b256c46d36a', 'hex' ),
                    swk: new Buffer( '41585768b95aa0fa9a18be07be5f1d3c', 'hex' ),
                    cwi: new Buffer( 'c9babf9590a2ff90ad79c63f4d4ae2df', 'hex' ),
                    swi: new Buffer( '6ac49161350293e99e67fa7833e32f2b', 'hex' ),
                };

                var sp = new SecurityParameters( 0, version );
                sp.setFrom( CipherInfo.TLS_RSA_WITH_AES_128_CBC_SHA );
                sp.masterKey = b;
                sp.serverRandom = sr;
                sp.clientRandom = cr;

                sp.init();

                sp.clientWriteMacKey.should.deep.equal( expected.cwmk );
                sp.serverWriteMacKey.should.deep.equal( expected.swmk );
                sp.clientWriteKey.should.deep.equal( expected.cwk );
                sp.serverWriteKey.should.deep.equal( expected.swk );
                sp.clientWriteIv.should.deep.equal( expected.cwi );
                sp.serverWriteIv.should.deep.equal( expected.swi );
            });
        });
    });
});
