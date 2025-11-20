import { IdentityManager, NexusEnvelope, SenderInfo } from '../index';

describe('NexusEnvelope', () => {
  let identity: IdentityManager;

  beforeAll(async () => {
    identity = await IdentityManager.generate();
  });

  test('should create a valid envelope with defaults', () => {
    const sender: SenderInfo = { public_key: identity.getPublicKeyPem() };
    const payload = { message: "Hello World" };

    const envelope = new NexusEnvelope(sender, payload);

    expect(envelope.natp_version).toBe("0.1.0");
    expect(envelope.id).toBeDefined();
    expect(envelope.timestamp).toBeDefined();
    expect(envelope.payload).toEqual(payload);
    expect(envelope.signature).toBeUndefined(); // Not signed yet
  });

  test('should sign and verify an envelope', async () => {
    const sender: SenderInfo = { public_key: identity.getPublicKeyPem() };
    const payload = { intent: "TEST_TRANSACTION", amount: 100 };

    const envelope = new NexusEnvelope(sender, payload);

    // 1. Sign
    await envelope.sign(identity);
    expect(envelope.signature).toBeDefined();

    // 2. Verify
    const isValid = await envelope.verify();
    expect(isValid).toBe(true);
  });

  test('should fail verification if payload is tampered', async () => {
    const sender: SenderInfo = { public_key: identity.getPublicKeyPem() };
    const payload = { sensitive_data: "original" };

    const envelope = new NexusEnvelope(sender, payload);
    await envelope.sign(identity);

    // Tamper with the payload AFTER signing
    envelope.payload.sensitive_data = "hacked";

    const isValid = await envelope.verify();
    expect(isValid).toBe(false);
  });

  test('should fail verification if settlement is tampered', async () => {
    const sender: SenderInfo = { public_key: identity.getPublicKeyPem() };
    const payload = { data: "ok" };

    const envelope = new NexusEnvelope(sender, payload);
    await envelope.sign(identity);

    // Tamper with the money
    envelope.settlement.amount = 1000000;

    const isValid = await envelope.verify();
    expect(isValid).toBe(false);
  });
});