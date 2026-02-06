import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { z } from "zod";

export async function createPlaywrightMcpToolset() {
  const transport = new Experimental_StdioMCPTransport({
    command: "npx",
    args: ["@playwright/mcp@latest", "--config", "playwright-mcp.json"],
  });

  const client = await createMCPClient({ transport });

  const tools = await client.tools({
    schemas: {
      browser_navigate: {
        inputSchema: z.object({ url: z.string().url() }),
      },
      browser_snapshot: {
        inputSchema: z.object({}),
      },
      browser_click: {
        inputSchema: z.object({
          ref: z.string(),
          element: z.string().optional(),
          doubleClick: z.boolean().optional(),
          button: z.string().optional(),
          modifiers: z.array(z.string()).optional(),
        }),
      },
      browser_type: {
        inputSchema: z.object({
          ref: z.string(),
          text: z.string(),
          element: z.string().optional(),
        }),
      },
      browser_press_key: {
        inputSchema: z.object({ key: z.string() }),
      },
      browser_wait_for: {
        inputSchema: z.object({
          timeoutMs: z.number().int().min(0).optional(),
        }),
      },
      browser_take_screenshot: {
        inputSchema: z.object({
          type: z.enum(["png", "jpeg"]).default("png"),
          fullPage: z.boolean().optional(),
        }),
      },
    },
  });

  return {
    tools,
    close: () => client.close(),
  };
}
