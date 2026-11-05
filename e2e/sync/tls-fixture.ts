import { readFileSync } from 'node:fs';
import { createHash, X509Certificate } from 'node:crypto';

// Public test-only key: never used in a production build or for real accounts.
export const fixtureTls = {
  cert: readFileSync(new URL('./certs/localhost.pem', import.meta.url)),
  key: readFileSync(new URL('./certs/localhost-key.pem', import.meta.url)),
};

// Trust only this fixture's public key in the isolated test browser. Production
// TLS validation remains unchanged; no blanket ignoreHTTPSErrors is enabled.
export const fixtureSpki = createHash('sha256')
  .update(new X509Certificate(fixtureTls.cert).publicKey.export({ type: 'spki', format: 'der' }))
  .digest('base64');
