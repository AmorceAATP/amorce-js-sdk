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

import { IdentityManager } from './identity';
import { NexusPriority } from './envelope';
import { NexusConfigError, NexusNetworkError, NexusAPIError } from './exceptions';
// @ts-ignore: cross-fetch types can be tricky, ignore if implicit
import originalFetch from 'cross-fetch';
// @ts-ignore: fetch-retry usually lacks types or has conflict, we handle it manually
import fetchRetry from 'fetch-retry';

// Wrap fetch with retry logic (Resilience v0.1.2+)
const fetch = fetchRetry(originalFetch as any);

/**
 * Priority Level constants for easier developer access.
 * Matches Python SDK's PriorityLevel class.
 */
export class PriorityLevel {
  static readonly NORMAL: NexusPriority = 'normal';
  static readonly HIGH: NexusPriority = 'high';
  static readonly CRITICAL: NexusPriority = 'critical';
}

export interface ServiceContract {
  service_id: string;
  provider_agent_id: string;
  service_type: string;
  // ... other fields can be added as needed
  [key: string]: any;
}

export class NexusClient {
  private identity: IdentityManager;
  private directoryUrl: string;
  private orchestratorUrl: string;
  private agentId: string;
  private apiKey?: string;

  constructor(
    identity: IdentityManager,
    directoryUrl: string,
    orchestratorUrl: string,
    agentId?: string,
    apiKey?: string
  ) {
    this.identity = identity;

    // Validate URLs
    if (!directoryUrl.startsWith('http://') && !directoryUrl.startsWith('https://')) {
      throw new NexusConfigError(`Invalid directory_url: ${directoryUrl}`);
    }
    if (!orchestratorUrl.startsWith('http://') && !orchestratorUrl.startsWith('https://')) {
      throw new NexusConfigError(`Invalid orchestrator_url: ${orchestratorUrl}`);
    }

    // Remove trailing slashes for consistency
    this.directoryUrl = directoryUrl.replace(/\/$/, '');
    this.orchestratorUrl = orchestratorUrl.replace(/\/$/, '');

    // MCP 2.1: Read Agent ID directly from the identity derivation
    this.agentId = agentId || identity.getAgentId();
    this.apiKey = apiKey;
  }

  /**
   * P-7.1: Discover services from the Trust Directory.
   */
  public async discover(serviceType: string): Promise<ServiceContract[]> {
    const url = `${this.directoryUrl}/api/v1/services/search?service_type=${encodeURIComponent(serviceType)}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        // Resilience Config
        retries: 3,
        retryDelay: (attempt: number) => Math.pow(2, attempt) * 1000 // 1s, 2s, 4s
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new NexusAPIError(
          `Discovery API error: ${response.status}`,
          response.status,
          errorText
        );
      }

      return await response.json();
    } catch (e) {
      if (e instanceof NexusAPIError) {
        throw e;
      }
      throw new NexusNetworkError(`Discovery network error: ${e}`);
    }
  }

  /**
   * P-9.3: Execute a transaction via the Orchestrator.
   * FIX: Aligned with Orchestrator v1.4 protocol (Flat JSON + Header Signature).
   * Matches Python SDK's transact() method.
   */
  public async transact(
    serviceContract: ServiceContract,
    payload: Record<string, any>,
    priority: NexusPriority = PriorityLevel.NORMAL
  ): Promise<any> {
    if (!serviceContract.service_id) {
      throw new NexusConfigError('Invalid service contract: missing service_id');
    }

    // --- PROTOCOL ALIGNMENT ---
    // 1. Build the flat JSON body expected by the server
    const requestBody = {
      service_id: serviceContract.service_id,
      consumer_agent_id: this.agentId,
      payload: payload,
      priority: priority
    };

    // 2. Sign this exact JSON
    const canonicalBytes = IdentityManager.getCanonicalJsonBytes(requestBody);
    const signature = await this.identity.sign(canonicalBytes);

    // 3. Put the signature in the header
    const headers: Record<string, string> = {
      'X-Agent-Signature': signature,
      'Content-Type': 'application/json'
    };

    // FIX: Use X-API-Key instead of X-ATP-Key to match Python SDK
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    const url = `${this.orchestratorUrl}/v1/a2a/transact`;

    try {
      // 4. Send with Auto-Retry (Resilience)
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
        // Retry Strategy: 3 attempts, exponential backoff
        retries: 3,
        retryOn: [500, 502, 503, 504, 429], // Retry on server errors & rate limits
        retryDelay: (attempt: number) => Math.pow(2, attempt) * 1000 // 1s, 2s, 4s
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new NexusAPIError(
          `Transaction failed with status ${response.status}`,
          response.status,
          errorText
        );
      }

      return await response.json();
    } catch (e) {
      if (e instanceof NexusAPIError) {
        throw e;
      }
      throw new NexusNetworkError(`Transaction network error: ${e}`);
    }
  }
}