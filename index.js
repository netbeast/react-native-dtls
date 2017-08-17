

const DtlsServer = require('./DtlsServer');
const DtlsSocket = require('./DtlsSocket');


module.exports = {
  DtlsServer: DtlsServer,
  createServer: DtlsServer.createServer,
  connect: DtlsSocket.connect,
};
