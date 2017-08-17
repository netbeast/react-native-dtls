

const SecurityParameters = require('./SecurityParameters');

const SecurityParameterContainer = function () {
  this.parameters = {};
  this.pending = null;
  this.first = new SecurityParameters(0);

  this.parameters[0] = this.first;
  this.current = 0;
};

SecurityParameterContainer.prototype.initNew = function (version) {
  this.pending = new SecurityParameters(this.current + 1, version);
  this.parameters[this.pending.epoch] = this.pending;
  return this.pending;
};

SecurityParameterContainer.prototype.getCurrent = function (epoch) {
  return this.parameters[epoch];
};

SecurityParameterContainer.prototype.get = function (packet) {
  return this.parameters[packet.epoch];
};

SecurityParameterContainer.prototype.changeCipher = function (epoch) {
  if (epoch + 1 !== this.pending.epoch) {
    return console.error('Trying to change cipher from',
      epoch, '->', epoch + 1,
      '- pending epoch is', this.pending.epoch);
  }

  this.pending.init();
  this.current++;
};

module.exports = SecurityParameterContainer;
