var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/exceptions.ts
var AmorceError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "AmorceError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
};
var AmorceConfigError = class extends AmorceError {
  constructor(message) {
    super(message);
    this.name = "AmorceConfigError";
  }
};
var AmorceNetworkError = class extends AmorceError {
  constructor(message) {
    super(message);
    this.name = "AmorceNetworkError";
  }
};
var AmorceAPIError = class extends AmorceError {
  constructor(message, statusCode, responseBody) {
    super(message);
    this.name = "AmorceAPIError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
};
var AmorceSecurityError = class extends AmorceError {
  constructor(message) {
    super(message);
    this.name = "AmorceSecurityError";
  }
};
var AmorceValidationError = class extends AmorceError {
  constructor(message) {
    super(message);
    this.name = "AmorceValidationError";
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
      throw new AmorceSecurityError(`Environment variable ${this.envVarName} is not set.`);
    }
    pemData = pemData.replace(/\\n/g, "\n");
    try {
      return this.pemToPrivateKey(pemData);
    } catch (e) {
      throw new AmorceSecurityError(`Failed to load key from environment variable: ${e}`);
    }
  }
  pemToPrivateKey(pem) {
    const b64 = pem.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s/g, "");
    const fullBytes = sodium.from_base64(b64, sodium.base64_variants.ORIGINAL);
    if (fullBytes.length >= 48) {
      return fullBytes.slice(16, 48);
    }
    throw new AmorceSecurityError("Invalid private key format");
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
var AmorceEnvelope = class _AmorceEnvelope {
  constructor(sender, payload, priority = "normal") {
    this.natp_version = "0.1.0";
    if (!["normal", "high", "critical"].includes(priority)) {
      throw new AmorceValidationError(
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
      throw new AmorceValidationError("Envelope has no signature");
    }
    await sodium2.ready;
    try {
      const canonicalBytes = this.getCanonicalJson();
      const publicKeyBytes = _AmorceEnvelope.pemToBytes(this.sender.public_key);
      return IdentityManager.verify(canonicalBytes, this.signature, publicKeyBytes);
    } catch (e) {
      throw new AmorceValidationError(`Verification failed: ${e}`);
    }
  }
};
var Envelope = AmorceEnvelope;

// src/client.ts
import { request } from "undici";
import pRetry from "p-retry";
import { v4 as uuidv42 } from "uuid";

// src/models.ts
var AmorceResponseImpl = class {
  constructor(transaction_id, status_code, result, error) {
    this.transaction_id = transaction_id;
    this.status_code = status_code;
    this.result = result;
    this.error = error;
  }
  isSuccess() {
    return this.status_code >= 200 && this.status_code < 300;
  }
  isRetryable() {
    return [429, 500, 502, 503, 504].includes(this.status_code);
  }
};

// src/client.ts
var PriorityLevel = class {
};
PriorityLevel.NORMAL = "normal";
PriorityLevel.HIGH = "high";
PriorityLevel.CRITICAL = "critical";
var AmorceClient = class {
  constructor(identity, directoryUrl, orchestratorUrl, agentId, apiKey) {
    this.identity = identity;
    if (!directoryUrl.startsWith("http://") && !directoryUrl.startsWith("https://")) {
      throw new AmorceConfigError(`Invalid directory_url: ${directoryUrl}`);
    }
    if (!orchestratorUrl.startsWith("http://") && !orchestratorUrl.startsWith("https://")) {
      throw new AmorceConfigError(`Invalid orchestrator_url: ${orchestratorUrl}`);
    }
    this.directoryUrl = directoryUrl.replace(/\/$/, "");
    this.orchestratorUrl = orchestratorUrl.replace(/\/$/, "");
    this.agentId = agentId || identity.getAgentId();
    this.apiKey = apiKey;
  }
  /**
   * Discover services from the Trust Directory.
   * Uses p-retry for exponential backoff with jitter.
   */
  async discover(serviceType) {
    const url = `${this.directoryUrl}/api/v1/services/search?service_type=${encodeURIComponent(serviceType)}`;
    try {
      const response = await pRetry(
        async () => {
          const res = await request(url, {
            method: "GET",
            headers: {
              "Content-Type": "application/json"
            }
          });
          if ([429, 503, 504].includes(res.statusCode)) {
            throw new Error(`Retryable status: ${res.statusCode}`);
          }
          if (res.statusCode !== 200) {
            const errorText = await res.body.text();
            throw new AmorceAPIError(
              `Discovery API error: ${res.statusCode}`,
              res.statusCode,
              errorText
            );
          }
          return res;
        },
        {
          retries: 3,
          minTimeout: 1e3,
          maxTimeout: 1e4,
          randomize: true,
          // Adds jitter to prevent thundering herd
          onFailedAttempt: (error) => {
            console.warn(`Discovery retry attempt ${error.attemptNumber}: ${error.message}`);
          }
        }
      );
      return await response.body.json();
    } catch (e) {
      if (e instanceof AmorceAPIError) {
        throw e;
      }
      throw new AmorceNetworkError(`Discovery network error: ${e}`);
    }
  }
  /**
   * Execute a transaction via the Orchestrator.
   * 
   * v2.1.0 Enhancements:
   * - HTTP/2 via undici (automatic for https://)
   * - Exponential backoff + jitter via p-retry
   * - Idempotency key auto-generation
   * - Returns AmorceResponse with utility methods
   * 
   * @param serviceContract - Service identifier (must contain service_id)
   * @param payload - Transaction payload
   * @param priority - Priority level (normal|high|critical)
   * @param idempotencyKey - Optional idempotency key (auto-generated if not provided)
   * @returns AmorceResponse with transaction details
   */
  async transact(serviceContract, payload, priority = PriorityLevel.NORMAL, idempotencyKey) {
    if (!serviceContract.service_id) {
      throw new AmorceConfigError("Invalid service contract: missing service_id");
    }
    const key = idempotencyKey || uuidv42();
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
      "X-Amorce-Idempotency": key,
      // NEW in v2.1.0
      "X-Amorce-Agent-ID": this.agentId,
      // NEW in v2.1.0
      "Content-Type": "application/json"
    };
    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }
    const url = `${this.orchestratorUrl}/v1/a2a/transact`;
    try {
      const response = await pRetry(
        async () => {
          const res = await request(url, {
            method: "POST",
            headers,
            body: JSON.stringify(requestBody)
            // undici uses HTTP/2 by default for https:// URLs
          });
          if ([429, 503, 504].includes(res.statusCode)) {
            throw new Error(`Retryable status: ${res.statusCode}`);
          }
          if (res.statusCode >= 400 && res.statusCode < 500 && res.statusCode !== 429) {
            const errorText = await res.body.text();
            throw new AmorceAPIError(
              `Transaction failed with status ${res.statusCode}`,
              res.statusCode,
              errorText
            );
          }
          if (res.statusCode >= 500) {
            throw new Error(`Server error: ${res.statusCode}`);
          }
          return res;
        },
        {
          retries: 3,
          minTimeout: 1e3,
          // 1s
          maxTimeout: 1e4,
          // 10s
          randomize: true,
          // Adds 0-2s jitter
          onFailedAttempt: (error) => {
            console.warn(`Transaction retry attempt ${error.attemptNumber}: ${error.message}`);
          }
        }
      );
      const jsonData = await response.body.json();
      return new AmorceResponseImpl(
        jsonData.transaction_id || key,
        response.statusCode,
        {
          status: jsonData.status || "success",
          message: jsonData.message,
          data: jsonData.data
        },
        void 0
        // No error for successful responses
      );
    } catch (e) {
      if (e instanceof AmorceAPIError) {
        throw e;
      }
      throw new AmorceNetworkError(`Transaction network error: ${e}`);
    }
  }
};

// src/index.ts
var SDK_VERSION = "2.1.0";
var AATP_VERSION = "0.1.0";
console.log(`Amorce JS SDK v${SDK_VERSION} loaded.`);
export {
  AATP_VERSION,
  AmorceAPIError,
  AmorceClient,
  AmorceConfigError,
  AmorceEnvelope,
  AmorceError,
  AmorceNetworkError,
  AmorceResponseImpl,
  AmorceSecurityError,
  AmorceValidationError,
  EnvVarProvider,
  Envelope,
  IdentityManager,
  PriorityLevel,
  SDK_VERSION
};
//# sourceMappingURL=index.mjs.map