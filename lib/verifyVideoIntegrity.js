const fs = require('fs');
const crypto = require('crypto');

function verifyVideoIntegrity(videoFilePath, expectedHash) {
  if (typeof expectedHash !== 'string' || !/^[0-9a-fA-F]{64}$/.test(expectedHash)) {
    throw new Error('InvalidHashFormat');
  }

  let stat;
  try {
    stat = fs.statSync(videoFilePath);
    if (!stat.isFile()) throw new Error('FileNotFound');
  } catch (e) {
    throw new Error('FileNotFound');
  }

  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(videoFilePath);

    stream.on('data', (chunk) => {
      hash.update(chunk);
    });

    stream.on('end', () => {
      const actualHash = hash.digest('hex');
      resolve({
        verified: actualHash === expectedHash.toLowerCase(),
        actualHash: actualHash
      });
    });

    stream.on('error', (err) => {
      reject(new Error('FileNotFound'));
    });
  });
}

module.exports = { verifyVideoIntegrity };
