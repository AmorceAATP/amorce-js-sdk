# Nexus TypeScript SDK (NATP)

[![npm version](https://img.shields.io/npm/v/@nexus/sdk.svg)](https://www.npmjs.com/package/@nexus/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Official TypeScript/JavaScript SDK for the Nexus Agent Transaction Protocol (NATP).**

The Nexus SDK allows any JavaScript application (Node.js or Browser) to become a verified node in the **Agent Economy**. It provides the cryptographic primitives (Ed25519 via `libsodium`) and the transport layer required to transact securely with AI Agents.

---

## 🚀 Features

* **Zero-Trust Security**: Every request is cryptographically signed (Ed25519).
* **Isomorphic**: Works in Node.js and Modern Browsers.
* **Priority Lane (v0.1.2)**: Mark critical messages to bypass network congestion.
* **Resilience (v0.1.2)**: Automatic retry logic with exponential backoff for unstable networks.
* **Type Safe**: Native TypeScript support for robust development.

---

## 📦 Installation

```bash
npm install @nexus/sdk fetch-retry cross-fetch