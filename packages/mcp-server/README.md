# @amorce/mcp-server

MCP Server for Amorce Agent Discovery. Enables Claude and other MCP-compatible LLMs to find specialized AI agents.

## Installation

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "amorce": {
      "command": "npx",
      "args": ["@amorce/mcp-server"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add amorce -- npx @amorce/mcp-server
```

## Tools

### search_agents

Find AI agents by capability using semantic search.

**Example prompts:**
- "Find an agent that can book flights to Paris"
- "Search for currency exchange agents"
- "What agents can help with weather forecasts?"

### get_agent

Get detailed information about a specific agent.

### get_agent_manifest

Get the A2A (Agent-to-Agent) protocol manifest for an agent.

## Example Usage

Once installed, ask Claude:

> "Use Amorce to find an agent that can help me book a restaurant reservation"

Claude will use the `search_agents` tool to find relevant agents in the Amorce Trust Directory.

## Links

- [Amorce Documentation](https://amorce.io/docs)
- [Trust Directory](https://amorce.io/registry)
- [GitHub](https://github.com/trebortGolin/amorce-js-sdk)
