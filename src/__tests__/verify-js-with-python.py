#!/usr/bin/env python3
"""
Cross-SDK Verification: Verify JavaScript SDK Signature with Python SDK

This script reads the data exported by the JavaScript SDK and verifies
the signature using the Python SDK.
"""

import json
import os
import sys

# Add parent directory to path to import nexus
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'nexus_py_sdk'))

from nexus import IdentityManager

def main():
    print('=== Verifying JavaScript SDK Signature with Python SDK ===\n')

    # 1. Load data exported by JavaScript SDK
    data_path = os.path.join(os.path.dirname(__file__), 'js_to_python_data.json')
    
    if not os.path.exists(data_path):
        print(f'❌ Error: {data_path} not found!')
        print('Please run the JavaScript test first: npm run test:cross-sdk-js')
        sys.exit(1)

    with open(data_path, 'r') as f:
        data = json.load(f)

    print('1. Loaded data from JavaScript SDK:')
    print(f'   Agent ID: {data["agent_id"]}')
    print(f'   Signature (first 50 chars): {data["signature"][:50]}...')

    # 2. Get canonical bytes
    canonical_json = data['canonical_json']
    canonical_bytes = canonical_json.encode('utf-8')
    
    print(f'\n2. Canonical JSON: {canonical_json}')

    # 3. Verify signature using Python SDK
    print('\n3. Verifying signature with Python SDK...')
    
    public_key_pem = data['public_key_pem']
    signature = data['signature']
    
    is_valid = IdentityManager.verify_signature(
        public_key_pem, 
        canonical_bytes, 
        signature
    )

    # 4. Report results
    print('\n' + '='*60)
    if is_valid:
        print('✅ SUCCESS: Python SDK verified JavaScript SDK signature!')
        print('='*60)
        print('\n🎉 Cross-SDK compatibility confirmed: JS → Python')
        return 0
    else:
        print('❌ FAILURE: Python SDK could not verify JavaScript SDK signature!')
        print('='*60)
        print('\n⚠️  SDKs are NOT compatible')
        return 1

if __name__ == '__main__':
    sys.exit(main())
