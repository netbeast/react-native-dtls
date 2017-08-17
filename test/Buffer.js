

const should = require('chai').should();
const crypto = require('react-native-crypto');

const BufferReader = require('../BufferReader');
const BufferBuilder = require('../BufferBuilder');

const datatypes = {
  Int8: 1,
  UInt8: 1,
  Int16LE: 2,
  UInt16LE: 2,
  Int16BE: 2,
  UInt16BE: 2,
  Int32LE: 4,
  UInt32LE: 4,
  Int32BE: 4,
  UInt32BE: 4,
  FloatLE: 4,
  DoubleLE: 8,
  FloatBE: 4,
  DoubleBE: 8,
};

describe('BufferReader', () => {
  Object.keys(datatypes).forEach((dt) => {
    const method = `read${dt}`;
    const size = datatypes[dt];

    describe(`#${method}()`, () => {
      it('should advance offset', () => {
        const reader = new BufferReader(new Buffer(size));
        reader[method]();

        reader.offset.should.equal(size);
      });

      it('should read bytes correctly', () => {
        const count = 16;

        const buffer = crypto.pseudoRandomBytes(size * count);
        const reader = new BufferReader(buffer);

        for (let i = 0; i < count; i++) {
          const actual = reader[method]();
          const expected = buffer[method](size * i);

          if (!isNaN(expected)) { actual.should.equal(expected); }
        }
      });

      it('should consider optional offset', () => {
        const count = 16;

        const buffer = crypto.pseudoRandomBytes(size * count);
        const reader = new BufferReader(buffer);

        for (let i = 0; i < count; i++) {
          const actual = reader[method](buffer.length - (size * (i + 1)));
          const expected = buffer[method](buffer.length - (size * (i + 1)));

          if (!isNaN(expected)) { actual.should.equal(expected); }
        }
      });
    });
  });

  describe('#readUInt24BE()', () => {
    it('should write bytes correctly', () => {
      const builder = new BufferBuilder();
      const value = Math.floor(Math.random() * 0xffffff);
      builder.writeUInt24BE(value);

      const reader = new BufferReader(builder.getBuffer());
      const actual = reader.readUInt24BE();

      actual.should.equal(value);
    });
  });

  describe('#readUInt24LE()', () => {
    it('should write bytes correctly', () => {
      const builder = new BufferBuilder();
      const value = Math.floor(Math.random() * 0xffffff);
      builder.writeUInt24LE(value);

      const reader = new BufferReader(builder.getBuffer());
      const actual = reader.readUInt24LE();

      actual.should.equal(value);
    });
  });

  describe('#readBytes()', () => {
    it('should read bytes correctly', () => {
      const value = crypto.pseudoRandomBytes(64);

      const reader = new BufferReader(value);

      for (let i = 0; i < 64; i += 16) {
        const actual = reader.readBytes(16);
        const expected = value.slice(i, i + 16);

        actual.should.deep.equal(expected);
      }
    });
  });

  describe('#seek()', () => {
    it('should change position in buffer', () => {
      const buffer = new Buffer([0x10, 0x20, 0x30, 0x40]);
      const reader = new BufferReader(buffer);

      reader.readInt8().should.equal(0x10);

      reader.seek(2);
      reader.readInt8().should.equal(0x30);

      reader.seek(1);
      reader.readInt8().should.equal(0x20);
    });
  });
});

describe('BufferBuilder', () => {
  Object.keys(datatypes).forEach((dt) => {
    const method = `write${dt}`;
    const size = datatypes[dt];

    describe(`#${method}()`, () => {
      it('should write bytes correctly', () => {
        const count = 16;

        const builder = new BufferBuilder();
        const buffer = new Buffer(size * count);

        for (let i = 0; i < count; i++) {
          const value = Math.random();

          builder[method](value);
          buffer[method](value, i * size);
        }

        const actual = builder.getBuffer();
        actual.should.deep.equal(buffer);
      });
    });
  });

  describe('#writeUInt24BE()', () => {
    it('should write bytes correctly', () => {
      const count = 16;
      const size = 3;

      const builder = new BufferBuilder();
      const buffer = new Buffer(3 * count);

      for (let i = 0; i < count; i++) {
        const value = Math.floor(Math.random() * 0xffffff);

        builder.writeUInt24BE(value);
        buffer.writeUInt8((value & 0xff0000) >> 16, i * size);
        buffer.writeUInt16BE(value & 0xffff, i * size + 1);
      }

      const actual = builder.getBuffer();
      buffer.should.deep.equal(actual);
    });
  });

  describe('#writeUInt24LE()', () => {
    it('should write bytes correctly', () => {
      const count = 16;
      const size = 3;

      const builder = new BufferBuilder();
      const buffer = new Buffer(size * count);

      for (let i = 0; i < count; i++) {
        const value = Math.floor(Math.random() * 0xffffff);

        builder.writeUInt24LE(value);
        buffer.writeUInt8(value & 0xff, i * size);
        buffer.writeUInt16LE((value & 0xffff00) >> 8, i * size + 1);
      }

      const actual = builder.getBuffer();
      buffer.should.deep.equal(actual);
    });
  });

  describe('#writeBytes()', () => {
    it('should write bytes correctly', () => {
      const count = 16;
      const size = 8;

      const builder = new BufferBuilder();
      const buffer = new Buffer(size * count);

      for (let i = 0; i < count; i++) {
        const value = crypto.pseudoRandomBytes(size);
        builder.writeBytes(value);
        value.copy(buffer, i * size);
      }

      const actual = builder.getBuffer();
      buffer.should.deep.equal(actual);
    });
  });
});
