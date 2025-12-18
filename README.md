# Amorce TypeScript/JavaScript SDK (AATP)

[![npm version](https://img.shields.io/npm/v/@amorce/sdk.svg)](https://www.npmjs.com/package/@amorce/sdk)
[![GitHub](https://img.shields.io/github/stars/trebortGolin/amorce-js-sdk?style=social)](https://github.com/trebortGolin/amorce-js-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Demo](https://img.shields.io/badge/demo-marketplace-success.svg)](https://github.com/trebortGolin/agent-marketplace-demo)

**Official TypeScript/JavaScript SDK for the Amorce Agent Transaction Protocol (AATP).**

**See it in action**: [Agent Marketplace Demo](https://github.com/trebortGolin/agent-marketplace-demo) - Watch AI agents negotiate with cryptographic security

The Amorce SDK allows any JavaScript application (Node.js or Browser) to become a verified node in the **Agent Economy**. It provides the cryptographic primitives (Ed25519 via `libsodium`) and the transport layer required to transact securely with AI Agents (OpenAI, Google Gemini, Apple Intelligence).

---

## 🚀 Features

* **Zero-Trust Security**: Every request is cryptographically signed (Ed25519) locally.
* **Agent Identity**: Manage your agent's identity and keys securely without complexity.
* **Priority Lane**: Mark critical messages (`high`, `critical`) to bypass network congestion.
* **HTTP/2 Support (v2.1.0)**: Automatic HTTP/2 via undici for multiplexed connections and better performance.
* **Exponential Backoff + Jitter (v2.1.0)**: Advanced retry logic via p-retry (handles 429, 503, 504) with randomization to prevent thundering herd.
* **Idempotency Keys (v2.1.0)**: Auto-generated UUIDv4 for safe retries and transaction deduplication.
* **Structured Responses (v2.1.0)**: `AmorceResponse` with `isSuccess()` and `isRetryable()` utility methods.
* **Developer Experience**: Simplified `IdentityManager` with auto-derived Agent IDs and provider pattern.
* **Robust Error Handling**: Specific exceptions (`AmorceNetworkError`, `AmorceAPIError`) for reliable production code.
* **Isomorphic**: Works in Node.js (requires Node.js 18+) and Modern Browsers.
* **Type Safe**: Native TypeScript support for robust development.

---

## 📦 Installation

```bash
npm install @amorce/sdk
```

The SDK automatically includes all required dependencies (`libsodium-wrappers`, `fast-json-stable-stringify`, `uuid`, `undici`, `p-retry`).

**Requirements:** Node.js 18+ for optimal HTTP/2 support.

---

## ⚡ Quick Start

### 1. Identity Setup

An Agent is defined by its **Private Key**. Never share this key.

#### Option A: Quick Start (Ephemeral / Testing)

Generate a new identity in memory instantly. Perfect for QA scripts or temporary bots.

```typescript
import { IdentityManager } from '@amorce/sdk';

// Generates a fresh Ed25519 keypair in memory (Ephemeral)
const identity = await IdentityManager.generate();

// The Agent ID is automatically derived from the Public Key (SHA-256)
console.log(`Agent ID: ${identity.getAgentId()}`);
console.log(`Public Key: ${identity.getPublicKeyPem()}`);
```

#### Option B: Production (Secure Storage)

Load your identity from a secure source or environment variable.

```typescript
import { IdentityManager, EnvVarProvider } from '@amorce/sdk';

// Load from Environment Variable (Recommended for production)
const provider = new EnvVarProvider('AGENT_PRIVATE_KEY');
const identity = await IdentityManager.fromProvider(provider);

console.log(`Agent ID: ${identity.getAgentId()}`);
```

### 2. Sending a Transaction (Full Example)

Use the `AmorceClient` to discover services and execute transactions.

```typescript
import { 
  AmorceClient, 
  IdentityManager, 
  PriorityLevel,
  AmorceNetworkError,
  AmorceAPIError 
} from '@amorce/sdk';

// Configuration (Use Env Vars in Prod!)
const DIRECTORY_URL = process.env.AMORCE_DIRECTORY_URL || 'https://directory.amorce.io';
const ORCHESTRATOR_URL = process.env.AMORCE_ORCHESTRATOR_URL || 'https://api.amorce.io';

// 1. Generate or load identity
const identity = await IdentityManager.generate();

// 2. Initialize the client
// Note: 'agent_id' is automatically derived from the identity object.
const client = new AmorceClient(
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
  
  // v2.1.0: Response is now an AmorceResponse object with utility methods
  if (response.isSuccess()) {
    console.log(`✅ Success! Tx ID: ${response.transaction_id}`);
    console.log(`Data:`, response.result?.data);
  } else {
    console.log(`⚠️ Server Error:`, response);
  }
} catch (e) {
  if (e instanceof AmorceNetworkError) {
    console.error(`❌ Network Error (Retryable):`, e.message);
  } else if (e instanceof AmorceAPIError) {
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
  AmorceClient, 
  AmorceConfigError, 
  AmorceNetworkError, 
  AmorceAPIError 
} from '@amorce/sdk';

try {
  await client.transact(...);
} catch (e) {
  if (e instanceof AmorceConfigError) {
    console.error('Configuration Error:', e.message);
  } else if (e instanceof AmorceNetworkError) {
    console.error('Network Error:', e.message); // Retry might be possible
  } else if (e instanceof AmorceAPIError) {
    console.error(`API Error ${e.statusCode}:`, e.responseBody);
  } else {
    console.error('Unexpected Error:', e);
  }
}
```

---

## 🛡️ For Builders: Protect Your API

**Are you building an AI Agent?** Use the SDK to verify incoming requests on your server.

### Why This Matters

- ✅ **Cryptographic proof** of sender identity (Ed25519 signatures)
- ✅ **Zero-trust by default** - every request is verified
- ✅ **Intent whitelisting** - only allow specific actions  
- ✅ **Automatic key revocation** - invalid agents rejected instantly
- ✅ **No maintenance burden** - public keys auto-fetched from Trust Directory

### How to Verify Requests

```typescript
import { verifyRequest, AmorceSecurityError } from '@amorce/sdk';
import express from 'express';

const app = express();

app.post('/api/v1/webhook', express.json(), async (req, res) => {
  try {
    // ✅ AUTOMATIC VERIFICATION
    // SDK fetches public key from Trust Directory and verifies signature
    const verified = await verifyRequest({
      headers: req.headers,
      body: JSON.stringify(req.body),
      allowedIntents: ['book_table', 'check_availability', 'cancel']
    });
    
    console.log(`✅ Verified request from: ${verified.agentId}`);
    console.log(`Intent: ${verified.payload.payload.intent}`);
    
    // Your business logic here - 100% sure it's legitimate
    if (verified.payload.payload.intent === 'book_table') {
      return res.json({ status: 'confirmed', table: 'A5', time: '19:00' });
    }
    
  } catch (e) {
    if (e instanceof AmorceSecurityError) {
      console.log(`❌ Rejected: ${e.message}`);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    throw e;
  }
});
```

**That's it!** Your API is now protected by cryptographic verification.

### Advanced: Manual Public Key (Offline/Testing)

For testing or private networks, you can skip the Trust Directory lookup:

```typescript
// Provide public key directly (no network call)
const verified = await verifyRequest({
  headers: req.headers,
  body: req.body,
  publicKey: "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
});
```

---

## 📋 Register Your Agent (Optional)

Want to list your service in the Amorce Network? Generate your manifest:

```typescript
const identity = await IdentityManager.generate();

// 🖨️  Generate manifest JSON
const manifest = identity.toManifestJson({
  name: 'My Restaurant Bot',
  endpoint: 'https://my-api.example.com/api/v1/webhook',
  capabilities: ['book_table', 'check_availability', 'cancel_reservation'],
  description: 'Fine dining reservations with real-time availability'
});

// Save it
import fs from 'fs';
fs.writeFileSync('agent-manifest.json', manifest);

console.log('✅ Manifest created! Submit it to the Trust Directory to get listed.');
```

**What you get:**
- 🌐 Discoverable by other agents in the network
- 🔐 Your public key automatically distributed
- 📊 Trust score based on transaction history

---

## 🔌 MCP Integration - Production Ready ✅

**Use Model Context Protocol tools through Amorce with cryptographic security and human oversight.**

The Amorce SDK provides production-ready integration with [Model Context Protocol](https://modelcontextprotocol.io) servers, adding Ed25519 signatures and human-in-the-loop approvals to all tool calls.

### 🚀 Quick Start

```typescript
import { IdentityManager, MCPToolClient } from '@amorce/sdk';

// 1. Create your agent identity
const identity = await IdentityManager.generate();

// 2. Connect to MCP wrapper
const mcp = new MCPToolClient(identity, 'http://localhost:5001');

// 3. Discover available tools
const tools = await mcp.listTools();
for (const tool of tools) {
  const hitl = tool.requiresApproval ? '🔒' : '✓';
  console.log(`${hitl} ${tool.name}: ${tool.description}`);
}

// 4. Call tools (read operations)
const result = await mcp.callTool('filesystem', 'read_file', {
  path: '/tmp/data.txt'
});
console.log(result);

// 5. Call tools requiring approval (write operations)
try {
  await mcp.callTool('filesystem', 'write_file', {
    path: '/tmp/output.txt',
    content: 'Hello from Amorce!'
  });
} catch (error) {
  console.log('Approval required!');  
  // Request approval through orchestrator
  const approvalId = await client.requestApproval({...});  
  const result = await mcp.callTool('filesystem', 'write_file', {
    path: '/tmp/output.txt',
    content: 'Hello!'
  }, approvalId);
}
```

### 📖 Complete Example with HITL

```typescript
import { IdentityManager, MCPToolClient, AmorceClient } from '@amorce/sdk';

// Setup
const identity = await IdentityManager.generate();
const mcp = new MCPToolClient(identity, 'http://localhost:5001');
const client = new AmorceClient(
  identity,
  'https://directory.amorce.io',
  'https://api.amorce.io'
);

// List tools and check HITL requirements
const tools = await mcp.listTools();
const writeTool = tools.find(t => t.name === 'write_file');
console.log(`Write file requires approval: ${writeTool.requiresApproval}`);  // true

// Attempt without approval (will fail)
try {
  const result = await mcp.callTool('filesystem', 'write_file', {
    path: '/tmp/important.txt',
    content: 'Critical data'
  });
} catch (error) {
  console.log(`Blocked: ${error.message}`);  // "Tool requires approval"
}
    
// Request approval
const approvalId = await client.requestApproval({
  summary: 'Write ML model output file',
  details: { path: '/tmp/important.txt', content: 'Critical data' },
  timeoutSeconds: 300
});

// Human reviews and approves (via UI or API)
// ... approval workflow ...

// Execute with approval
const result = await mcp.callTool('filesystem', 'write_file', {
  path: '/tmp/important.txt',
  content: 'Critical data'
}, approvalId);

console.log(`File written successfully: ${result}`);
```

### 🎯 Tool Categories

| Category | Examples | HITL Required |
|----------|----------|---------------|
| **Read Operations** | read_file, list_directory, search | ❌ No |
| **Write Operations** | write_file, edit_file | ✅ Yes |
| **Destructive Operations** | delete_file, move_file | ✅ Yes |
| **Search/Query** | brave_search, database_query | ❌ No (read-only) |

### 🔗 Available MCP Servers

Access 80+ production MCP servers through Amorce:

```typescript
// Filesystem operations
await mcp.callTool('filesystem', 'read_file', { path: '/data/input.json' });

// Web search
await mcp.callTool('search', 'brave_search', { query: 'AI agents 2024' });

// Database access (with HITL)
await mcp.callTool('postgres', 'execute_query', 
  { sql: 'SELECT * FROM users' }, 
  approvalId
);

// Git operations (with HITL)
await mcp.callTool('git', 'commit', 
  { message: 'Update config' }, 
  approvalId
);
```

[View all 80+ MCP servers →](https://github.com/modelcontextprotocol/servers)

---

## 🤝 Human-in-the-Loop (HITL) Support

Enable human oversight for critical agent decisions with built-in approval workflows.

### When to Use HITL

- **High-value transactions** - Booking reservations, making purchases
- **Data sharing** - Before sending personal information to third parties
- **Irreversible actions** - Cancellations, deletions, confirmations
- **Regulatory compliance** - Finance, healthcare, legal industries

### Basic HITL Workflow

```typescript
import { AmorceClient, IdentityManager } from '@amorce/sdk';

const identity = await IdentityManager.generate();
const client = new AmorceClient(
  identity,
  'https://directory.amorce.io',
  'https://api.amorce.io'
);

// 1. Agent negotiates with service
const response = await client.transact(
  { service_id: 'srv_restaurant_123' },
  { intent: 'book_table', guests: 4, date: '2025-12-05' }
);

// 2. Request human approval before finalizing
const approvalId = await client.requestApproval({
  transactionId: response.transaction_id,
  summary: `Book table for 4 guests at ${response.restaurant.name}`,
  details: response.result,
  timeoutSeconds: 300  // 5 minute timeout
});

console.log(`Awaiting approval: ${approvalId}`);

// 3. Human reviews and approves (via SMS, email, app, etc.)
// ... your notification logic here ...

// 4. Check approval status
const status = await client.checkApproval(approvalId);
if (status.status === 'approved') {
  // 5. Finalize the transaction
  const finalResponse = await client.transact(
    { service_id: 'srv_restaurant_123' },
    { intent: 'confirm_booking', booking_id: response.booking_id }
  );
  console.log('✅ Booking confirmed!');
}
```

### Submitting Approval Decisions

Your application collects human input and submits the decision:

```typescript
// Human approved via your UI/SMS/voice interface
await client.submitApproval({
  approvalId: approvalId,
  decision: 'approve',  // or 'reject'
  approvedBy: 'user@example.com',
  comments: 'Looks good for the business lunch'
});
```

### LLM-Interpreted Approvals

Use AI to interpret natural language responses:

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

// Human responds: "yes sounds perfect"
const humanResponse = "yes sounds perfect";

// LLM interprets the intent
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

const result = await model.generateContent(
  `Is this approving or rejecting? "${humanResponse}" Answer: APPROVE or REJECT`
);
const interpretation = result.response.text();

const decision = interpretation.includes('APPROVE') ? 'approve' : 'reject';

await client.submitApproval({
  approvalId,
  decision,
  approvedBy: 'user@example.com',
  comments: `Original response: ${humanResponse}`
});
```

### Channel-Agnostic Notifications

HITL is **protocol-level** - you choose how to notify humans:

- **SMS** (Twilio): "Sarah wants to book Le Petit Bistro for 4. Reply YES/NO"
- **Email**: Send approval link with one-click approve/reject
- **Voice** (Vapi.ai): "Your assistant needs approval. Say approve or decline"
- **Push notification**: Mobile app notification
- **Slack/Teams**: Bot message with buttons

**Example with Twilio:**
```typescript
import twilio from 'twilio';

const client = twilio(accountSid, authToken);

// Create approval
const approvalId = await amorceClient.requestApproval({...});

// Send SMS
await client.messages.create({
  to: '+1234567890',
  from: '+0987654321',
  body: `Sarah needs approval: Book table for 4 at Le Petit Bistro tomorrow 7pm. Reply YES or NO`
});

// Poll for response or use webhook
// When you receive "YES", submit approval
await amorceClient.submitApproval({
  approvalId,
  decision: 'approve',
  approvedBy: 'sms:+1234567890'
});
```

### Advanced: Approval Timeouts

Approvals automatically expire after the timeout period:

```typescript
const approvalId = await client.requestApproval({
  transactionId: txId,
  summary: 'High-value purchase: $5,000',
  timeoutSeconds: 600  // 10 minutes
});

// Later...
const status = await client.checkApproval(approvalId);
if (status.status === 'expired') {
  console.log('⏱️ Approval request timed out - transaction cancelled');
}
```

### Best Practices

1. **Clear summaries** - Make approval requests easy to understand
2. **Appropriate timeouts** - Balance urgency vs. convenience
3. **Audit trail** - All approvals are logged with timestamps and user IDs
4. **Fallback handling** - Handle expired/rejected approvals gracefully
5. **Security** - Verify human identity before submitting approvals

---

## 🛡️ Architecture & Security

The SDK implements the **AATP v0.1** standard strictly.

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

**Q: I get a `AmorceAPIError` when transacting.**  
A: Check the status code and response body in the error object. Common issues include invalid service IDs or missing API keys.

**Q: I get `AmorceConfigError` about invalid URLs.**  
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
* `toManifestJson(options): string` - **NEW v3.0.0** - Generates agent manifest JSON for registration.

### `verifyRequest()` **NEW v3.0.0**

```typescript
verifyRequest(options: {
  headers: Record<string, string>,
  body: Buffer | string,
  allowedIntents?: string[],
  publicKey?: string,
  directoryUrl?: string
}): Promise<VerifiedRequest>
```

For builders - verify incoming signed requests from other agents.

### `MCPToolClient` **NEW v3.0.0**

```typescript
// Constructor
new MCPToolClient(identity: IdentityManager, wrapperUrl: string)

// Methods
listTools(): Promise<MCPTool[]>  // Discover available tools
callTool(server: string, tool: string, args: any, approvalId?: string): Promise<any>
```

### `AmorceClient`

#### Constructor

```typescript
new AmorceClient(
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
* `requestApproval(options): Promise<string>` - **NEW v3.0.0** - Create HITL approval request.
* `checkApproval(approvalId): Promise<ApprovalStatus>` - **NEW v3.0.0** - Check approval status.
* `submitApproval(options): Promise<void>` - **NEW v3.0.0** - Submit approval decision.

### Exception Classes

* `AmorceError` - Base exception class
* `AmorceConfigError` - Configuration errors
* `AmorceNetworkError` - Network errors
* `AmorceAPIError` - API errors (includes `statusCode` and `responseBody`)
* `AmorceSecurityError` - Security/crypto errors
* `AmorceValidationError` - Validation errors

---

## 🛠️ Development

To contribute to the SDK:

```bash
# Clone the repository
git clone https://github.com/trebortGolin/amorce-js-sdk.git
cd amorce-js-sdk

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

* [amorce_py_sdk](https://github.com/trebortGolin/amorce_py_sdk) - Python SDK for AATP
* [amorce-trust-directory](https://github.com/trebortGolin/amorce-trust-directory) - Trust Directory service
* [amorce-console](https://github.com/trebortGolin/amorce-console) - Management console

---

## 🤖 MCP Server for LLMs (NEW in v3.1.0)

**Enable Claude and other LLMs to discover Amorce agents.**

The `@amorce/mcp-server` package exposes Amorce's Agent Naming Service to Claude and other MCP-compatible LLMs.

### Installation for Claude

**Claude Desktop** - Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "amorce": {
      "command": "npx",
      "args": ["@amorce/mcp-server"]
    }
  }
}
```

**Claude Code:**
```bash
claude mcp add amorce -- npx @amorce/mcp-server
```

### Tools Available

| Tool | Description |
|------|-------------|
| `search_agents` | Find agents by capability (semantic search) |
| `get_agent` | Get agent details and endpoint |
| `get_agent_manifest` | Get A2A manifest for integration |

### Example Prompts for Claude

Once installed, ask Claude:
- "Find an agent that can book flights to Paris"
- "Search Amorce for weather agents"
- "What agents can help with currency exchange?"

📦 **Package:** [`@amorce/mcp-server`](https://www.npmjs.com/package/@amorce/mcp-server)

---

## 📝 Changelog

### v3.1.0 (2025-12-15) 🆕

**A2A Discovery: Make Your Agent Discoverable**

* **[NEW]** `serveWellKnown()` - Express middleware to serve `/.well-known/agent.json`
* **[NEW]** `createWellKnownHandler()` - Next.js App Router handler for A2A manifest
* **[NEW]** `fetchManifest()` - Fetch A2A manifest from Amorce Directory
* **[NEW]** `generateManifestJson()` - Generate static manifest JSON for deployment
* **[ENHANCEMENT]** Aligned with Python SDK v0.2.2

### v3.0.0 (2025-12-07)

**MAJOR RELEASE - Full Feature Parity with Python SDK v0.2.1!**

* **[NEW]** `verifyRequest()` - Verify incoming signed requests from other agents
  - Auto-fetch public keys from Trust Directory
  - Intent whitelisting for authorization
  - Full Ed25519 signature verification
  - For builders protecting their APIs

* **[NEW]** HITL (Human-in-the-Loop) Support
  - `requestApproval()` - Create approval requests
  - `checkApproval()` - Check approval status
  - `submitApproval()` - Submit approval decisions
  - Timeout handling with auto-expiry
  - Complete approval workflow

* **[NEW]** MCP Integration
  - `MCPToolClient` for secure tool calling
  - `listTools()` - Discover 80+ MCP tools
  - `callTool()` - Execute with cryptographic signatures
  - Automatic HITL detection for write operations
  - Production-ready with rate limiting

* **[NEW]** `toManifestJson()` - Generate agent registration manifests
  - Auto-populated agent_id and public_key
  - Easy Trust Directory submission

* **[ENHANCEMENT]** Updated documentation with comprehensive examples
* **[ENHANCEMENT]** 15 new unit tests for all features
* **[BREAKING]** Major version bump (v2.x → v3.x)
* **[ALIGNED]** 100% feature parity with Python SDK v0.2.1

---

## 🌐 A2A Discovery: Make Your Agent Discoverable (NEW in v3.1.0)

**Register your agent and instantly make it discoverable in the A2A ecosystem.**

### Express Middleware

```typescript
import express from 'express';
import { serveWellKnown } from '@amorce/sdk';

const app = express();

// Add /.well-known/agent.json route with one line!
app.use(serveWellKnown({ agentId: 'your-registered-agent-id' }));
```

### Next.js App Router

```typescript
// app/.well-known/agent.json/route.ts
import { createWellKnownHandler } from '@amorce/sdk';

export const GET = createWellKnownHandler({ agentId: 'your-agent-id' });
```

### Fetch Manifest Programmatically

```typescript
import { fetchManifest } from '@amorce/sdk';

const manifest = await fetchManifest('your-agent-id');
console.log(manifest);
// {
//   name: "My Agent",
//   url: "https://my-agent.com",
//   protocol_version: "A2A/1.0",
//   authentication: { type: "amorce", public_key: "..." }
// }
```

### Why A2A Discovery Matters

- 🔍 **Discoverable** - Other agents can find and verify your agent
- 🔐 **Trusted** - Public key distributed via trusted directory
- 🔗 **Interoperable** - Works with Google A2A, MCP, and Amorce protocols

---

### v2.1.0 (2025-11-30)
* **[FEATURE]** HTTP/2 support via `undici` for multiplexed connections and better performance
* **[FEATURE]** Exponential backoff + jitter via `p-retry` (replaces basic `fetch-retry`)
* **[FEATURE]** Auto-generated idempotency keys (UUIDv4) for transaction deduplication
* **[FEATURE]** Structured `AmorceResponse` with `isSuccess()` and `isRetryable()` utility methods
* **[FEATURE]** Additional headers: `X-Amorce-Idempotency`, `X-Amorce-Agent-ID`
* **[ENHANCEMENT]** Feature parity with Python SDK v0.2.0
* **[BREAKING]** Requires Node.js 18+ for optimal HTTP/2 support
* **[DEPENDENCY]** Replaced `cross-fetch` with `undici`
* **[DEPENDENCY]** Replaced `fetch-retry` with `p-retry`

### v0.1.7 (2025-11-28)
* **[BREAKING]** Updated transaction protocol to use flat JSON structure with signature in header
* **[BREAKING]** Changed API key header from `X-ATP-Key` to `X-API-Key`
* Added comprehensive exception hierarchy for better error handling
* Added provider pattern for flexible identity management (`EnvVarProvider`)
* Added auto-derived Agent ID (SHA-256 of public key)
* Added `getCanonicalJsonBytes()` static utility
* Improved URL validation in `AmorceClient` constructor
* Enhanced documentation and examples

### v0.1.2
* Added Priority Lane support
* Added automatic retry logic with exponential backoff
* Fixed PEM encoding issues

### v0.1.0
* Initial release