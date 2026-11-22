import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { NextRequest } from "next/server";
import { authenticateApiKey, errorResponse } from "@/lib/api";
import { createMcpServer } from "@/lib/mcp";

export const maxDuration = 60;

/**
 * Remote MCP endpoint (Streamable HTTP, stateless). Each request authenticates
 * its own API key and gets a fresh server, so it scales on serverless hosts.
 */
async function handle(req: NextRequest) {
  try {
    // Scopes are applied per tool in createMcpServer (read tools need emails:read, write tools emails:write).
    const key = await authenticateApiKey(req);
    const origin = process.env.BETTER_AUTH_URL ?? req.nextUrl.origin;
    const server = createMcpServer(key, origin);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    return await transport.handleRequest(req);
  } catch (err) {
    return errorResponse(err);
  }
}

export { handle as GET, handle as POST, handle as DELETE };
