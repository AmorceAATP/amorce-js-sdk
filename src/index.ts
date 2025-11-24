/**
 * Nexus SDK for JavaScript/TypeScript
 * Version 0.1.2
 */

export const SDK_VERSION = "0.1.2"; // Mise à jour ici

// Task 2.2: Export Identity Module
export * from './identity';

// Task 2.3: Export Envelope Module
export * from './envelope';

// Task 2.4: Export Client Module
export * from './client';

console.log(`Nexus JS SDK v${SDK_VERSION} loaded.`);