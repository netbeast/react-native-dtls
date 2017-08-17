

const dtls = require('../');
const fs = require('react-native-level-fs');
const dgram = require('react-native-udp');
const crypto = require('react-native-crypto');
const events = require('events');
const argv = require('minimist')(process.argv.slice(2));

argv.integrity = argv.integrity || false;
argv.size = argv.size || 8000;
argv.batch = argv.batch || 20;
argv.acktime = argv.acktime || 20;
argv.udp = argv.udp || false;
argv.port = argv.port || 23395;
argv.time = argv.time || 5000;
console.log('Using Arguments', argv, '\n');

const buffer = crypto.pseudoRandomBytes(argv.size);
let sendCount = 0;
let receiveCount = 0;
let receiveCountOnBatchStart = 0;
let ackCount = 0;
let ackTimedoutCount = 0;
let ackTimeout;
let serverSocket;
let clientSocket;

if (!argv.udp) {
  const pem = fs.readFileSync('server.pem');
  const server = dtls.createServer({
    type: 'udp4',
    key: pem,
    cert: pem,
  });
  server.bind(argv.port);
  server.on('secureConnection', (socket) => {
    serverSocket = socket;
    onServerConnect();
  });
  clientSocket = dtls.connect(argv.port, 'localhost', 'udp4', onClientConnect);
} else {
  const onUdpBind = function (socket) {
    socket.port = socket.udp.address().port;
    socket.udp.on('message', onUdpMessage.bind(null, socket));
    socket.emit('bind');
  };
  var onUdpMessage = function (socket, msg) {
    socket.emit('message', msg);
  };
  const udpSend = function (socket, target, msg) {
    socket.udp.send(msg, 0, msg.length, target.port, '127.0.0.1');
  };
  serverSocket = new events.EventEmitter();
  clientSocket = new events.EventEmitter();
  serverSocket.udp = dgram.createSocket('udp4');
  clientSocket.udp = dgram.createSocket('udp4');
  serverSocket.send = udpSend.bind(null, serverSocket, clientSocket);
  clientSocket.send = udpSend.bind(null, clientSocket, serverSocket);
  // bind the client first, and then the server,
  // so that first ack will be sent to client and received
  clientSocket.on('bind', () => {
    onClientConnect();
    serverSocket.on('bind', onServerConnect);
    serverSocket.udp.bind(onUdpBind.bind(null, serverSocket));
  });
  clientSocket.udp.bind(onUdpBind.bind(null, clientSocket));
}


function onClientConnect () {
  console.log('Client connected.');
  // when we get the server ack we send the next batch
  clientSocket.on('message', sendBatch);
}

function sendBatch () {
  for (let i = 0; i < argv.batch; i += 1) {
    clientSocket.send(buffer);
  }
  sendCount += argv.batch;
}

function onServerConnect () {
  console.log('Server connected.');

  // timer to finish the test
  setTimeout(finish, argv.time);

  // track received messages
  serverSocket.on('message', onServerReceive);

  // send first ack to start off the sender
  sendAck();
}

function onServerReceive (msg) {
  receiveCount += 1;
  testMessage(msg);
  doAck();
}

function doAck (timedout) {
  // count the number of acks we force from the ackTimeout
  if (timedout) {
    ackTimedoutCount += 1;
    sendAck();
    return;
  }

  // got a complete batch, send ack
  if (receiveCount === receiveCountOnBatchStart + argv.batch) {
    sendAck();
  }
}

function sendAck () {
  ackCount += 1;
  if (ackCount % 100 === 0) {
    process.stdout.write('.');
  }

  // keep the receive count at this point of sending ack so that we know a full batch was send
  receiveCountOnBatchStart = receiveCount;
  serverSocket.send('ack');

  // set a timer to send next ack, so that even if a full batch is not received we still continue
  clearTimeout(ackTimeout);
  ackTimeout = setTimeout(doAck, argv.acktime, 'timedout');
}

function testMessage (msg) {
  if (argv.integrity && !msg.equals(buffer)) {
    console.error('Buffers differ!');
    console.error(buffer);
    console.error(msg);
    process.exit(-1);
  }
}

function finish () {
  const throughput = receiveCount * buffer.length / (argv.time / 1000) / 1024;
  console.log('\n');
  console.log('Sent Packets     :', sendCount);
  console.log('Received Packets :', receiveCount);
  console.log('Acks             :', ackCount, `(${ackTimedoutCount} timedout)`);
  console.log('Size             :', `${buffer.length} B`);
  console.log('Time             :', `${argv.time} ms`);
  console.log('Throughput       :', throughput.toFixed(3), 'KB/s');

  // there is no socket.close() so we exit for now
  serverSocket.removeAllListeners('message');
  clientSocket.removeAllListeners('message');
  process.exit(0);
}
