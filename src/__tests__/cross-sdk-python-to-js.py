#!/usr/bin/env python3
"""
Cross-SDK Compatibility Test: Python → JavaScript

This script:
1. Generates an identity using the Python SDK
2. Signs a canonical payload
3. Exports the public key, signature, and payload for JavaScript verification
"""

import json
import os
import sys

# Add parent directory to path to import nexus
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'nexus_py_sdk'))

from nexus import IdentityManager
from nexus.crypto import InMemoryProvider
from cryptography.hazmat.primitives.asymmetric import ed25519

def main():
    print('=== Cross-SDK Compatibility Test: Python → JavaScript ===\n')

    # 1. Generate identity
    print('1. Generating identity with Python SDK...')
    identity = IdentityManager.generate_ephemeral()
    
    public_key_pem = identity.public_key_pem
    agent_id = identity.agent_id
    
    print(f'   Agent ID: {agent_id}')
    print(f'   Public Key (first 50 chars): {public_key_pem[:50]}...')

    # 2. Create a test payload (matching JS SDK format)
    payload = {
        'service_id': 'srv_test_002',
        'consumer_agent_id': agent_id,
        'payload': {
            'intent': 'cross_sdk_test',
            'message': 'Hello from Python SDK!'
        },
        'priority': 'normal'
    }

    print('\n2. Creating canonical payload...')
    print(f'   Payload: {json.dumps(payload, indent=2)}')

    # 3. Sign the payload
    print('\n3. Signing payload with Python SDK...')
    canonical_bytes = identity.get_canonical_json_bytes(payload)
    signature = identity.sign_data(canonical_bytes)
    
    canonical_str = canonical_bytes.decode('utf-8')
    print(f'   Canonical JSON: {canonical_str}')
    print(f'   Signature (first 50 chars): {signature[:50]}...')

    # 4. Export data for JavaScript verification
    export_data = {
        'public_key_pem': public_key_pem,
        'agent_id': agent_id,
        'payload': payload,
        'signature': signature,
        'canonical_json': canonical_str
    }

    export_path = os.path.join(os.path.dirname(__file__), 'python_to_js_data.json')
    with open(export_path, 'w') as f:
        json.dump(export_data, f, indent=2)
    
    print(f'\n4. Exported data to: {export_path}')
    print('\n✅ Python SDK test complete!')
    print('\nNext: Run the JavaScript verification script to verify this signature.')

if __name__ == '__main__':
    main()
