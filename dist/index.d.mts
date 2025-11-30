/**
 * Amorce Exceptions Module
 * Defines custom exceptions for the Amorce SDK to allow fine-grained error handling.
 * Matches the exception hierarchy from nexus-py-sdk v0.1.7
 */
/**
 * Base class for all Amorce SDK exceptions.
 */
declare class AmorceError extends Error {
    constructor(message: string);
}
/**
 * Raised when there is a configuration issue (e.g. invalid URL, missing key).
 */
declare class AmorceConfigError extends AmorceError {
    constructor(message: string);
}
/**
 * Raised when a network operation fails (e.g. connection timeout, DNS error).
 */
declare class AmorceNetworkError extends AmorceError {
    constructor(message: string);
}
/**
 * Raised when the Amorce API returns an error response (4xx, 5xx).
 */
declare class AmorceAPIError extends AmorceError {
    statusCode?: number;
    responseBody?: string;
    constructor(message: string, statusCode?: number, responseBody?: string);
}
/**
 * Raised when a security-related operation fails (e.g. signing, key loading).
 */
declare class AmorceSecurityError extends AmorceError {
    constructor(message: string);
}
/**
 * Raised when data validation fails (e.g. invalid envelope structure).
 */
declare class AmorceValidationError extends AmorceError {
    constructor(message: string);
}

/**
 * Amorce Identity Module (Task 2.2 - Enhanced for v0.1.7)
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
 * Amorce Envelope (Task 2.3 - Updated for v0.1.7)
 * Defines the strict AATP v0.1 data structure.
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

type AmorcePriority = 'normal' | 'high' | 'critical';
interface SenderInfo {
    public_key: string;
    agent_id?: string;
}
interface SettlementInfo {
    amount: number;
    currency: string;
    facilitation_fee: number;
}
declare class AmorceEnvelope {
    natp_version: string;
    id: string;
    priority: AmorcePriority;
    timestamp: number;
    sender: SenderInfo;
    payload: Record<string, any>;
    settlement: SettlementInfo;
    signature?: string;
    constructor(sender: SenderInfo, payload: Record<string, any>, priority?: AmorcePriority);
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
declare const Envelope: typeof AmorceEnvelope;

/**
 * Amorce Response Models Module
 * TypeScript interfaces and classes for structured responses.
 * Matches Python SDK's Pydantic models for consistency.
 */
/**
 * Configuration for Amorce clients.
 */
interface AmorceConfig {
    directoryUrl: string;
    orchestratorUrl: string;
}
/**
 * Nested result data from a successful transaction.
 */
interface TransactionResult {
    status: string;
    message?: string;
    data?: Record<string, any>;
}
/**
 * Standardized response wrapper for transact() operations.
 * Provides consistent interface across sync and async implementations.
 */
interface AmorceResponse {
    transaction_id: string;
    status_code: number;
    result?: TransactionResult;
    error?: string;
    /**
     * Check if transaction was successful (2xx status)
     */
    isSuccess(): boolean;
    /**
     * Check if error is retryable (5xx or 429)
     */
    isRetryable(): boolean;
}
/**
 * Concrete implementation of AmorceResponse.
 */
declare class AmorceResponseImpl implements AmorceResponse {
    transaction_id: string;
    status_code: number;
    result?: TransactionResult | undefined;
    error?: string | undefined;
    constructor(transaction_id: string, status_code: number, result?: TransactionResult | undefined, error?: string | undefined);
    isSuccess(): boolean;
    isRetryable(): boolean;
}

/**
 * Amorce Client Module (v2.1.0 - Enhanced)
 * High-level HTTP client for the Amorce Agent Transaction Protocol (AATP).
 *
 * v2.1.0 Updates (Feature Parity with Python SDK v0.2.0):
 * - HTTP/2 support via undici
 * - Exponential backoff + jitter via p-retry
 * - Idempotency key generation (UUIDv4)
 * - Structured AmorceResponse return type
 * - Additional headers: X-Amorce-Idempotency, X-Amorce-Agent-ID
 */

/**
 * Priority Level constants for easier developer access.
 * Matches Python SDK's PriorityLevel class.
 */
declare class PriorityLevel {
    static readonly NORMAL: AmorcePriority;
    static readonly HIGH: AmorcePriority;
    static readonly CRITICAL: AmorcePriority;
}
interface ServiceContract {
    service_id: string;
    provider_agent_id?: string;
    service_type?: string;
    [key: string]: any;
}
declare class AmorceClient {
    private identity;
    private directoryUrl;
    private orchestratorUrl;
    private agentId;
    private apiKey?;
    constructor(identity: IdentityManager, directoryUrl: string, orchestratorUrl: string, agentId?: string, apiKey?: string);
    /**
     * Discover services from the Trust Directory.
     * Uses p-retry for exponential backoff with jitter.
     */
    discover(serviceType: string): Promise<ServiceContract[]>;
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
    transact(serviceContract: ServiceContract, payload: Record<string, any>, priority?: AmorcePriority, idempotencyKey?: string): Promise<AmorceResponse>;
}

/**
 * Amorce SDK for JavaScript/TypeScript
 * Version 2.1.0
 *
 * Aligned with amorce-py-sdk v0.2.0
 */
declare const SDK_VERSION = "2.1.0";
declare const AATP_VERSION = "0.1.0";

export { AATP_VERSION, AmorceAPIError, AmorceClient, type AmorceConfig, AmorceConfigError, AmorceEnvelope, AmorceError, AmorceNetworkError, type AmorcePriority, type AmorceResponse, AmorceResponseImpl, AmorceSecurityError, AmorceValidationError, EnvVarProvider, Envelope, IdentityManager, type IdentityProvider, PriorityLevel, SDK_VERSION, type SenderInfo, type ServiceContract, type SettlementInfo, type TransactionResult };
