// src/identity.ts
import sodium from "libsodium-wrappers";
var IdentityManager = class _IdentityManager {
  constructor(privateKey, publicKey) {
    this.privateKey = privateKey;
    this.publicKey = publicKey;
  }
  /**
   * Initializes libsodium and generates a new random keypair.
   */
  static async generate() {
    await sodium.ready;
    const keypair = sodium.crypto_sign_keypair();
    return new _IdentityManager(keypair.privateKey, keypair.publicKey);
  }
  /**
   * Loads an identity from a raw private key (Uint8Array).
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
};

// src/envelope.ts
import stringify from "fast-json-stable-stringify";
import { v4 as uuidv4 } from "uuid";
import sodium2 from "libsodium-wrappers";
var NexusEnvelope = class _NexusEnvelope {
  constructor(sender, payload) {
    this.natp_version = "0.1.0";
    this.id = uuidv4();
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
    if (!this.signature) return false;
    await sodium2.ready;
    try {
      const canonicalBytes = this.getCanonicalJson();
      const publicKeyBytes = _NexusEnvelope.pemToBytes(this.sender.public_key);
      return IdentityManager.verify(canonicalBytes, this.signature, publicKeyBytes);
    } catch (e) {
      console.error("Verification failed:", e);
      return false;
    }
  }
};

// src/client.ts
var NexusClient = class {
  constructor(identity, directoryUrl, orchestratorUrl, agentId, apiKey) {
    this.identity = identity;
    this.directoryUrl = directoryUrl.replace(/\/$/, "");
    this.orchestratorUrl = orchestratorUrl.replace(/\/$/, "");
    this.agentId = agentId;
    this.apiKey = apiKey;
  }
  /**
   * Helper to build and sign a standard envelope.
   */
  async createEnvelope(payload) {
    const sender = {
      public_key: this.identity.getPublicKeyPem(),
      agent_id: this.agentId
    };
    const envelope = new NexusEnvelope(sender, payload);
    await envelope.sign(this.identity);
    return envelope;
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
        }
      });
      if (!response.ok) {
        console.error(`Discovery failed: ${response.status} ${response.statusText}`);
        return [];
      }
      return await response.json();
    } catch (e) {
      console.error("Discovery network error:", e);
      return [];
    }
  }
  /**
   * P-9.3: Execute a transaction via the Orchestrator.
   * Wraps the payload in a signed NATP Envelope.
   */
  async transact(serviceContract, payload) {
    if (!serviceContract.service_id) {
      console.error("Invalid service contract: missing service_id");
      return null;
    }
    const transactionPayload = {
      service_id: serviceContract.service_id,
      consumer_agent_id: this.agentId,
      data: payload
      // The actual application data
    };
    const envelope = await this.createEnvelope(transactionPayload);
    const url = `${this.orchestratorUrl}/v1/a2a/transact`;
    const headers = {
      "Content-Type": "application/json"
    };
    if (this.apiKey) {
      headers["X-ATP-Key"] = this.apiKey;
    }
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(envelope)
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Transaction failed: ${response.status} - ${errorText}`);
        return { error: `HTTP ${response.status}`, details: errorText };
      }
      return await response.json();
    } catch (e) {
      console.error("Transaction network error:", e);
      return null;
    }
  }
};

// src/index.ts
var SDK_VERSION = "0.1.0";
console.log(`Nexus JS SDK v${SDK_VERSION} loaded.`);
export {
  IdentityManager,
  NexusClient,
  NexusEnvelope,
  SDK_VERSION
};
//# sourceMappingURL=index.mjs.map