/**
 * Amorce SDK for JavaScript/TypeScript
 * Version 3.1.0
 * 
 * Aligned with amorce-py-sdk v0.2.2
 * 
 * v3.1.0 Updates:
 * - A2A Well-Known manifest helpers for agent discoverability
 * 
 * v3.0.0 Updates:
 * - HITL (Human-in-the-Loop) approval workflow
 * - MCP Integration for secure tool calling
 * - verifyRequest() for builders
 * - toManifestJson() for agent registration
 * - Full feature parity with Python SDK
 */

export const SDK_VERSION = "3.1.0";
export const AATP_VERSION = "0.1.0";

// Export Exception Classes
export * from './exceptions';

// Export Identity Module (with Provider Pattern)
export * from './identity';

// Export Envelope Module (Legacy/Future Use)
export * from './envelope';

// Export Client Module (with HITL support)
export * from './client';

// Export Response Models
export * from './models';

// Export Request Verification
export * from './verify';

// Export MCP Integration
export * from './mcp';

// Export A2A Well-Known Manifest helpers (NEW in v3.1.0)
export * from './wellKnown';

console.log(`Amorce JS SDK v${SDK_VERSION} loaded.`);