/**
 * Nexus Identity Module (Task 2.2)
 * Handles Ed25519 key management and signing using libsodium.
 * Compatible with both Browser and Node.js environments.
 */

import sodium from 'libsodium-wrappers';

export class IdentityManager {
  private privateKey: Uint8Array;
  public publicKey: Uint8Array;

  private constructor(privateKey: Uint8Array, publicKey: Uint8Array) {
    this.privateKey = privateKey;
    this.publicKey = publicKey;
  }

  /**
   * Initializes libsodium and generates a new random keypair.
   */
  static async generate(): Promise<IdentityManager> {
    await sodium.ready;
    const keypair = sodium.crypto_sign_keypair();
    return new IdentityManager(keypair.privateKey, keypair.publicKey);
  }

  /**
   * Loads an identity from a raw private key (Uint8Array).
   */
  static async fromPrivateKey(privateKey: Uint8Array): Promise<IdentityManager> {
    await sodium.ready;
    // Extract public key from private key
    // FIX: Cast sodium to 'any' because the Type definition is missing this function
    // even though it exists in the JS library.
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
    // Ed25519 OID prefix for SubjectPublicKeyInfo (302a300506032b6570032100...)
    // This is a raw construction of the ASN.1 header for Ed25519
    const prefix =  new Uint8Array([
      0x30, 0x2a, // Sequence, length 42
      0x30, 0x05, // Sequence, length 5
      0x06, 0x03, 0x2b, 0x65, 0x70, // OID: 1.3.101.112 (Ed25519)
      0x03, 0x21, 0x00 // Bit String, length 33, 0 padding
    ]);

    const combined = new Uint8Array(prefix.length + this.publicKey.length);
    combined.set(prefix);
    combined.set(this.publicKey, prefix.length);

    const b64 = sodium.to_base64(combined, sodium.base64_variants.ORIGINAL);

    // Format as PEM (64 chars per line is standard, but simple block works for many parsers)
    // We'll keep it simple: standard PEM header/footer
    return `-----BEGIN PUBLIC KEY-----\n${b64}\n-----END PUBLIC KEY-----\n`;
  }
}