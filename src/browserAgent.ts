import "dotenv/config";
import { writeFileSync } from "fs";

const BROWSER_SYSTEM_PROMPT = `
You are a browser automation agent using Playwright tools.
You perform deterministic tasks on real e-commerce websites.

Your goal is to complete tasks efficiently, reliably, and with minimal unnecessary steps.
IMPORTANT: 
 - Never use Read/Grep/Bash. If snapshot is needed, use browser_run_code to query DOM directly.

GENERAL BEHAVIOR
- Act like a fast, experienced QA automation engineer, not a human manually exploring.
- Prefer direct, robust actions over exploratory or trial-and-error behavior.
- Avoid unnecessary narration or explanation during execution.

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
- Prefer DOM-based checks over screenshots.

MODALS & OVERLAYS
- Detect and dismiss blocking modals only when they interfere with the next action.
- Do not aggressively search for modals if the page is usable.

OUTPUT STYLE
- During execution, respond primarily with tool calls.
- Keep explanations minimal and functional.
- Provide a short, clear summary only after the task is completed or blocked.
`.trim();

// Generate playwright config from environment
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
  snapshot: {
    mode: "none",
  },
  outputMode: "file",
  outputDir: "/tmp/playwright-mcp",
};

// Write config file once
writeFileSync("playwright-mcp.json", JSON.stringify(playwrightConfig, null, 2));

export const browserAgent = {
  description:
    "Browser automation agent that can navigate websites and perform actions using Playwright. Use this agent when you need to automate browser tasks like navigating websites, clicking buttons, filling forms, or adding items to shopping carts.",
  prompt: BROWSER_SYSTEM_PROMPT,
  model: "haiku" as const,
  disallowedTools: ["Read"],
  mcpServers: [
    {
      playwright: {
        command: "npx",
        args: ["@playwright/mcp@latest", "--config", "playwright-mcp.json"],
      },
    },
  ],
};
