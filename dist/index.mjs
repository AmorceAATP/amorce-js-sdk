var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/exceptions.ts
var NexusError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "NexusError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
};
var NexusConfigError = class extends NexusError {
  constructor(message) {
    super(message);
    this.name = "NexusConfigError";
  }
};
var NexusNetworkError = class extends NexusError {
  constructor(message) {
    super(message);
    this.name = "NexusNetworkError";
  }
};
var NexusAPIError = class extends NexusError {
  constructor(message, statusCode, responseBody) {
    super(message);
    this.name = "NexusAPIError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
};
var NexusSecurityError = class extends NexusError {
  constructor(message) {
    super(message);
    this.name = "NexusSecurityError";
  }
};
var NexusValidationError = class extends NexusError {
  constructor(message) {
    super(message);
    this.name = "NexusValidationError";
  }
};

// src/identity.ts
import sodium from "libsodium-wrappers";
var EnvVarProvider = class {
  constructor(envVarName = "AGENT_PRIVATE_KEY") {
    this.envVarName = envVarName;
  }
  async getPrivateKey() {
    await sodium.ready;
    let pemData;
    if (typeof process !== "undefined" && process.env) {
      pemData = process.env[this.envVarName];
    }
    if (!pemData) {
      throw new NexusSecurityError(`Environment variable ${this.envVarName} is not set.`);
    }
    pemData = pemData.replace(/\\n/g, "\n");
    try {
      return this.pemToPrivateKey(pemData);
    } catch (e) {
      throw new NexusSecurityError(`Failed to load key from environment variable: ${e}`);
    }
  }
  pemToPrivateKey(pem) {
    const b64 = pem.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s/g, "");
    const fullBytes = sodium.from_base64(b64, sodium.base64_variants.ORIGINAL);
    if (fullBytes.length >= 48) {
      return fullBytes.slice(16, 48);
    }
    throw new NexusSecurityError("Invalid private key format");
  }
};
var IdentityManager = class _IdentityManager {
  constructor(privateKey, publicKey) {
    this.privateKey = privateKey;
    this.publicKey = publicKey;
  }
  /**
   * Initializes from a provider (flexible key source).
   */
  static async fromProvider(provider) {
    await sodium.ready;
    const privateKey = await provider.getPrivateKey();
    const keypair = sodium.crypto_sign_seed_keypair(privateKey);
    return new _IdentityManager(keypair.privateKey, keypair.publicKey);
  }
  /**
   * Factory method: Generates a new ephemeral Ed25519 identity in memory.
   * Matches Python's IdentityManager.generate_ephemeral()
   */
  static async generate() {
    await sodium.ready;
    const keypair = sodium.crypto_sign_keypair();
    return new _IdentityManager(keypair.privateKey, keypair.publicKey);
  }
  /**
   * Legacy method: Loads an identity from a raw private key (Uint8Array).
   * Kept for backward compatibility.
   */
  static async fromPrivateKey(privateKey) {
    await sodium.ready;
    const publicKey = sodium.crypto_sign_ed25519_sk_to_pk(privateKey);
    return new _IdentityManager(privateKey, publicKey);
  }
  /**
   * Signs a message (string or bytes) and returns the signature in Base64.
   */
  async sign(message) {
    await sodium.ready;
    const signature = sodium.crypto_sign_detached(message, this.privateKey);
    return sodium.to_base64(signature, sodium.base64_variants.ORIGINAL);
  }
  /**
   * Verifies a signature against a public key.
   * Static utility for validation.
   */
  static async verify(message, signatureBase64, publicKey) {
    await sodium.ready;
    try {
      const signature = sodium.from_base64(signatureBase64, sodium.base64_variants.ORIGINAL);
      return sodium.crypto_sign_verify_detached(signature, message, publicKey);
    } catch (e) {
      return false;
    }
  }
  /**
   * Exports the Public Key to PEM format (PKIX).
   * Matches Python's serialization.PublicFormat.SubjectPublicKeyInfo
   */
  getPublicKeyPem() {
    const prefix = new Uint8Array([
      48,
      42,
      // Sequence, length 42
      48,
      5,
      // Sequence, length 5
      6,
      3,
      43,
      101,
      112,
      // OID: 1.3.101.112 (Ed25519)
      3,
      33,
      0
      // Bit String, length 33, 0 padding
    ]);
    const combined = new Uint8Array(prefix.length + this.publicKey.length);
    combined.set(prefix);
    combined.set(this.publicKey, prefix.length);
    const b64 = sodium.to_base64(combined, sodium.base64_variants.ORIGINAL);
    return `-----BEGIN PUBLIC KEY-----
${b64}
-----END PUBLIC KEY-----
`;
  }
  /**
   * MCP 1.0: Deterministic Agent ID derivation.
   * Returns the SHA-256 hash of the public key PEM.
   * This ensures the ID is cryptographically bound to the key.
   * Matches Python SDK behavior.
   */
  getAgentId() {
    const cleanPem = this.getPublicKeyPem().trim();
    if (typeof __require !== "undefined") {
      try {
        const crypto = __require("crypto");
        return crypto.createHash("sha256").update(cleanPem, "utf-8").digest("hex");
      } catch (e) {
      }
    }
    throw new Error("Agent ID derivation requires Node.js crypto module");
  }
  /**
   * Returns the canonical JSON byte representation for signing.
   * Strict: sort_keys=True, no whitespace.
   * Matches Python's get_canonical_json_bytes()
   */
  static getCanonicalJsonBytes(payload) {
    const stringify2 = __require("fast-json-stable-stringify");
    const jsonStr = stringify2(payload);
    return new TextEncoder().encode(jsonStr);
  }
};

// src/envelope.ts
import stringify from "fast-json-stable-stringify";
import { v4 as uuidv4 } from "uuid";
import sodium2 from "libsodium-wrappers";
var NexusEnvelope = class _NexusEnvelope {
  constructor(sender, payload, priority = "normal") {
    this.natp_version = "0.1.0";
    if (!["normal", "high", "critical"].includes(priority)) {
      throw new NexusValidationError(
        `Invalid priority: ${priority}. Must be 'normal', 'high', or 'critical'.`
      );
    }
    this.id = uuidv4();
    this.priority = priority;
    this.timestamp = Date.now() / 1e3;
    this.sender = sender;
    this.payload = payload;
    this.settlement = { amount: 0, currency: "USD", facilitation_fee: 0 };
  }
  /**
   * Returns the canonical JSON bytes of the envelope WITHOUT the signature.
   */
  getCanonicalJson() {
    const { signature, ...dataToSign } = this;
    const jsonStr = stringify(dataToSign);
    return new TextEncoder().encode(jsonStr);
  }
  /**
   * Signs the envelope using the provided IdentityManager.
   */
  async sign(identity) {
    const bytes = this.getCanonicalJson();
    this.signature = await identity.sign(bytes);
  }
  /**
   * Helper to parse a PEM public key back to Uint8Array for verification.
   * FIX: We must strip the ASN.1 header to get the raw Ed25519 key.
   */
  static pemToBytes(pem) {
    const b64 = pem.replace("-----BEGIN PUBLIC KEY-----", "").replace("-----END PUBLIC KEY-----", "").replace(/\s/g, "");
    const fullBytes = sodium2.from_base64(b64, sodium2.base64_variants.ORIGINAL);
    if (fullBytes.length > 32) {
      return fullBytes.slice(fullBytes.length - 32);
    }
    return fullBytes;
  }
  /**
   * Verifies the envelope's signature against its own sender public key.
   */
  async verify() {
    if (!this.signature) {
      throw new NexusValidationError("Envelope has no signature");
    }
    await sodium2.ready;
    try {
      const canonicalBytes = this.getCanonicalJson();
      const publicKeyBytes = _NexusEnvelope.pemToBytes(this.sender.public_key);
      return IdentityManager.verify(canonicalBytes, this.signature, publicKeyBytes);
    } catch (e) {
      throw new NexusValidationError(`Verification failed: ${e}`);
    }
  }
};
var Envelope = NexusEnvelope;

// src/client.ts
import originalFetch from "cross-fetch";
import fetchRetry from "fetch-retry";
var fetch = fetchRetry(originalFetch);
var PriorityLevel = class {
};
PriorityLevel.NORMAL = "normal";
PriorityLevel.HIGH = "high";
PriorityLevel.CRITICAL = "critical";
var NexusClient = class {
  constructor(identity, directoryUrl, orchestratorUrl, agentId, apiKey) {
    this.identity = identity;
    if (!directoryUrl.startsWith("http://") && !directoryUrl.startsWith("https://")) {
      throw new NexusConfigError(`Invalid directory_url: ${directoryUrl}`);
    }
    if (!orchestratorUrl.startsWith("http://") && !orchestratorUrl.startsWith("https://")) {
      throw new NexusConfigError(`Invalid orchestrator_url: ${orchestratorUrl}`);
    }
    this.directoryUrl = directoryUrl.replace(/\/$/, "");
    this.orchestratorUrl = orchestratorUrl.replace(/\/$/, "");
    this.agentId = agentId || identity.getAgentId();
    this.apiKey = apiKey;
  }
  /**
   * P-7.1: Discover services from the Trust Directory.
   */
  async discover(serviceType) {
    const url = `${this.directoryUrl}/api/v1/services/search?service_type=${encodeURIComponent(serviceType)}`;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        },
        // Resilience Config
        retries: 3,
        retryDelay: (attempt) => Math.pow(2, attempt) * 1e3
        // 1s, 2s, 4s
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new NexusAPIError(
          `Discovery API error: ${response.status}`,
          response.status,
          errorText
        );
      }
      return await response.json();
    } catch (e) {
      if (e instanceof NexusAPIError) {
        throw e;
      }
      throw new NexusNetworkError(`Discovery network error: ${e}`);
    }
  }
  /**
   * P-9.3: Execute a transaction via the Orchestrator.
   * FIX: Aligned with Orchestrator v1.4 protocol (Flat JSON + Header Signature).
   * Matches Python SDK's transact() method.
   */
  async transact(serviceContract, payload, priority = PriorityLevel.NORMAL) {
    if (!serviceContract.service_id) {
      throw new NexusConfigError("Invalid service contract: missing service_id");
    }
    const requestBody = {
      service_id: serviceContract.service_id,
      consumer_agent_id: this.agentId,
      payload,
      priority
    };
    const canonicalBytes = IdentityManager.getCanonicalJsonBytes(requestBody);
    const signature = await this.identity.sign(canonicalBytes);
    const headers = {
      "X-Agent-Signature": signature,
      "Content-Type": "application/json"
    };
    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }
    const url = `${this.orchestratorUrl}/v1/a2a/transact`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        // Retry Strategy: 3 attempts, exponential backoff
        retries: 3,
        retryOn: [500, 502, 503, 504, 429],
        // Retry on server errors & rate limits
        retryDelay: (attempt) => Math.pow(2, attempt) * 1e3
        // 1s, 2s, 4s
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new NexusAPIError(
          `Transaction failed with status ${response.status}`,
          response.status,
          errorText
        );
      }
      return await response.json();
    } catch (e) {
      if (e instanceof NexusAPIError) {
        throw e;
      }
      throw new NexusNetworkError(`Transaction network error: ${e}`);
    }
  }
};

// src/index.ts
var SDK_VERSION = "0.1.7";
var NATP_VERSION = "0.1.0";
console.log(`Nexus JS SDK v${SDK_VERSION} loaded.`);
export {
  EnvVarProvider,
  Envelope,
  IdentityManager,
  NATP_VERSION,
  NexusAPIError,
  NexusClient,
  NexusConfigError,
  NexusEnvelope,
  NexusError,
  NexusNetworkError,
  NexusSecurityError,
  NexusValidationError,
  PriorityLevel,
  SDK_VERSION
};
//# sourceMappingURL=index.mjs.map