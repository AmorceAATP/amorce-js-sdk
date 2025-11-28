/**
 * Nexus Exceptions Module
 * Defines custom exceptions for the Nexus SDK to allow fine-grained error handling.
 * Matches the exception hierarchy from nexus-py-sdk v0.1.7
 */

/**
 * Base class for all Nexus SDK exceptions.
 */
export class NexusError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NexusError';
        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

/**
 * Raised when there is a configuration issue (e.g. invalid URL, missing key).
 */
export class NexusConfigError extends NexusError {
    constructor(message: string) {
        super(message);
        this.name = 'NexusConfigError';
    }
}

/**
 * Raised when a network operation fails (e.g. connection timeout, DNS error).
 */
export class NexusNetworkError extends NexusError {
    constructor(message: string) {
        super(message);
        this.name = 'NexusNetworkError';
    }
}

/**
 * Raised when the Nexus API returns an error response (4xx, 5xx).
 */
export class NexusAPIError extends NexusError {
    public statusCode?: number;
    public responseBody?: string;

    constructor(message: string, statusCode?: number, responseBody?: string) {
        super(message);
        this.name = 'NexusAPIError';
        this.statusCode = statusCode;
        this.responseBody = responseBody;
    }
}

/**
 * Raised when a security-related operation fails (e.g. signing, key loading).
 */
export class NexusSecurityError extends NexusError {
    constructor(message: string) {
        super(message);
        this.name = 'NexusSecurityError';
    }
}

/**
 * Raised when data validation fails (e.g. invalid envelope structure).
 */
export class NexusValidationError extends NexusError {
    constructor(message: string) {
        super(message);
        this.name = 'NexusValidationError';
    }
}
