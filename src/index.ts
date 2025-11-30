/**
 * Amorce SDK for JavaScript/TypeScript
 * Version 2.1.0
 * 
 * Aligned with amorce-py-sdk v0.2.0
 */

export const SDK_VERSION = "2.1.0";
export const AATP_VERSION = "0.1.0";

// Export Exception Classes
export * from './exceptions';

// Export Identity Module (with Provider Pattern)
export * from './identity';

// Export Envelope Module (Legacy/Future Use)
export * from './envelope';

// Export Client Module
export * from './client';

// Export Response Models (v2.1.0)
export * from './models';

console.log(`Amorce JS SDK v${SDK_VERSION} loaded.`);