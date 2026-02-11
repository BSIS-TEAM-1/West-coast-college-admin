const crypto = require('crypto');
const fs = require('fs');

// Generate self-signed certificate for development
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

const cert = crypto.selfSign({
  key: privateKey,
  cert: publicKey,
  issuer: { CN: 'localhost' },
  subject: { CN: 'localhost' },
  extensions: [
    {
      name: 'subjectAltName',
      altNames: ['localhost']
    }
  ],
  days: 365
});

fs.writeFileSync('server.key', privateKey);
fs.writeFileSync('server.cert', cert);

console.log('Self-signed certificate generated for localhost');
console.log('Files created: server.key, server.cert');
