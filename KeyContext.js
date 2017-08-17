

const crypto = require('react-native-crypto');

const certificateUtilities = require('./certificateUtilities');

const KeyContext = function (options) {
  this.key = options.key;

  if (options.key) { this.privateKey = certificateUtilities.extractKey(options.key); }

  if (options.cert) { this.certificate = certificateUtilities.extractCertificate(options.cert); }

  this.cookieSecret = crypto.randomBytes(32);
};

module.exports = KeyContext;
