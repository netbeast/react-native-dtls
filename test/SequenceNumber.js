

const should = require('chai').should();
const crypto = require('react-native-crypto');

const SequenceNumber = require('../SequenceNumber');

describe('SequenceNumber', () => {
  describe('#ctor()', () => {
    it('should init correctly', () => {
      const sn = new SequenceNumber();

      sn.current.should.deep.equal(new Buffer([0, 0, 0, 0, 0, 0]));
    });
  });

  describe('#next()', () => {
    it('should increase counter correctly', () => {
      const sn = new SequenceNumber();
      sn.current.should.deep.equal(new Buffer([0, 0, 0, 0, 0, 0]));

      const next = sn.next();

      next.should.deep.equal(new Buffer([0, 0, 0, 0, 0, 1]));
      sn.current.should.deep.equal(next);
    });

    it('should overflow correctly', () => {
      const sn = new SequenceNumber();
      sn.current = new Buffer([0, 0, 0, 0, 0, 0xff]);

      const next = sn.next();

      next.should.deep.equal(new Buffer([0, 0, 0, 0, 1, 0]));
      sn.current.should.deep.equal(next);
    });

    it('should cascade the overflow', () => {
      const sn = new SequenceNumber();
      sn.current = new Buffer([0, 0xff, 0xff, 0xff, 0xff, 0xff]);

      const next = sn.next();

      next.should.deep.equal(new Buffer([1, 0, 0, 0, 0, 0]));
      sn.current.should.deep.equal(next);
    });

    it('should overflow back to zero', () => {
      const sn = new SequenceNumber();
      sn.current = new Buffer([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

      const next = sn.next();

      next.should.deep.equal(new Buffer([0, 0, 0, 0, 0, 0]));
      sn.current.should.deep.equal(next);
    });
  });

  describe('#setNext()', () => {
    it('should set the next value correctly', () => {
      const sn = new SequenceNumber();
      sn.current.should.deep.equal(new Buffer([0, 0, 0, 0, 0, 0]));

      sn.setNext(new Buffer([1, 2, 3, 4, 5, 6]));
      sn.current.should.deep.equal(new Buffer([1, 2, 3, 4, 5, 5]));

      const next = sn.next();
      next.should.deep.equal(new Buffer([1, 2, 3, 4, 5, 6]));
    });

    it('should overflow backwards if needed', () => {
      const sn = new SequenceNumber();
      sn.current.should.deep.equal(new Buffer([0, 0, 0, 0, 0, 0]));

      sn.setNext(new Buffer([1, 0, 0, 0, 0, 0]));
      sn.current.should.deep.equal(new Buffer([0, 0xff, 0xff, 0xff, 0xff, 0xff]));

      const next = sn.next();
      next.should.deep.equal(new Buffer([1, 0, 0, 0, 0, 0]));
    });

    it('should overflow fully if needed', () => {
      const sn = new SequenceNumber();
      sn.current.should.deep.equal(new Buffer([0, 0, 0, 0, 0, 0]));

      sn.setNext(new Buffer([0, 0, 0, 0, 0, 0]));
      sn.current.should.deep.equal(new Buffer([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]));

      const next = sn.next();
      next.should.deep.equal(new Buffer([0, 0, 0, 0, 0, 0]));
    });
  });
});
