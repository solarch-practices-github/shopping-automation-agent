import "dotenv/config";
import {
  Agent,
  MCPServerSSE,
  MCPServerStdio,
  tool,
  type MCPServer,
} from "@openai/agents";
import { writeFileSync } from "fs";

const BROWSER_SYSTEM_PROMPT = `
You are a browser automation agent using Playwright tools.
You perform deterministic tasks on real e-commerce websites.

Your goal is to complete tasks efficiently, reliably, and with minimal unnecessary steps.
IMPORTANT:
 - When asked to extract product details, DO NOT add to cart yet - just gather information
 - AUTONOMOUS OPERATION: Make ALL decisions automatically, NEVER ask orchestrator or user for choices
 - When multiple options exist (colors, storage, etc.), pick the FIRST one that appears suitable
 - Be decisive and complete tasks without seeking confirmation

GENERAL BEHAVIOR
- Act like a fast, experienced QA automation engineer, not a human manually exploring.
- Prefer direct, robust actions over exploratory or trial-and-error behavior.
- Avoid unnecessary narration or explanation during execution.
- Make autonomous decisions - never ask which option to choose

PRODUCT INFORMATION EXTRACTION
- When asked to extract details from the CURRENT product page:
  * DO NOT navigate away or open new tabs
  * Stay on the current product page you're already viewing
  * DO NOT click add to cart button yet
- When explicitly asked to add to cart AFTER validation:
  * Click the add to cart button
  * Handle any popups/confirmations
  * Verify cart updated

PAGE LOADING & STATE
- Always ensure the page is ready before interacting.
- Treat navigation events and major page changes as state boundaries.
- Only re-inspect the page when the state has clearly changed or required elements are missing.

OBSERVATION STRATEGY
- Do NOT repeatedly inspect the page if the required element is already known.
- Prefer acting based on existing knowledge rather than re-reading the page.
- When inspection is needed, focus only on elements relevant to the current step
  (search input, product link, add-to-cart button, modal close, cart access).

INTERACTION STRATEGY
- Prefer single, well-targeted actions over multiple small attempts.
- If an interaction might fail due to visibility or overlays, scroll into view first.
- If an action fails once, try one alternative approach, then reassess the page state.

MACRO ACTIONS
- When a sequence is stable and obvious, combine it into one logical step
  (e.g. find search input → type query → submit).
- Use browser_run_code when it can reduce multiple interactions into one safe operation.

VERIFICATION
- Never assume an action succeeded.
- Verify important outcomes using page state:
  - confirmation messages
  - cart count changes
  - presence of the expected product

MODALS & OVERLAYS
- Detect and dismiss blocking modals only when they interfere with the next action.
- Do not aggressively search for modals if the page is usable.

OUTPUT STYLE
- During execution, respond primarily with tool calls.
- Keep explanations minimal and functional.
- Provide a short, clear summary only after the task is completed or blocked.
`.trim();

const MAX_SNAPSHOT_CHARS = 10_000;
const SNAPSHOT_INSTRUCTIONS = [
  "Snapshot too large and stored in memory.",
  "Use the `grep` tool to search it.",
  "Provide a snapshot id and a list of substring queries.",
  "Queries are plain text (no regex).",
  "You can call `grep` multiple times to refine.",
].join(" ");
const snapshotStore = new Map<string, string>();
let snapshotCounter = 0;

export function createPlaywrightMcpServer() {
  class TruncatingMCPServerSSE extends MCPServerSSE {
    async callTool(toolName: string, args: unknown, meta?: unknown) {
      const argKeys =
        args && typeof args === "object"
          ? Object.keys(args as Record<string, unknown>)
          : [];
      console.log(
        `[mcp] tool_call name=${toolName} argsKeys=${argKeys.join(",")}`,
      );
      const content = await super.callTool(toolName, args as any, meta as any);
      const contentCount = Array.isArray(content) ? content.length : 1;
      const contentTypes = Array.isArray(content)
        ? content.map((item) => (item && item.type ? item.type : typeof item))
        : [typeof content];
      console.log(
        `[mcp] tool_result name=${toolName} items=${contentCount} types=${contentTypes.join(",")}`,
      );
      let text = "";
      if (content.length > 0 && content[0].type === "text") {
        text = content[0].text;
      }
      if (!text) {
        return content;
      }

      if (text.length <= MAX_SNAPSHOT_CHARS) {
        return content as any;
      }

      snapshotCounter += 1;
      const snapshotId = `S${snapshotCounter}`;
      snapshotStore.set(snapshotId, text);

      const message = `${SNAPSHOT_INSTRUCTIONS} Snapshot id: ${snapshotId}.`;
      return [{ type: "text", text: message }];
    }
  }

  const chromeExecutable =
    process.env.CHROME_EXECUTABLE_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

  const playwrightConfig = {
    browser: {
      isolated: false,
      launchOptions: {
        channel: "chrome",
        headless: false,
        executablePath: chromeExecutable,
      },
      contextOptions: {
        viewport: { width: 1200, height: 1100 },
        timeout: 15000,
      },
    },
    interaction: {
      maxActions: 50,
      maxNavigationDepth: 10,
      requireVisibleElement: true,
      clickTimeoutMs: 5000,
      typeDelayMs: 30,
    },
    outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || "/tmp/playwright-mcp",
  };

  writeFileSync(
    "playwright-mcp.json",
    JSON.stringify(playwrightConfig, null, 2),
  );

  const allowedBrowserTools = new Set([
    "browser_close",
    "browser_handle_dialog",
    "browser_fill_form",
    "browser_press_key",
    "browser_type",
    "browser_navigate",
    "browser_navigate_back",
    "browser_snapshot",
    "browser_click",
    "browser_drag",
    "browser_hover",
    "browser_select_option",
    "browser_wait_for",
  ]);

  return new TruncatingMCPServerSSE({
    name: "playwright",
    url: "http://localhost:8931/sse",
    cacheToolsList: true,
    toolFilter: (_context, tool) =>
      Promise.resolve(allowedBrowserTools.has(tool.name)),
  });

  // STDIO option (kept for later use)
  // return new MCPServerStdio({
  //   name: "playwright",
  //   command: "npx",
  //   args: ["@playwright/mcp@v0.0.64", "--config", "playwright-mcp.json"],
  // });
}

export function createBrowserAgent(mcpServers: MCPServer[]) {
  const grepTool = tool({
    name: "grep",
    description:
      "Search a stored browser_snapshot by snapshot id using substring queries.",
    parameters: {
      type: "object",
      properties: {
        snapshot_id: {
          type: "string",
          description: "Snapshot id like S1, S2, etc.",
        },
        queries: {
          type: "array",
          items: { type: "string" },
          description:
            'List of plain-text queries. Example: ["Add to Cart", "Buy Now"].',
        },
      },
      required: ["snapshot_id", "queries"],
      additionalProperties: false,
    },
    strict: true,
    execute: async (input) => {
      if (!input || typeof input !== "object") {
        return "Invalid input: expected object with snapshot_id and queries.";
      }
      const { snapshot_id, queries } = input as {
        snapshot_id?: string;
        queries?: string[];
      };
      if (typeof snapshot_id !== "string" || !Array.isArray(queries)) {
        return "Invalid input: snapshot_id must be string and queries must be array.";
      }
      const cleanedQueries = queries
        .filter((q) => typeof q === "string")
        .map((q) => q.trim())
        .filter((q) => q.length > 0);
      if (cleanedQueries.length === 0) {
        return "Invalid input: queries must include at least one non-empty string.";
      }
      console.log(
        `[grep] snapshot_id=${snapshot_id} queries=${cleanedQueries.join("|")}`,
      );
      const data = snapshotStore.get(snapshot_id);
      if (!data) {
        return `Snapshot not found: ${snapshot_id}`;
      }

      const results: string[] = [];
      const maxResults = 50;
      const contextLines = 5;
      const lines = data.split("\n");
      const added = new Set<number>();
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (!cleanedQueries.some((q) => line.includes(q))) continue;

        const start = Math.max(0, i - contextLines);
        const end = Math.min(lines.length - 1, i + contextLines);

        if (results.length > 0) results.push("...");
        for (let j = start; j <= end; j += 1) {
          if (added.has(j)) continue;
          results.push(`${j + 1}: ${lines[j]}`);
          added.add(j);
          if (results.length >= maxResults) break;
        }
        if (results.length >= maxResults) break;
      }

      if (results.length === 0) {
        return "No matches. Try different queries.";
      }
      return results.join("\n");
    },
  });

  return new Agent({
    name: "Browser Agent",
    instructions: BROWSER_SYSTEM_PROMPT,
    model: "gpt-5-mini",
    mcpServers,
    tools: [grepTool],
  });
}
