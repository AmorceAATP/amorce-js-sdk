#!/bin/bash
# Cross-SDK Compatibility Test Runner
# This script runs both directions of the cross-SDK compatibility test

set -e  # Exit on error

echo "========================================================"
echo "  Cross-SDK Compatibility Test Suite"
echo "  Testing nexus-js-sdk v0.1.7 ↔ nexus-py-sdk v0.1.7"
echo "========================================================"
echo ""

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "Step 1/4: Building JavaScript SDK..."
npm run build
echo "✅ Build complete"
echo ""

echo "Step 2/4: JavaScript → Python Test"
echo "-----------------------------------"
echo "Generating signature with JavaScript SDK..."
npx ts-node src/__tests__/cross-sdk-js-to-python.ts
echo ""

echo "Verifying with Python SDK..."
python3 src/__tests__/verify-js-with-python.py
echo ""

echo "Step 3/4: Python → JavaScript Test"
echo "-----------------------------------"
echo "Generating signature with Python SDK..."
python3 src/__tests__/cross-sdk-python-to-js.py
echo ""

echo "Verifying with JavaScript SDK..."
npx ts-node src/__tests__/verify-python-with-js.ts
echo ""

echo "========================================================"
echo "  ✅ All Cross-SDK Tests Passed!"
echo "========================================================"
echo ""
echo "Summary:"
echo "  ✅ JavaScript SDK → Python SDK verification: PASSED"
echo "  ✅ Python SDK → JavaScript SDK verification: PASSED"
echo ""
echo "Conclusion: nexus-js-sdk v0.1.7 and nexus-py-sdk v0.1.7"
echo "          are fully compatible and can verify each other's"
echo "          signatures successfully."
echo ""
