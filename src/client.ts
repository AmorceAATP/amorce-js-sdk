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

import { request } from 'undici';
import pRetry from 'p-retry';
import { v4 as uuidv4 } from 'uuid';
import { IdentityManager } from './identity';
import { AmorcePriority } from './envelope';
import { AmorceConfigError, AmorceNetworkError, AmorceAPIError } from './exceptions';
import { AmorceResponse, AmorceResponseImpl } from './models';

/**
 * Priority Level constants for easier developer access.
 * Matches Python SDK's PriorityLevel class.
 */
export class PriorityLevel {
  static readonly NORMAL: AmorcePriority = 'normal';
  static readonly HIGH: AmorcePriority = 'high';
  static readonly CRITICAL: AmorcePriority = 'critical';
}

export interface ServiceContract {
  service_id: string;
  provider_agent_id?: string;
  service_type?: string;
  [key: string]: any;
}

export class AmorceClient {
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
      throw new AmorceConfigError(`Invalid directory_url: ${directoryUrl}`);
    }
    if (!orchestratorUrl.startsWith('http://') && !orchestratorUrl.startsWith('https://')) {
      throw new AmorceConfigError(`Invalid orchestrator_url: ${orchestratorUrl}`);
    }

    // Remove trailing slashes for consistency
    this.directoryUrl = directoryUrl.replace(/\/$/, '');
    this.orchestratorUrl = orchestratorUrl.replace(/\/$/, '');

    // Auto-derive Agent ID from identity
    this.agentId = agentId || identity.getAgentId();
    this.apiKey = apiKey;
  }

  /**
   * Discover services from the Trust Directory.
   * Uses p-retry for exponential backoff with jitter.
   */
  public async discover(serviceType: string): Promise<ServiceContract[]> {
    const url = `${this.directoryUrl}/api/v1/services/search?service_type=${encodeURIComponent(serviceType)}`;

    try {
      const response = await pRetry(
        async () => {
          const res = await request(url, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            }
          });

          // Check for retryable status codes
          if ([429, 503, 504].includes(res.statusCode)) {
            throw new Error(`Retryable status: ${res.statusCode}`);
          }

          if (res.statusCode !== 200) {
            const errorText = await res.body.text();
            throw new AmorceAPIError(
              `Discovery API error: ${res.statusCode}`,
              res.statusCode,
              errorText
            );
          }

          return res;
        },
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 10000,
          randomize: true,  // Adds jitter to prevent thundering herd
          onFailedAttempt: (error) => {
            console.warn(`Discovery retry attempt ${error.attemptNumber}: ${error.message}`);
          }
        }
      );

      return await response.body.json() as ServiceContract[];
    } catch (e) {
      if (e instanceof AmorceAPIError) {
        throw e;
      }
      throw new AmorceNetworkError(`Discovery network error: ${e}`);
    }
  }

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
  public async transact(
    serviceContract: ServiceContract,
    payload: Record<string, any>,
    priority: AmorcePriority = PriorityLevel.NORMAL,
    idempotencyKey?: string
  ): Promise<AmorceResponse> {
    if (!serviceContract.service_id) {
      throw new AmorceConfigError('Invalid service contract: missing service_id');
    }

    // AUTO-GENERATE IDEMPOTENCY KEY (v2.1.0)
    const key = idempotencyKey || uuidv4();

    // Build flat JSON body
    const requestBody = {
      service_id: serviceContract.service_id,
      consumer_agent_id: this.agentId,
      payload: payload,
      priority: priority
    };

    // Sign the canonical request body
    const canonicalBytes = IdentityManager.getCanonicalJsonBytes(requestBody);
    const signature = await this.identity.sign(canonicalBytes);

    // Construct headers with ALL required fields
    const headers: Record<string, string> = {
      'X-Agent-Signature': signature,
      'X-Amorce-Idempotency': key,           // NEW in v2.1.0
      'X-Amorce-Agent-ID': this.agentId,     // NEW in v2.1.0
      'Content-Type': 'application/json'
    };

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    const url = `${this.orchestratorUrl}/v1/a2a/transact`;

    try {
      // Execute with p-retry (exponential backoff + jitter)
      const response = await pRetry(
        async () => {
          const res = await request(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
            // undici uses HTTP/2 by default for https:// URLs
          });

          // Retry on specific status codes
          if ([429, 503, 504].includes(res.statusCode)) {
            throw new Error(`Retryable status: ${res.statusCode}`);
          }

          // Non-retryable client errors (4xx except 429)
          if (res.statusCode >= 400 && res.statusCode < 500 && res.statusCode !== 429) {
            const errorText = await res.body.text();
            throw new AmorceAPIError(
              `Transaction failed with status ${res.statusCode}`,
              res.statusCode,
              errorText
            );
          }

          // Server errors (5xx)
          if (res.statusCode >= 500) {
            throw new Error(`Server error: ${res.statusCode}`);
          }

          return res;
        },
        {
          retries: 3,
          minTimeout: 1000,    // 1s
          maxTimeout: 10000,   // 10s
          randomize: true,     // Adds 0-2s jitter
          onFailedAttempt: (error) => {
            console.warn(`Transaction retry attempt ${error.attemptNumber}: ${error.message}`);
          }
        }
      );

      // Parse response and build AmorceResponse
      const jsonData = await response.body.json() as any;

      return new AmorceResponseImpl(
        jsonData.transaction_id || key,
        response.statusCode,
        {
          status: jsonData.status || 'success',
          message: jsonData.message,
          data: jsonData.data
        },
        undefined  // No error for successful responses
      );

    } catch (e) {
      if (e instanceof AmorceAPIError) {
        throw e;
      }
      throw new AmorceNetworkError(`Transaction network error: ${e}`);
    }
  }
}