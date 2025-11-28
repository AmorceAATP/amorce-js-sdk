# Nexus TypeScript/JavaScript SDK (NATP)

[![npm version](https://img.shields.io/npm/v/@nexus/sdk.svg)](https://www.npmjs.com/package/@nexus/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Official TypeScript/JavaScript SDK for the Nexus Agent Transaction Protocol (NATP).**

The Nexus SDK allows any JavaScript application (Node.js or Browser) to become a verified node in the **Agent Economy**. It provides the cryptographic primitives (Ed25519 via `libsodium`) and the transport layer required to transact securely with AI Agents (OpenAI, Google Gemini, Apple Intelligence).

---

## 🚀 Features

* **Zero-Trust Security**: Every request is cryptographically signed (Ed25519) locally.
* **Agent Identity**: Manage your agent's identity and keys securely without complexity.
* **Priority Lane**: Mark critical messages (`high`, `critical`) to bypass network congestion.
* **Resilience**: Automatic retry logic with exponential backoff for unstable networks (handles 503, 429).
* **Developer Experience (v0.1.7)**: Simplified `IdentityManager` with auto-derived Agent IDs and provider pattern.
* **Robust Error Handling**: Specific exceptions (`NexusNetworkError`, `NexusAPIError`) for reliable production code.
* **Isomorphic**: Works in Node.js and Modern Browsers.
* **Type Safe**: Native TypeScript support for robust development.

---

## 📦 Installation

```bash
npm install @nexus/sdk
```

The SDK automatically includes all required dependencies (`libsodium-wrappers`, `fast-json-stable-stringify`, `uuid`, `fetch-retry`, `cross-fetch`).

---

## ⚡ Quick Start

### 1. Identity Setup

An Agent is defined by its **Private Key**. Never share this key.

#### Option A: Quick Start (Ephemeral / Testing)

Generate a new identity in memory instantly. Perfect for QA scripts or temporary bots.

```typescript
import { IdentityManager } from '@nexus/sdk';

// Generates a fresh Ed25519 keypair in memory (Ephemeral)
const identity = await IdentityManager.generate();

// The Agent ID is automatically derived from the Public Key (SHA-256)
console.log(`Agent ID: ${identity.getAgentId()}`);
console.log(`Public Key: ${identity.getPublicKeyPem()}`);
```

#### Option B: Production (Secure Storage)

Load your identity from a secure source or environment variable.

```typescript
import { IdentityManager, EnvVarProvider } from '@nexus/sdk';

// Load from Environment Variable (Recommended for production)
const provider = new EnvVarProvider('AGENT_PRIVATE_KEY');
const identity = await IdentityManager.fromProvider(provider);

console.log(`Agent ID: ${identity.getAgentId()}`);
```

### 2. Sending a Transaction (Full Example)

Use the `NexusClient` to discover services and execute transactions.

```typescript
import { 
  NexusClient, 
  IdentityManager, 
  PriorityLevel,
  NexusNetworkError,
  NexusAPIError 
} from '@nexus/sdk';

// Configuration (Use Env Vars in Prod!)
const DIRECTORY_URL = process.env.NEXUS_DIRECTORY_URL || 'https://directory.amorce.io';
const ORCHESTRATOR_URL = process.env.NEXUS_ORCHESTRATOR_URL || 'https://api.amorce.io';

// 1. Generate or load identity
const identity = await IdentityManager.generate();

// 2. Initialize the client
// Note: 'agent_id' is automatically derived from the identity object.
const client = new NexusClient(
  identity,
  DIRECTORY_URL,
  ORCHESTRATOR_URL
);

// 3. Define the payload (The "Letter" inside the transaction)
const payload = {
  intent: 'book_reservation',
  params: { date: '2025-10-12', guests: 2 }
};

// 4. Execute with PRIORITY
// Options: PriorityLevel.NORMAL, .HIGH, .CRITICAL
console.log(`Sending transaction from ${identity.getAgentId()}...`);

try {
  const response = await client.transact(
    { service_id: 'srv_restaurant_01' },
    payload,
    PriorityLevel.HIGH
  );
  
  if (response.status === 'success') {
    console.log(`✅ Success! Tx ID: ${response.transaction_id}`);
    console.log(`Data:`, response.data);
  } else {
    console.log(`⚠️ Server Error:`, response);
  }
} catch (e) {
  if (e instanceof NexusNetworkError) {
    console.error(`❌ Network Error (Retryable):`, e.message);
  } else if (e instanceof NexusAPIError) {
    console.error(`❌ API Error ${e.statusCode}:`, e.responseBody);
  } else {
    console.error(`❌ Unexpected Error:`, e);
  }
}
```

### 3. Error Handling

The SDK provides specific exceptions for robust error handling:

```typescript
import { 
  NexusClient, 
  NexusConfigError, 
  NexusNetworkError, 
  NexusAPIError 
} from '@nexus/sdk';

try {
  await client.transact(...);
} catch (e) {
  if (e instanceof NexusConfigError) {
    console.error('Configuration Error:', e.message);
  } else if (e instanceof NexusNetworkError) {
    console.error('Network Error:', e.message); // Retry might be possible
  } else if (e instanceof NexusAPIError) {
    console.error(`API Error ${e.statusCode}:`, e.responseBody);
  } else {
    console.error('Unexpected Error:', e);
  }
}
```

---

## 🛡️ Architecture & Security

The SDK implements the **NATP v0.1** standard strictly.

1. **Identity**: Keys are managed via the `IdentityManager` with pluggable providers.
2. **Canonicalization**: JSON payloads are serialized canonically (RFC 8785) to ensure signature consistency.
3. **Signing**: Transactions are signed locally using Ed25519.
4. **Transport**: The signed data is sent via HTTP/2 to the Orchestrator.
5. **Verification**: The receiver verifies the signature against the Trust Directory before processing.

### Transaction Protocol (v0.1.7)

The SDK uses a **flat JSON structure** for transactions:

```typescript
{
  service_id: "srv_example_01",
  consumer_agent_id: "auto-derived-sha256-hash",
  payload: { /* your data */ },
  priority: "normal"
}
```

The signature is sent in the `X-Agent-Signature` header, not embedded in the payload.

---

## 🔧 Troubleshooting & FAQ

**Q: I get a `NexusAPIError` when transacting.**  
A: Check the status code and response body in the error object. Common issues include invalid service IDs or missing API keys.

**Q: I get `NexusConfigError` about invalid URLs.**  
A: Ensure your `DIRECTORY_URL` and `ORCHESTRATOR_URL` start with `http://` or `https://`.

**Q: How do I get my Agent ID?**  
A: Do not hardcode it. Access it via `identity.getAgentId()`. It is the SHA-256 hash of your public key.

**Q: Does this work in the browser?**  
A: Yes! The SDK is isomorphic and works in both Node.js and modern browsers. Make sure your build tool supports the required dependencies.

**Q: How do I use environment variables in the browser?**  
A: Use build tools like Webpack or Vite that support environment variable injection at build time.

---

## 📚 API Reference

### `IdentityManager`

#### Static Methods

* `generate(): Promise<IdentityManager>` - Generates a new ephemeral identity.
* `fromProvider(provider: IdentityProvider): Promise<IdentityManager>` - Loads identity from a provider.
* `fromPrivateKey(privateKey: Uint8Array): Promise<IdentityManager>` - Loads from raw private key (legacy).
* `verify(message, signatureBase64, publicKey): Promise<boolean>` - Verifies a signature.
* `getCanonicalJsonBytes(payload): Uint8Array` - Returns canonical JSON bytes for signing.

#### Instance Methods

* `getPublicKeyPem(): string` - Returns public key in PEM format.
* `getAgentId(): string` - Returns SHA-256 hash of public key (auto-derived agent ID).
* `sign(message): Promise<string>` - Signs a message and returns base64 signature.

### `NexusClient`

#### Constructor

```typescript
new NexusClient(
  identity: IdentityManager,
  directoryUrl: string,
  orchestratorUrl: string,
  agentId?: string,  // Optional, auto-derived from identity if not provided
  apiKey?: string    // Optional API key for orchestrator
)
```

#### Methods

* `discover(serviceType: string): Promise<ServiceContract[]>` - Discovers services from Trust Directory.
* `transact(serviceContract, payload, priority?): Promise<any>` - Executes a transaction.

### Exception Classes

* `NexusError` - Base exception class
* `NexusConfigError` - Configuration errors
* `NexusNetworkError` - Network errors
* `NexusAPIError` - API errors (includes `statusCode` and `responseBody`)
* `NexusSecurityError` - Security/crypto errors
* `NexusValidationError` - Validation errors

---

## 🛠️ Development

To contribute to the SDK:

```bash
# Clone the repository
git clone https://github.com/trebortGolin/nexus-js-sdk.git
cd nexus-js-sdk

# Install dependencies
npm install

# Build the SDK
npm run build

# Run tests
npm test

# Lint the code
npm run lint
```

---

## 📄 License

This project is licensed under the MIT License.

---

## 🔗 Related Projects

* [nexus-py-sdk](https://github.com/trebortGolin/nexus_py_sdk) - Python SDK for NATP
* [amorce-trust-directory](https://github.com/trebortGolin/amorce-trust-directory) - Trust Directory service
* [nexus-console](https://github.com/trebortGolin/nexus-console) - Management console

---

## 📝 Changelog

### v0.1.7 (2025-11-28)
* **[BREAKING]** Updated transaction protocol to use flat JSON structure with signature in header
* **[BREAKING]** Changed API key header from `X-ATP-Key` to `X-API-Key`
* Added comprehensive exception hierarchy for better error handling
* Added provider pattern for flexible identity management (`EnvVarProvider`)
* Added auto-derived Agent ID (SHA-256 of public key)
* Added `getCanonicalJsonBytes()` static utility
* Improved URL validation in `NexusClient` constructor
* Enhanced documentation and examples

### v0.1.2
* Added Priority Lane support
* Added automatic retry logic with exponential backoff
* Fixed PEM encoding issues

### v0.1.0
* Initial release