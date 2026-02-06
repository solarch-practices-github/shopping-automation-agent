import type { CoreTool } from "ai";

declare module "@ai-sdk/mcp" {
  export type MCPToolSchemas = Record<string, { inputSchema: unknown }>;
  export type MCPToolsResponse = Record<string, CoreTool>;

  export interface MCPClient {
    tools(params: { schemas: MCPToolSchemas }): Promise<MCPToolsResponse>;
    close(): Promise<void>;
  }

  export function createMCPClient(params: {
    transport: unknown;
  }): Promise<MCPClient>;
}

declare module "@ai-sdk/mcp/mcp-stdio" {
  export class Experimental_StdioMCPTransport {
    constructor(params: { command: string; args?: string[] });
  }
}
