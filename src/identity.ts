/**
 * Nexus Identity Module (Task 2.2 - Enhanced for v0.1.7)
 * Handles Ed25519 key management and signing using libsodium.
 * Compatible with both Browser and Node.js environments.
 * 
 * v0.1.7 Updates:
 * - Added Provider Pattern for flexible key sources
 * - Added Agent ID derivation (SHA-256 of public key)
 * - Added canonical JSON helper
 * - Improved error handling with custom exceptions
 */

import sodium from 'libsodium-wrappers';
import { NexusSecurityError } from './exceptions';

/**
 * Abstract base class for retrieving private keys.
 */
export interface IdentityProvider {
  getPrivateKey(): Promise<Uint8Array>;
}

/**
 * Loads a private key from an environment variable string.
 * Works in both Node.js and browser environments (if env vars are available).
 */
export class EnvVarProvider implements IdentityProvider {
  private envVarName: string;

  constructor(envVarName: string = 'AGENT_PRIVATE_KEY') {
    this.envVarName = envVarName;
  }

  async getPrivateKey(): Promise<Uint8Array> {
    await sodium.ready;

    // Try to get from process.env (Node.js) or globalThis (browser with webpack/vite)
    let pemData: string | undefined;

    if (typeof process !== 'undefined' && process.env) {
      pemData = process.env[this.envVarName];
    }

    if (!pemData) {
      throw new NexusSecurityError(`Environment variable ${this.envVarName} is not set.`);
    }

    // Handle cases where newlines are escaped (common in some CI/CD)
    pemData = pemData.replace(/\\n/g, '\n');

    try {
      return this.pemToPrivateKey(pemData);
    } catch (e) {
      throw new NexusSecurityError(`Failed to load key from environment variable: ${e}`);
    }
  }

  private pemToPrivateKey(pem: string): Uint8Array {
    // Extract base64 from PEM format
    const b64 = pem
      .replace('-----BEGIN PRIVATE KEY-----', '')
      .replace('-----END PRIVATE KEY-----', '')
      .replace(/\s/g, '');

    // Decode base64
    const fullBytes = sodium.from_base64(b64, sodium.base64_variants.ORIGINAL);

    // PKCS#8 format for Ed25519 has a 16-byte header, followed by 2-byte length prefix, then 32-byte key
    // Total: 48 bytes (16 + 2 + 32), but we need to extract the 32-byte seed
    if (fullBytes.length >= 48) {
      // The seed starts at byte 16 (skip PKCS#8 header)
      return fullBytes.slice(16, 48);
    }

    throw new NexusSecurityError('Invalid private key format');
  }
}

/**
 * Holds a generated key in memory (Ephemeral).
 * Internal provider used by the generate() factory method.
 */
class InMemoryProvider implements IdentityProvider {
  private privateKey: Uint8Array;

  constructor(privateKey: Uint8Array) {
    this.privateKey = privateKey;
  }

  async getPrivateKey(): Promise<Uint8Array> {
    return this.privateKey;
  }
}

/**
 * Central class to manage the agent's identity.
 */
export class IdentityManager {
  private privateKey: Uint8Array;
  public publicKey: Uint8Array;

  private constructor(privateKey: Uint8Array, publicKey: Uint8Array) {
    this.privateKey = privateKey;
    this.publicKey = publicKey;
  }

  /**
   * Initializes from a provider (flexible key source).
   */
  static async fromProvider(provider: IdentityProvider): Promise<IdentityManager> {
    await sodium.ready;
    const privateKey = await provider.getPrivateKey();

    // Extract public key from private key
    // The private key in libsodium is actually the seed (32 bytes)
    // We need to generate the full keypair from it
    const keypair = sodium.crypto_sign_seed_keypair(privateKey);

    return new IdentityManager(keypair.privateKey, keypair.publicKey);
  }

  /**
   * Factory method: Generates a new ephemeral Ed25519 identity in memory.
   * Matches Python's IdentityManager.generate_ephemeral()
   */
  static async generate(): Promise<IdentityManager> {
    await sodium.ready;
    const keypair = sodium.crypto_sign_keypair();
    return new IdentityManager(keypair.privateKey, keypair.publicKey);
  }

  /**
   * Legacy method: Loads an identity from a raw private key (Uint8Array).
   * Kept for backward compatibility.
   */
  static async fromPrivateKey(privateKey: Uint8Array): Promise<IdentityManager> {
    await sodium.ready;
    // Extract public key from private key
    const publicKey = (sodium as any).crypto_sign_ed25519_sk_to_pk(privateKey);
    return new IdentityManager(privateKey, publicKey);
  }

  /**
   * Signs a message (string or bytes) and returns the signature in Base64.
   */
  async sign(message: string | Uint8Array): Promise<string> {
    await sodium.ready;
    const signature = sodium.crypto_sign_detached(message, this.privateKey);
    return sodium.to_base64(signature, sodium.base64_variants.ORIGINAL);
  }

  /**
   * Verifies a signature against a public key.
   * Static utility for validation.
   */
  static async verify(
    message: string | Uint8Array,
    signatureBase64: string,
    publicKey: Uint8Array
  ): Promise<boolean> {
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
  getPublicKeyPem(): string {
    // Ed25519 OID prefix for SubjectPublicKeyInfo
    const prefix = new Uint8Array([
      0x30, 0x2a, // Sequence, length 42
      0x30, 0x05, // Sequence, length 5
      0x06, 0x03, 0x2b, 0x65, 0x70, // OID: 1.3.101.112 (Ed25519)
      0x03, 0x21, 0x00 // Bit String, length 33, 0 padding
    ]);

    const combined = new Uint8Array(prefix.length + this.publicKey.length);
    combined.set(prefix);
    combined.set(this.publicKey, prefix.length);

    const b64 = sodium.to_base64(combined, sodium.base64_variants.ORIGINAL);

    return `-----BEGIN PUBLIC KEY-----\n${b64}\n-----END PUBLIC KEY-----\n`;
  }

  /**
   * MCP 1.0: Deterministic Agent ID derivation.
   * Returns the SHA-256 hash of the public key PEM.
   * This ensures the ID is cryptographically bound to the key.
   * Matches Python SDK behavior.
   */
  getAgentId(): string {
    const cleanPem = this.getPublicKeyPem().trim();

    // Try Node.js crypto first
    if (typeof require !== 'undefined') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(cleanPem, 'utf-8').digest('hex');
      } catch (e) {
        // Fall through to manual implementation
      }
    }

    // For browser environments, we'd need Web Crypto API
    // For now, throw error as this is primarily for Node.js
    throw new Error('Agent ID derivation requires Node.js crypto module');
  }

  /**
   * Returns the canonical JSON byte representation for signing.
   * Strict: sort_keys=True, no whitespace.
   * Matches Python's get_canonical_json_bytes()
   */
  static getCanonicalJsonBytes(payload: any): Uint8Array {
    // Use the same stable stringify as envelope.ts
    const stringify = require('fast-json-stable-stringify');
    const jsonStr = stringify(payload);
    return new TextEncoder().encode(jsonStr);
  }
}