/**
 * Nexus Identity Module (Task 2.2)
 * Handles Ed25519 key management and signing using libsodium.
 * Compatible with both Browser and Node.js environments.
 */
declare class IdentityManager {
    private privateKey;
    publicKey: Uint8Array;
    private constructor();
    /**
     * Initializes libsodium and generates a new random keypair.
     */
    static generate(): Promise<IdentityManager>;
    /**
     * Loads an identity from a raw private key (Uint8Array).
     */
    static fromPrivateKey(privateKey: Uint8Array): Promise<IdentityManager>;
    /**
     * Signs a message (string or bytes) and returns the signature in Base64.
     */
    sign(message: string | Uint8Array): Promise<string>;
    /**
     * Verifies a signature against a public key.
     * Static utility for validation.
     */
    static verify(message: string | Uint8Array, signatureBase64: string, publicKey: Uint8Array): Promise<boolean>;
    /**
     * Exports the Public Key to PEM format (PKIX).
     * Matches Python's serialization.PublicFormat.SubjectPublicKeyInfo
     */
    getPublicKeyPem(): string;
}

/**
 * Nexus Envelope (Task 2.3 - Fixed)
 * Defines the strict NATP v0.1 data structure.
 * Handles canonical serialization and signing.
 * v1.1 Fix: Strips ASN.1 header from PEM public keys.
 */

interface SenderInfo {
    public_key: string;
    agent_id?: string;
}
interface SettlementInfo {
    amount: number;
    currency: string;
    facilitation_fee: number;
}
declare class NexusEnvelope {
    natp_version: string;
    id: string;
    timestamp: number;
    sender: SenderInfo;
    payload: Record<string, any>;
    settlement: SettlementInfo;
    signature?: string;
    constructor(sender: SenderInfo, payload: Record<string, any>);
    /**
     * Returns the canonical JSON bytes of the envelope WITHOUT the signature.
     */
    getCanonicalJson(): Uint8Array;
    /**
     * Signs the envelope using the provided IdentityManager.
     */
    sign(identity: IdentityManager): Promise<void>;
    /**
     * Helper to parse a PEM public key back to Uint8Array for verification.
     * FIX: We must strip the ASN.1 header to get the raw Ed25519 key.
     */
    private static pemToBytes;
    /**
     * Verifies the envelope's signature against its own sender public key.
     */
    verify(): Promise<boolean>;
}

/**
 * Nexus Client Module (Task 2.4)
 * High-level HTTP client for the Nexus Agent Transaction Protocol (NATP).
 * Encapsulates envelope creation, signing, and transport using native fetch.
 */

interface ServiceContract {
    service_id: string;
    provider_agent_id: string;
    service_type: string;
    [key: string]: any;
}
declare class NexusClient {
    private identity;
    private directoryUrl;
    private orchestratorUrl;
    private agentId?;
    private apiKey?;
    constructor(identity: IdentityManager, directoryUrl: string, orchestratorUrl: string, agentId?: string, apiKey?: string);
    /**
     * Helper to build and sign a standard envelope.
     */
    private createEnvelope;
    /**
     * P-7.1: Discover services from the Trust Directory.
     */
    discover(serviceType: string): Promise<ServiceContract[]>;
    /**
     * P-9.3: Execute a transaction via the Orchestrator.
     * Wraps the payload in a signed NATP Envelope.
     */
    transact(serviceContract: ServiceContract, payload: Record<string, any>): Promise<any>;
}

/**
 * Nexus SDK for JavaScript/TypeScript
 * Version 0.1.0
 */
declare const SDK_VERSION = "0.1.0";

export { IdentityManager, NexusClient, NexusEnvelope, SDK_VERSION, type SenderInfo, type ServiceContract, type SettlementInfo };
