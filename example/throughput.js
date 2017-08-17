

const dtls = require('../');
const fs = require('react-native-level-fs');
const crypto = require('react-native-crypto');

const testIntegrity = true;
const buffer = crypto.pseudoRandomBytes(1000);
let stop = false;
let count = 0;
const time = 5000;

const pem = fs.readFileSync('server.pem');

const server = dtls.createServer({
  type: 'udp4',
  key: pem,
  cert: pem,
});
server.bind(23395);

let serverSocket,
  clientSocket;
server.on('secureConnection', (socket) => {
  console.log('Server received client#Finished and is ready.');

  serverSocket = socket;

  serverSocket.on('message', (msg) => {
    if (stop) { return; }
    serverSocket.send(msg);
  });
});


clientSocket = dtls.connect(23395, 'localhost', 'udp4', () => {
  console.log('Client received server#Finished and is ready.');

  startTest();
});

clientSocket.on('message', (msg) => {
  if (stop) { return; }

  count++;

  if (testIntegrity && !msg.equals(buffer)) {
    console.error('Buffers differ!');
    console.error(buffer);
    console.error(msg);
    return;
  }

  clientSocket.send(msg);
});

var startTest = function () {
  count = 0;
  stop = false;

  clientSocket.send(buffer);
  clientSocket.send(buffer);
  clientSocket.send(buffer);
  clientSocket.send(buffer);
  clientSocket.send(buffer);
  clientSocket.send(buffer);
  clientSocket.send(buffer);
  clientSocket.send(buffer);
  clientSocket.send(buffer);

  setTimeout(() => {
    stop = true;
    console.log(`Packets:    ${count}`);
    console.log(`Size:       ${buffer.length} B`);
    console.log(`Time:       ${time} ms`);
    console.log(`Throughput: ${count * buffer.length / (time / 1000 * 1024)} KB/s`);
  }, time);
};

