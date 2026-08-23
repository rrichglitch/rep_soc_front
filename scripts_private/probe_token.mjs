// Quick probe: connect to maincloud repsoc with a relay-minted identity token
import { DbConnection } from '../src/module_bindings/index.ts';

const uri = 'wss://maincloud.spacetimedb.com';
const db = 'repsoc';
const token = process.argv[2];

if (!token) { console.error('usage: node probe_token.mjs <token>'); process.exit(1); }

try {
  const conn = await DbConnection.builder()
    .withUri(uri)
    .withDatabaseName(db)
    .withToken(token)
    .onConnect((c, id) => console.log('CONNECTED identity:', id.toHexString()))
    .onDisconnect(() => console.log('DISCONNECTED'))
    .onConnectError((_c, err) => console.error('CONNECT_ERROR:', err))
    .build();

  await new Promise(r => setTimeout(r, 5000));
  console.log('connection alive:', conn.isActive ? 'yes' : 'no');
  conn.disconnect();
  process.exit(0);
} catch (e) {
  console.error('BUILD FAILED:', e.message ?? e);
  process.exit(1);
}