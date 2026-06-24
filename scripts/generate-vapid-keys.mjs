/**
 * One-time VAPID key generation for Web Push notifications.
 * Run once: node scripts/generate-vapid-keys.mjs
 * Then follow the printed instructions.
 */
import { webcrypto } from 'node:crypto'

const { subtle } = webcrypto

const keyPair = await subtle.generateKey(
  { name: 'ECDH', namedCurve: 'P-256' },
  true,
  ['deriveKey', 'deriveBits'],
)

const [publicRaw, privateJwk] = await Promise.all([
  subtle.exportKey('raw', keyPair.publicKey),
  subtle.exportKey('jwk', keyPair.privateKey),
])

const pubKey = Buffer.from(publicRaw).toString('base64url')
const privKey = privateJwk.d // base64url-encoded raw private scalar

console.log('\n=== VAPID Keys — copy these and follow the steps below ===\n')
console.log(`VITE_VAPID_PUBLIC_KEY=${pubKey}`)
console.log(`VAPID_PRIVATE_KEY=${privKey}`)
console.log('\n--- Steps ---')
console.log('1. Add to your .env file:')
console.log(`   VITE_VAPID_PUBLIC_KEY=${pubKey}`)
console.log('\n2. Add to Supabase secrets (run in terminal):')
console.log(`   supabase secrets set VAPID_PRIVATE_KEY=${privKey}`)
console.log('\n3. Redeploy the place-order edge function:')
console.log('   supabase functions deploy place-order')
console.log('\n4. Run the SQL migration in Supabase SQL Editor:')
console.log('   (copy supabase/migrations/05_updates.sql and run it)\n')
