

const dtls = require('../');
const fs = require('react-native-level-fs');

const pem = fs.readFileSync('server.pem');

const server = dtls.createServer({
  type: 'udp4',
  key: pem,
  cert: pem,
});
server.bind(4433);

server.on('secureConnection', (socket) => {
  console.log(`New connection from ${
    [socket.rinfo.address, socket.rinfo.port].join(':')}`);

  socket.on('message', (message) => {
    // Get the ascii encoded text content and trim whitespace at the end.
    const inText = message.toString('ascii').replace(/\s*$/, '');
    const outText = `[ECHO]${inText}[/ECHO]`;

    console.log(`in:  ${inText}`);
    console.log(`out: ${outText}`);
    socket.send(new Buffer(`${outText}\n`, 'ascii'));
  });
});

