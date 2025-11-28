/**
 * Cross-SDK Verification: Verify Python SDK Signature with JavaScript SDK
 * 
 * This script reads the data exported by the Python SDK and verifies
 * the signature using the JavaScript SDK.
 */

import { IdentityManager } from '../index';
import * as fs from 'fs';
import * as path from 'path';
import sodium from 'libsodium-wrappers';

async function main() {
    console.log('=== Verifying Python SDK Signature with JavaScript SDK ===\n');

    // 1. Load data exported by Python SDK
    const dataPath = path.join(__dirname, 'python_to_js_data.json');

    if (!fs.existsSync(dataPath)) {
        console.log(`❌ Error: ${dataPath} not found!`);
        console.log('Please run the Python test first: python3 src/__tests__/cross-sdk-python-to-js.py');
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

    console.log('1. Loaded data from Python SDK:');
    console.log(`   Agent ID: ${data.agent_id}`);
    console.log(`   Signature (first 50 chars): ${data.signature.substring(0, 50)}...`);

    // 2. Get canonical bytes
    const canonicalJson = data.canonical_json;
    const canonicalBytes = new TextEncoder().encode(canonicalJson);

    console.log(`\n2. Canonical JSON: ${canonicalJson}`);

    // 3. Parse public key from PEM
    console.log('\n3. Verifying signature with JavaScript SDK...');

    await sodium.ready;

    // Extract public key bytes from PEM
    const publicKeyPem = data.public_key_pem;
    const b64 = publicKeyPem
        .replace('-----BEGIN PUBLIC KEY-----', '')
        .replace('-----END PUBLIC KEY-----', '')
        .replace(/\s/g, '');

    const fullBytes = sodium.from_base64(b64, sodium.base64_variants.ORIGINAL);

    // Strip ASN.1 header (last 32 bytes is the raw Ed25519 key)
    const publicKeyBytes = fullBytes.slice(fullBytes.length - 32);

    // 4. Verify signature using JS SDK
    const isValid = await IdentityManager.verify(
        canonicalBytes,
        data.signature,
        publicKeyBytes
    );

    // 5. Report results
    console.log('\n' + '='.repeat(60));
    if (isValid) {
        console.log('✅ SUCCESS: JavaScript SDK verified Python SDK signature!');
        console.log('='.repeat(60));
        console.log('\n🎉 Cross-SDK compatibility confirmed: Python → JS');
        process.exit(0);
    } else {
        console.log('❌ FAILURE: JavaScript SDK could not verify Python SDK signature!');
        console.log('='.repeat(60));
        console.log('\n⚠️  SDKs are NOT compatible');
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
});
