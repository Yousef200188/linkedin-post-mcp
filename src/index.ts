#!/usr/bin/env node
/**
 * index.ts — LinkedIn Post MCP Server entry point
 *
 * Starts an MCP server over stdio transport, exposing LinkedIn
 * posting capabilities as MCP tools.
 *
 * Usage:
 *   LINKEDIN_CLIENT_ID=xxx LINKEDIN_CLIENT_SECRET=yyy npx linkedin-post-mcp
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOL_DEFINITIONS, handleToolCall } from "./tools.js";

// ─── Server Setup ─────────────────────────────────────────────────────────────

const server = new Server(
  {
    name: "linkedin-post-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ─── List Tools Handler ───────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOL_DEFINITIONS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

// ─── Call Tool Handler ────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await handleToolCall(name, (args ?? {}) as Record<string, unknown>);
    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
    };
  } catch (error) {
    // Distinguish validation errors from unexpected errors
    if (error instanceof Error) {
      // Zod validation errors are user-facing
      if (error.name === "ZodError") {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid parameters: ${error.message}`
        );
      }
      // Auth and API errors are also user-facing
      throw new McpError(ErrorCode.InternalError, error.message);
    }
    throw new McpError(ErrorCode.InternalError, "An unexpected error occurred");
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  // Validate that required env vars are present at startup
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    process.stderr.write(
      "[linkedin-post-mcp] ERROR: LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET " +
        "environment variables are required.\n" +
        "\nSet them in your MCP host config, e.g.:\n" +
        '  "env": { "LINKEDIN_CLIENT_ID": "...", "LINKEDIN_CLIENT_SECRET": "..." }\n'
    );
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write("[linkedin-post-mcp] Server started. Listening on stdio.\n");
}

main().catch((err: unknown) => {
  process.stderr.write(
    `[linkedin-post-mcp] Fatal error: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
