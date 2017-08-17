

const dtls = require('../');

var client = dtls.connect(4433, 'localhost', 'udp4', () => {
  client.send(new Buffer('foo\n'));
});

client.on('message', (msg) => {
  console.log('Received application data');
  console.log(msg);
});
