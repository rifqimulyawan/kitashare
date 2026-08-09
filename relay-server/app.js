// Passenger entry point for Hostinger hPanel
// This file is required by Phusion Passenger to start the Node.js app
// Load secret from file if env var not set
if (!process.env.KITASHARE_RELAY_SECRET) {
  try {
    const secret = require('./secret.json');
    if (secret.KITASHARE_RELAY_SECRET) {
      process.env.KITASHARE_RELAY_SECRET = secret.KITASHARE_RELAY_SECRET;
    }
  } catch {}
}
require('./dist/index.js');
