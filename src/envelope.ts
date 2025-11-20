/**
 * Nexus Envelope (Task 2.3 - Fixed)
 * Defines the strict NATP v0.1 data structure.
 * Handles canonical serialization and signing.
 * v1.1 Fix: Strips ASN.1 header from PEM public keys.
 */

import stringify from 'fast-json-stable-stringify';
import { v4 as uuidv4 } from 'uuid';
import sodium from 'libsodium-wrappers';
import { IdentityManager } from './identity';

export interface SenderInfo {
  public_key: string; // PEM format
  agent_id?: string;
}

export interface SettlementInfo {
  amount: number;
  currency: string;
  facilitation_fee: number;
}

export class NexusEnvelope {
  natp_version: string = "0.1.0";
  id: string;
  timestamp: number;
  sender: SenderInfo;
  payload: Record<string, any>;
  settlement: SettlementInfo;
  signature?: string;

  constructor(sender: SenderInfo, payload: Record<string, any>) {
    this.id = uuidv4();
    // Python uses float seconds, JS uses ms. Convert to seconds.
    this.timestamp = Date.now() / 1000;
    this.sender = sender;
    this.payload = payload;
    this.settlement = { amount: 0, currency: 'USD', facilitation_fee: 0 };
  }

  /**
   * Returns the canonical JSON bytes of the envelope WITHOUT the signature.
   */
  public getCanonicalJson(): Uint8Array {
    const { signature, ...dataToSign } = this;
    // fast-json-stable-stringify produces compact JSON (no spaces),
    // matching Python's separators=(',', ':')
    const jsonStr = stringify(dataToSign);
    return new TextEncoder().encode(jsonStr);
  }

  /**
   * Signs the envelope using the provided IdentityManager.
   */
  public async sign(identity: IdentityManager): Promise<void> {
    const bytes = this.getCanonicalJson();
    this.signature = await identity.sign(bytes);
  }

  /**
   * Helper to parse a PEM public key back to Uint8Array for verification.
   * FIX: We must strip the ASN.1 header to get the raw Ed25519 key.
   */
  private static pemToBytes(pem: string): Uint8Array {
    // 1. Clean up the PEM string
    const b64 = pem
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\s/g, '');

    // 2. Decode Base64
    const fullBytes = sodium.from_base64(b64, sodium.base64_variants.ORIGINAL);

    // 3. Strip ASN.1 Header (Fix)
    // The SubjectPublicKeyInfo format is 44 bytes total (12 bytes header + 32 bytes key).
    // Libsodium only wants the raw 32 bytes.
    if (fullBytes.length > 32) {
        return fullBytes.slice(fullBytes.length - 32);
    }

    return fullBytes;
  }

  /**
   * Verifies the envelope's signature against its own sender public key.
   */
  public async verify(): Promise<boolean> {
    if (!this.signature) return false;
    await sodium.ready;

    try {
      const canonicalBytes = this.getCanonicalJson();
      const publicKeyBytes = NexusEnvelope.pemToBytes(this.sender.public_key);

      return IdentityManager.verify(canonicalBytes, this.signature, publicKeyBytes);
    } catch (e) {
      console.error("Verification failed:", e);
      return false;
    }
  }
}