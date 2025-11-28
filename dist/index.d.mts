/**
 * Nexus Exceptions Module
 * Defines custom exceptions for the Nexus SDK to allow fine-grained error handling.
 * Matches the exception hierarchy from nexus-py-sdk v0.1.7
 */
/**
 * Base class for all Nexus SDK exceptions.
 */
declare class NexusError extends Error {
    constructor(message: string);
}
/**
 * Raised when there is a configuration issue (e.g. invalid URL, missing key).
 */
declare class NexusConfigError extends NexusError {
    constructor(message: string);
}
/**
 * Raised when a network operation fails (e.g. connection timeout, DNS error).
 */
declare class NexusNetworkError extends NexusError {
    constructor(message: string);
}
/**
 * Raised when the Nexus API returns an error response (4xx, 5xx).
 */
declare class NexusAPIError extends NexusError {
    statusCode?: number;
    responseBody?: string;
    constructor(message: string, statusCode?: number, responseBody?: string);
}
/**
 * Raised when a security-related operation fails (e.g. signing, key loading).
 */
declare class NexusSecurityError extends NexusError {
    constructor(message: string);
}
/**
 * Raised when data validation fails (e.g. invalid envelope structure).
 */
declare class NexusValidationError extends NexusError {
    constructor(message: string);
}

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
/**
 * Abstract base class for retrieving private keys.
 */
interface IdentityProvider {
    getPrivateKey(): Promise<Uint8Array>;
}
/**
 * Loads a private key from an environment variable string.
 * Works in both Node.js and browser environments (if env vars are available).
 */
declare class EnvVarProvider implements IdentityProvider {
    private envVarName;
    constructor(envVarName?: string);
    getPrivateKey(): Promise<Uint8Array>;
    private pemToPrivateKey;
}
/**
 * Central class to manage the agent's identity.
 */
declare class IdentityManager {
    private privateKey;
    publicKey: Uint8Array;
    private constructor();
    /**
     * Initializes from a provider (flexible key source).
     */
    static fromProvider(provider: IdentityProvider): Promise<IdentityManager>;
    /**
     * Factory method: Generates a new ephemeral Ed25519 identity in memory.
     * Matches Python's IdentityManager.generate_ephemeral()
     */
    static generate(): Promise<IdentityManager>;
    /**
     * Legacy method: Loads an identity from a raw private key (Uint8Array).
     * Kept for backward compatibility.
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
    /**
     * MCP 1.0: Deterministic Agent ID derivation.
     * Returns the SHA-256 hash of the public key PEM.
     * This ensures the ID is cryptographically bound to the key.
     * Matches Python SDK behavior.
     */
    getAgentId(): string;
    /**
     * Returns the canonical JSON byte representation for signing.
     * Strict: sort_keys=True, no whitespace.
     * Matches Python's get_canonical_json_bytes()
     */
    static getCanonicalJsonBytes(payload: any): Uint8Array;
}

/**
 * Nexus Envelope (Task 2.3 - Updated for v0.1.7)
 * Defines the strict NATP v0.1 data structure.
 * Handles canonical serialization and signing.
 *
 * v0.1.7 Updates:
 * - Enhanced error handling with custom exceptions
 * - Better validation
 *
 * NOTE: This module is kept for potential future use and backward compatibility.
 * The current transaction protocol (v0.1.7) uses a flat JSON structure instead
 * of wrapping everything in an envelope.
 */

type NexusPriority = 'normal' | 'high' | 'critical';
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
    priority: NexusPriority;
    timestamp: number;
    sender: SenderInfo;
    payload: Record<string, any>;
    settlement: SettlementInfo;
    signature?: string;
    constructor(sender: SenderInfo, payload: Record<string, any>, priority?: NexusPriority);
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
declare const Envelope: typeof NexusEnvelope;

/**
 * Nexus Client Module (Task 2.4 - Updated for v0.1.7)
 * High-level HTTP client for the Nexus Agent Transaction Protocol (NATP).
 * Encapsulates signature creation and transport using fetch with retry logic.
 *
 * v0.1.7 Updates:
 * - Flat transaction protocol (signature in header, not wrapped in envelope)
 * - Auto-derived Agent ID from identity
 * - Proper exception handling
 * - Updated API key header to X-API-Key
 * - URL validation
 */

/**
 * Priority Level constants for easier developer access.
 * Matches Python SDK's PriorityLevel class.
 */
declare class PriorityLevel {
    static readonly NORMAL: NexusPriority;
    static readonly HIGH: NexusPriority;
    static readonly CRITICAL: NexusPriority;
}
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
    private agentId;
    private apiKey?;
    constructor(identity: IdentityManager, directoryUrl: string, orchestratorUrl: string, agentId?: string, apiKey?: string);
    /**
     * P-7.1: Discover services from the Trust Directory.
     */
    discover(serviceType: string): Promise<ServiceContract[]>;
    /**
     * P-9.3: Execute a transaction via the Orchestrator.
     * FIX: Aligned with Orchestrator v1.4 protocol (Flat JSON + Header Signature).
     * Matches Python SDK's transact() method.
     */
    transact(serviceContract: ServiceContract, payload: Record<string, any>, priority?: NexusPriority): Promise<any>;
}

/**
 * Nexus SDK for JavaScript/TypeScript
 * Version 0.1.7
 *
 * Aligned with nexus-py-sdk v0.1.7
 */
declare const SDK_VERSION = "0.1.7";
declare const NATP_VERSION = "0.1.0";

export { EnvVarProvider, Envelope, IdentityManager, type IdentityProvider, NATP_VERSION, NexusAPIError, NexusClient, NexusConfigError, NexusEnvelope, NexusError, NexusNetworkError, type NexusPriority, NexusSecurityError, NexusValidationError, PriorityLevel, SDK_VERSION, type SenderInfo, type ServiceContract, type SettlementInfo };
