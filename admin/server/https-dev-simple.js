const https = require('https');
const fs = require('fs');
const path = require('path');

// Import existing express app
const express = require('express');
const app = require('./index.js');

// Create a simple self-signed certificate
const crypto = require('crypto');

// Generate key pair
const key = crypto.generateKeyPairSync('rsa', {
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

// Generate certificate
const cert = crypto.createX509Certificate({
  key: key.privateKey,
  sign: key.privateKey,
  issuer: { CN: 'localhost' },
  subject: { CN: 'localhost' },
  extensions: [
    {
      name: 'subjectAltName',
      altNames: ['localhost', '127.0.0.1']
    }
  ],
  days: 365
});

// Write certificate files
fs.writeFileSync('server.key', key.privateKey);
fs.writeFileSync('server.cert', cert);

const options = {
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.cert')
};

// Create HTTPS server
const httpsServer = https.createServer(options, app);

const PORT = process.env.HTTPS_PORT || 3002;

httpsServer.listen(PORT, () => {
  console.log(`HTTPS Server running at https://localhost:${PORT}`);
  console.log('Note: Browser will show security warning for self-signed certificate');
  console.log('This is normal for development environment');
  console.log('You can proceed past security warning');
});
