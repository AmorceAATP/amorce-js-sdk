/**
 * A2A Well-Known Manifest Helper
 * 
 * Provides easy integration for serving /.well-known/agent.json endpoints
 * to make your agent discoverable in the A2A ecosystem.
 */

const AMORCE_DIRECTORY_URL = "https://amorce-trust-api-425870997313.us-central1.run.app";

export interface ManifestOptions {
    agentId: string;
    directoryUrl?: string;
    cacheTtl?: number; // seconds
}

export interface A2AManifest {
    name: string;
    url: string;
    version: string;
    description: string;
    protocol_version: string;
    capabilities: string[];
    authentication: {
        type: string;
        public_key: string;
        algorithm: string;
        directory_url: string;
    };
    amorce: {
        agent_id: string;
        status: string;
        registered_at: string;
        category: string;
    };
}

/**
 * Fetch the A2A manifest for an agent from the Amorce Directory.
 */
export async function fetchManifest(
    agentId: string,
    directoryUrl: string = AMORCE_DIRECTORY_URL
): Promise<A2AManifest> {
    const url = `${directoryUrl}/api/v1/agents/${agentId}/manifest`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

/**
 * Express middleware to serve /.well-known/agent.json
 * 
 * @example
 * ```typescript
 * import express from 'express';
 * import { serveWellKnown } from '@amorce/sdk';
 * 
 * const app = express();
 * app.use(serveWellKnown({ agentId: 'my-agent-id' }));
 * ```
 */
export function serveWellKnown(options: ManifestOptions) {
    const {
        agentId,
        directoryUrl = AMORCE_DIRECTORY_URL,
        cacheTtl = 300
    } = options;

    let cachedManifest: A2AManifest | null = null;
    let cachedAt = 0;

    return async (req: any, res: any, next: any) => {
        // Only handle /.well-known/agent.json
        if (req.path !== '/.well-known/agent.json') {
            return next();
        }

        const now = Date.now() / 1000;

        // Return cached if valid
        if (cachedManifest && (now - cachedAt) < cacheTtl) {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', `public, max-age=${cacheTtl}`);
            return res.json(cachedManifest);
        }

        try {
            cachedManifest = await fetchManifest(agentId, directoryUrl);
            cachedAt = now;

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', `public, max-age=${cacheTtl}`);
            res.json(cachedManifest);
        } catch (error: any) {
            console.error('Failed to fetch A2A manifest:', error.message);
            res.status(500).json({ error: 'Failed to fetch agent manifest' });
        }
    };
}

/**
 * Next.js API route handler for /.well-known/agent.json
 * 
 * @example
 * ```typescript
 * // pages/api/.well-known/agent.json.ts (Next.js Pages Router)
 * // or app/.well-known/agent.json/route.ts (Next.js App Router)
 * 
 * import { createWellKnownHandler } from '@amorce/sdk';
 * 
 * export const GET = createWellKnownHandler({ agentId: 'my-agent-id' });
 * ```
 */
export function createWellKnownHandler(options: ManifestOptions) {
    const {
        agentId,
        directoryUrl = AMORCE_DIRECTORY_URL,
        cacheTtl = 300
    } = options;

    let cachedManifest: A2AManifest | null = null;
    let cachedAt = 0;

    return async (req: Request): Promise<Response> => {
        const now = Date.now() / 1000;

        // Return cached if valid
        if (cachedManifest && (now - cachedAt) < cacheTtl) {
            return new Response(JSON.stringify(cachedManifest), {
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': `public, max-age=${cacheTtl}`,
                },
            });
        }

        try {
            cachedManifest = await fetchManifest(agentId, directoryUrl);
            cachedAt = now;

            return new Response(JSON.stringify(cachedManifest), {
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': `public, max-age=${cacheTtl}`,
                },
            });
        } catch (error: any) {
            console.error('Failed to fetch A2A manifest:', error.message);
            return new Response(JSON.stringify({ error: 'Failed to fetch agent manifest' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    };
}

/**
 * Generate a static manifest JSON that can be deployed as a file.
 * 
 * @example
 * ```typescript
 * import { generateManifestJson } from '@amorce/sdk';
 * 
 * const manifest = await generateManifestJson('my-agent-id');
 * // Save to .well-known/agent.json
 * ```
 */
export async function generateManifestJson(
    agentId: string,
    directoryUrl: string = AMORCE_DIRECTORY_URL
): Promise<string> {
    const manifest = await fetchManifest(agentId, directoryUrl);
    return JSON.stringify(manifest, null, 2);
}
