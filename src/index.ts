import "dotenv/config";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { writeFileSync } from "fs";

const prompt = `
انتقل إلى موقع amazon.sa وأضف هاتف سامسونج جالاكسي S25 إلى سلة التسوق.
`.trim();

const systemPrompt = `
You are a browser automation agent using Playwright tools.
You perform deterministic tasks on real e-commerce websites.

Your goal is to complete tasks efficiently, reliably, and with minimal unnecessary steps.

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

async function main() {
  console.log("Starting shopping automation agent...\n");
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
  };

  writeFileSync(
    "playwright-mcp.json",
    JSON.stringify(playwrightConfig, null, 2),
  );

  const startTime = Date.now();

  const conversation = query({
    prompt,
    options: {
      model: "claude-haiku-4-5-20251001",
      systemPrompt,
      mcpServers: {
        playwright: {
          command: "npx",
          args: ["@playwright/mcp@latest", "--config", "playwright-mcp.json"],
        },
      },
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: 40,
    },
  });

  for await (const message of conversation) {
    switch (message.type) {
      case "system":
        if (message.subtype === "init") {
          console.log(`Session: ${message.session_id}`);
          console.log(`Model: ${message.model}\n`);
        }
        break;

      case "assistant":
        for (const block of message.message.content) {
          if ("text" in block && block.text) {
            console.log(`\n💭 ${block.text}\n`);
          }
          if ("name" in block) {
            const input = JSON.stringify((block as any).input ?? {});
            const truncated =
              input.length > 200 ? input.slice(0, 200) + "..." : input;
            console.log(`🔧 ${block.name}(${truncated})`);
          }
        }
        break;

      case "result":
        console.log("\n" + "=".repeat(60));
        if (message.subtype === "success") {
          console.log("✅ Agent finished successfully");
          console.log(`\nResult: ${message.result}`);
        } else {
          console.log(`❌ Agent stopped: ${message.subtype}`);
          if (message.errors?.length) {
            console.log(`Errors: ${message.errors.join(", ")}`);
          }
        }
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\nDuration: ${elapsed}s`);
        console.log(`Cost: $${message.total_cost_usd.toFixed(4)}`);
        console.log(`\nToken Usage:`);
        console.log(`  Input: ${message.usage.input_tokens}`);
        if (message.usage.cache_creation_input_tokens) {
          console.log(
            `  Cache creation: ${message.usage.cache_creation_input_tokens} (storing context for reuse, costs 25% more)`,
          );
        }
        if (message.usage.cache_read_input_tokens) {
          console.log(
            `  Cache read: ${message.usage.cache_read_input_tokens} (reusing stored context, 90% cheaper)`,
          );
        }
        console.log(`  Output: ${message.usage.output_tokens}`);
        const totalInput =
          message.usage.input_tokens +
          (message.usage.cache_creation_input_tokens || 0) +
          (message.usage.cache_read_input_tokens || 0);
        console.log(`  Total input (including cache): ${totalInput}`);
        console.log(`Turns: ${message.num_turns}`);
        console.log("=".repeat(60));
        break;
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
