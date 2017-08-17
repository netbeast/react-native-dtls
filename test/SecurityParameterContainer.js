

const should = require('chai').should();
const crypto = require('react-native-crypto');
const packets = require('../packets');

const SecurityParameterContainer = require('../SecurityParameterContainer');

describe('SecurityParameterContainer', () => {
  describe('#ctor()', () => {
    it('should init correctly', () => {
      const spc = new SecurityParameterContainer();

      should.not.exist(spc.pending);
      spc.current.should.equal(0);
      should.exist(spc.parameters[0]);
      spc.parameters[0].should.equal(spc.first);
    });
  });

  describe('#initNew()', () => {
    it('should create new pending parameter', () => {
      const spc = new SecurityParameterContainer();

      should.not.exist(spc.pending);

      const version = new packets.ProtocolVersion(~1, ~2);
      const pending = spc.initNew(version);

      should.exist(spc.pending);
      pending.should.equal(spc.pending);
      pending.version.should.equal(version);

      spc.current.should.equal(0);
      should.exist(spc.parameters[spc.pending.epoch]);
    });
  });

  describe('#getcurrent()', () => {
    it('should get the parameters for first epoch', () => {
      const spc = new SecurityParameterContainer();

      const current = spc.getCurrent(0);

      current.should.equal(spc.first);
    });

    it('should get the parameters for random epoch', () => {
      const spc = new SecurityParameterContainer();

      const obj = { params: 1 };
      spc.parameters[123] = obj;

      const current = spc.getCurrent(123);

      current.should.equal(obj);
    });
  });

  describe('#get()', () => {
    it('should get the parameters for first packet', () => {
      const spc = new SecurityParameterContainer();

      const current = spc.get({ epoch: 0 });

      current.should.equal(spc.first);
    });

    it('should get the parameters for random packet', () => {
      const spc = new SecurityParameterContainer();

      const obj = { params: 1 };
      spc.parameters[123] = obj;

      const current = spc.get({ epoch: 123 });

      current.should.equal(obj);
    });
  });

  describe('#changeCipher()', () => {
    it('should change the current parameters', () => {
      const spc = new SecurityParameterContainer();
      const version = new packets.ProtocolVersion(~1, ~2);
      const pending = spc.initNew(version);

      pending.clientRandom = new Buffer(10);
      pending.serverRandom = new Buffer(10);
      pending.masterKey = new Buffer(10);

      pending.should.not.equal(spc.first);
      spc.parameters[spc.current].should.equal(spc.first);

      spc.changeCipher(0);

      spc.parameters[spc.current].should.equal(spc.pending);
      spc.parameters[spc.current].should.not.equal(spc.first);
    });

    it('should refuse to skip epochs', () => {
      const spc = new SecurityParameterContainer();
      spc.initNew(new packets.ProtocolVersion(~1, ~2));

      (function () {
        spc.changeCipher(10);
      }).should.not.throw(Error);

      spc.current.should.equal(0);
    });
  });
});
