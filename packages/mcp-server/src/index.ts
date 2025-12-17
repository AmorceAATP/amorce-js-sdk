#!/usr/bin/env node
/**
 * Amorce MCP Server v1.0.0
 * 
 * Model Context Protocol server that exposes Amorce's Agent Naming Service (ANS)
 * to Claude and other MCP-compatible LLMs.
 * 
 * Usage:
 *   Claude Desktop: Add to claude_desktop_config.json
 *   Claude Code: claude mcp add amorce -- npx @amorce/mcp-server
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const TRUST_DIRECTORY_URL = process.env.AMORCE_TRUST_URL ||
    "https://amorce-trust-api-425870997313.us-central1.run.app";

// Create MCP server instance
const server = new McpServer({
    name: "amorce",
    version: "1.0.0",
});

/**
 * Tool: search_agents
 * Find AI agents by capability using semantic search
 */
server.tool(
    "search_agents",
    {
        query: z.string().describe("Natural language description of what you need help with"),
        category: z.string().optional().describe("Filter by category (travel, weather, finance, etc.)"),
        limit: z.number().optional().default(10).describe("Maximum number of results")
    },
    async ({ query, category, limit }) => {
        try {
            const params = new URLSearchParams({ q: query, limit: String(limit || 10) });
            if (category) params.append("category", category);

            const response = await fetch(
                `${TRUST_DIRECTORY_URL}/api/v1/ans/search?${params}`
            );

            if (!response.ok) {
                return {
                    content: [{ type: "text" as const, text: `Search failed: ${response.statusText}` }],
                    isError: true
                };
            }

            const data = await response.json() as { results: any[]; count: number; search_type: string };

            if (data.results.length === 0) {
                return {
                    content: [{
                        type: "text" as const,
                        text: `No agents found for "${query}". Try a different search term.`
                    }]
                };
            }

            const formatted = data.results.map((agent: any, i: number) =>
                `${i + 1}. **${agent.name}** (Trust: ${agent.trust_score}/100)\n` +
                `   ${agent.description}\n` +
                `   Category: ${agent.category || 'General'}\n` +
                `   Capabilities: ${agent.capabilities?.join(', ') || 'N/A'}\n` +
                `   Agent ID: ${agent.agent_id}`
            ).join('\n\n');

            return {
                content: [{
                    type: "text" as const,
                    text: `Found ${data.count} agents for "${query}" (${data.search_type} search):\n\n${formatted}`
                }]
            };
        } catch (error) {
            return {
                content: [{ type: "text" as const, text: `Error searching agents: ${error}` }],
                isError: true
            };
        }
    }
);

/**
 * Tool: get_agent
 * Get detailed information about a specific agent
 */
server.tool(
    "get_agent",
    {
        agent_id: z.string().describe("The unique identifier of the agent (from search results)")
    },
    async ({ agent_id }) => {
        try {
            const response = await fetch(
                `${TRUST_DIRECTORY_URL}/api/v1/agents/${agent_id}`
            );

            if (!response.ok) {
                if (response.status === 404) {
                    return {
                        content: [{ type: "text" as const, text: `Agent "${agent_id}" not found.` }],
                        isError: true
                    };
                }
                return {
                    content: [{ type: "text" as const, text: `Failed to get agent: ${response.statusText}` }],
                    isError: true
                };
            }

            const agent = await response.json() as { agent_id: string; status: string; endpoint?: string; metadata?: any };
            const metadata = agent.metadata || {};

            const info = [
                `# ${metadata.name || agent.agent_id}`,
                '',
                `**Status:** ${agent.status}`,
                `**Description:** ${metadata.description || 'No description'}`,
                `**Category:** ${metadata.category || 'General'}`,
                `**Endpoint:** ${agent.endpoint || 'Not specified'}`,
                '',
                '## Capabilities',
                ...(metadata.capabilities || []).map((c: string) => `- ${c}`),
                '',
                '## Integration',
                'To interact with this agent, use the Amorce SDK:',
                '```javascript',
                `const response = await client.transact('${agent_id}', { your_payload });`,
                '```'
            ].join('\n');

            return { content: [{ type: "text" as const, text: info }] };
        } catch (error) {
            return {
                content: [{ type: "text" as const, text: `Error getting agent: ${error}` }],
                isError: true
            };
        }
    }
);

/**
 * Tool: get_agent_manifest
 * Get the A2A-compatible manifest for an agent
 */
server.tool(
    "get_agent_manifest",
    {
        agent_id: z.string().describe("The unique identifier of the agent")
    },
    async ({ agent_id }) => {
        try {
            const response = await fetch(
                `${TRUST_DIRECTORY_URL}/api/v1/agents/${agent_id}/manifest`
            );

            if (!response.ok) {
                return {
                    content: [{ type: "text" as const, text: `Failed to get manifest: ${response.statusText}` }],
                    isError: true
                };
            }

            const manifest = await response.json() as { name: string };

            return {
                content: [{
                    type: "text" as const,
                    text: `A2A Manifest for ${manifest.name}:\n\n\`\`\`json\n${JSON.stringify(manifest, null, 2)}\n\`\`\``
                }]
            };
        } catch (error) {
            return {
                content: [{ type: "text" as const, text: `Error getting manifest: ${error}` }],
                isError: true
            };
        }
    }
);

// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Amorce MCP Server started");
}

main().catch(console.error);
