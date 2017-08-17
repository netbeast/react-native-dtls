

const fs = require('react-native-level-fs');
const spawn = require('child_process').spawn;
const dtls = require('../');

const cert = fs.readFileSync(`${__dirname}/assets/certificate.pem`);

describe('openssl', () => {
  it('should validate itself', function (done) {
    this.slow(500);

    // Spawn the client a bit later. Give the UDP port time to init.
    const server = spawn('openssl',
      ['s_server',
        '-accept', 24126,
        '-key', `${__dirname}/assets/certificate.pem`,
        '-cert', `${__dirname}/assets/certificate.pem`,
        '-state', '-msg', '-debug',
        '-dtls1']);

    server.stdout.setEncoding('ascii');
    server.stdout.on('data', (data) => {
      if (data.indexOf('### client->server\n') !== -1) {
        server.stdin.write('### server->client\n');
      }
    });

    // Spawn the client a bit later. Give the UDP port time to init.
    let client;
    setTimeout(() => {
      client = spawn('openssl',
        ['s_client', '-port', 24126, '-dtls1', '-state', '-msg', '-debug']);

      client.stdout.setEncoding('ascii');
      client.stdout.on('data', (data) => {
        if (data.indexOf('### server->client\n') !== -1) {
          done();
          client.kill();
          server.kill();
        }
      });
    }, 50);

    setTimeout(() => {
      client.stdin.write('### client->server\n');
    }, 100);
  });

  describe('s_client', () => {
    it('should connect to node-dtls server with DTLSv1', function (done) {
      this.slow(150);

      const server = dtls.createServer({
        type: 'udp4',
        key: cert,
        cert: cert,
      });
      server.bind(24124);

      // Spawn the client a bit later. Give the UDP port time to init.
      let client;
      setTimeout(() => {
        client = spawn('openssl',
          ['s_client', '-port', 24124, '-dtls1']);

        client.stdout.setEncoding('ascii');
        client.stdout.on('data', (data) => {
          if (data.indexOf('### node->openssl\n') !== -1) {
            client.kill();
            done();
          }
        });
      }, 10);

      server.on('secureConnection', (socket) => {
        client.stdin.write('### openssl->node\n');
        socket.on('message', (msg) => {
          msg.should.deep.equal(new Buffer('### openssl->node\n'));
          socket.send(new Buffer('### node->openssl\n'));
        });
      });
    });
  });

  describe('s_server', () => {
    it('should accept node-dtls client with DTLSv1', function (done) {
      this.slow(300);

      // Spawn the client a bit later. Give the UDP port time to init.
      const server = spawn('openssl',
        ['s_server',
          '-accept', 24125,
          '-key', `${__dirname}/assets/certificate.pem`,
          '-cert', `${__dirname}/assets/certificate.pem`,
          '-dtls1']);


      server.stdout.setEncoding('ascii');
      server.stdout.on('data', (data) => {
        if (data === '### node->openssl\n') {
          server.stdin.write('### openssl->node\n');
        }
      });

      setTimeout(() => {
        dtls.connect(24125, 'localhost', 'udp4', (client) => {
          client.send(new Buffer('### node->openssl\n'));

          client.on('message', (msg) => {
            msg.should.deep.equal(new Buffer('### openssl->node\n'));
            server.kill();
            done();
          });
        });
      }, 100);
    });
  });
});
