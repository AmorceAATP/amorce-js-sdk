/**
 * Cross-SDK Compatibility Test: JavaScript → Python
 * 
 * This script:
 * 1. Generates an identity using the JS SDK
 * 2. Signs a canonical payload
 * 3. Exports the public key, signature, and payload for Python verification
 */

import { IdentityManager } from '../index';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    console.log('=== Cross-SDK Compatibility Test: JS → Python ===\n');

    // 1. Generate identity
    console.log('1. Generating identity with JS SDK...');
    const identity = await IdentityManager.generate();

    const publicKeyPem = identity.getPublicKeyPem();
    const agentId = identity.getAgentId();

    console.log(`   Agent ID: ${agentId}`);
    console.log(`   Public Key (first 50 chars): ${publicKeyPem.substring(0, 50)}...`);

    // 2. Create a test payload (matching Python SDK format)
    const payload = {
        service_id: 'srv_test_001',
        consumer_agent_id: agentId,
        payload: {
            intent: 'cross_sdk_test',
            message: 'Hello from JavaScript SDK!'
        },
        priority: 'normal'
    };

    console.log('\n2. Creating canonical payload...');
    console.log(`   Payload:`, JSON.stringify(payload, null, 2));

    // 3. Sign the payload
    console.log('\n3. Signing payload with JS SDK...');
    const canonicalBytes = IdentityManager.getCanonicalJsonBytes(payload);
    const signature = await identity.sign(canonicalBytes);

    console.log(`   Canonical JSON: ${new TextDecoder().decode(canonicalBytes)}`);
    console.log(`   Signature (first 50 chars): ${signature.substring(0, 50)}...`);

    // 4. Export data for Python verification
    const exportData = {
        public_key_pem: publicKeyPem,
        agent_id: agentId,
        payload: payload,
        signature: signature,
        canonical_json: new TextDecoder().decode(canonicalBytes)
    };

    const exportPath = path.join(__dirname, 'js_to_python_data.json');
    fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));

    console.log(`\n4. Exported data to: ${exportPath}`);
    console.log('\n✅ JavaScript SDK test complete!');
    console.log('\nNext: Run the Python verification script to verify this signature.');
}

main().catch(console.error);
