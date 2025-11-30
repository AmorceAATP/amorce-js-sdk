/**
 * Amorce Response Models Module
 * TypeScript interfaces and classes for structured responses.
 * Matches Python SDK's Pydantic models for consistency.
 */

/**
 * Configuration for Amorce clients.
 */
export interface AmorceConfig {
    directoryUrl: string;
    orchestratorUrl: string;
}

/**
 * Nested result data from a successful transaction.
 */
export interface TransactionResult {
    status: string;
    message?: string;
    data?: Record<string, any>;
}

/**
 * Standardized response wrapper for transact() operations.
 * Provides consistent interface across sync and async implementations.
 */
export interface AmorceResponse {
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
export class AmorceResponseImpl implements AmorceResponse {
    constructor(
        public transaction_id: string,
        public status_code: number,
        public result?: TransactionResult,
        public error?: string
    ) { }

    isSuccess(): boolean {
        return this.status_code >= 200 && this.status_code < 300;
    }

    isRetryable(): boolean {
        return [429, 500, 502, 503, 504].includes(this.status_code);
    }
}
