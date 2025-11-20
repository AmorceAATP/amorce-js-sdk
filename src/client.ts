/**
 * Nexus Client Module (Task 2.4)
 * High-level HTTP client for the Nexus Agent Transaction Protocol (NATP).
 * Encapsulates envelope creation, signing, and transport using native fetch.
 */

import { IdentityManager } from './identity';
import { NexusEnvelope, SenderInfo } from './envelope';

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
  private agentId?: string;
  private apiKey?: string;

  constructor(
    identity: IdentityManager,
    directoryUrl: string,
    orchestratorUrl: string,
    agentId?: string,
    apiKey?: string
  ) {
    this.identity = identity;
    // Remove trailing slashes for consistency
    this.directoryUrl = directoryUrl.replace(/\/$/, "");
    this.orchestratorUrl = orchestratorUrl.replace(/\/$/, "");
    this.agentId = agentId;
    this.apiKey = apiKey;
  }

  /**
   * Helper to build and sign a standard envelope.
   */
  private async createEnvelope(payload: Record<string, any>): Promise<NexusEnvelope> {
    // 1. Build Sender Info
    const sender: SenderInfo = {
      public_key: this.identity.getPublicKeyPem(),
      agent_id: this.agentId
    };

    // 2. Create Envelope
    const envelope = new NexusEnvelope(sender, payload);

    // 3. Sign Envelope
    await envelope.sign(this.identity);

    return envelope;
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
        }
      });

      if (!response.ok) {
        console.error(`Discovery failed: ${response.status} ${response.statusText}`);
        return [];
      }

      return await response.json();
    } catch (e) {
      console.error("Discovery network error:", e);
      return [];
    }
  }

  /**
   * P-9.3: Execute a transaction via the Orchestrator.
   * Wraps the payload in a signed NATP Envelope.
   */
  public async transact(serviceContract: ServiceContract, payload: Record<string, any>): Promise<any> {
    if (!serviceContract.service_id) {
      console.error("Invalid service contract: missing service_id");
      return null;
    }

    // 1. Prepare transaction payload (Routing info + Data)
    const transactionPayload = {
      service_id: serviceContract.service_id,
      consumer_agent_id: this.agentId,
      data: payload // The actual application data
    };

    // 2. Create Signed Envelope
    const envelope = await this.createEnvelope(transactionPayload);

    // 3. Send to Orchestrator
    const url = `${this.orchestratorUrl}/v1/a2a/transact`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.apiKey) {
      headers['X-ATP-Key'] = this.apiKey;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(envelope)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Transaction failed: ${response.status} - ${errorText}`);
        return { error: `HTTP ${response.status}`, details: errorText };
      }

      return await response.json();

    } catch (e) {
      console.error("Transaction network error:", e);
      return null;
    }
  }
}