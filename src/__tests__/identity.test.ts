import { IdentityManager } from '../index';

describe('IdentityManager', () => {
  test('should generate a valid keypair', async () => {
    const identity = await IdentityManager.generate();
    expect(identity).toBeDefined();
    expect(identity.publicKey).toBeDefined();
    // Check PEM format
    const pem = identity.getPublicKeyPem();
    expect(pem).toContain('-----BEGIN PUBLIC KEY-----');
    expect(pem).toContain('-----END PUBLIC KEY-----');
  });

  test('should sign and verify a message', async () => {
    const identity = await IdentityManager.generate();
    const message = "Hello Nexus Protocol";

    // Sign
    const signature = await identity.sign(message);
    expect(typeof signature).toBe('string');

    // Verify
    const isValid = await IdentityManager.verify(message, signature, identity.publicKey);
    expect(isValid).toBe(true);
  });

  test('should fail verification on tampered message', async () => {
    const identity = await IdentityManager.generate();
    const message = "Original Message";
    const signature = await identity.sign(message);

    const isValid = await IdentityManager.verify("Tampered Message", signature, identity.publicKey);
    expect(isValid).toBe(false);
  });
});