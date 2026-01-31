import { query } from "@anthropic-ai/claude-agent-sdk";

// const prompt = `
// Go to amazon.com and add a Samsung Galaxy S25 phone to the cart.
//
// Important:
// - If you encounter any popups or modals, dismiss them
// - If a "Sign in" prompt appears, close or skip it
// - Wait for pages to fully load before interacting
// `.trim();

const prompt = `
انتقل إلى موقع amazon.sa وأضف هاتف سامسونج جالاكسي S25 إلى سلة التسوق.

هام:
- تأكد من أن الموقع باللغة العربية قبل المتابعة.
- في حال ظهور أي نوافذ منبثقة أو مربعات حوار، أغلقها.
- إذا ظهرت لك نافذة "تسجيل الدخول"، أغلقها أو تخطّاها.
- انتظر حتى يتم تحميل الصفحات بالكامل قبل التفاعل معها.
`.trim();

const systemPrompt = `
You are a browser automation agent. You navigate websites using Playwright browser tools.

Key patterns:
- Always switch to Arabic language if possible.
- ALWAYS take a browser snapshot before performing any action so you can see the current page state
- After clicking or navigating, take another snapshot to verify the result
- Use browser_click with element references from snapshots
- If a popup, modal, or overlay appears, dismiss it before continuing
- If the page hasn't loaded yet, use browser_wait_for with 1s delay or take another snapshot after a moment
- Be persistent — if an action fails, try an alternative approach
`.trim();

async function main() {
  console.log("Starting shopping automation agent...\n");
  const startTime = Date.now();

  const conversation = query({
    prompt,
    options: {
      model: "claude-sonnet-4-5-20250929",
      systemPrompt,
      mcpServers: {
        playwright: {
          command: "npx",
          args: [
            "@playwright/mcp@latest",
            "--config",
            "playwright-mcp.json",
          ],
        },
      },
      allowedTools: [
        "mcp__playwright__browser_press_key",
        "mcp__playwright__browser_navigate",
        "mcp__playwright__browser_navigate_back",
        "mcp__playwright__browser_click",
        "mcp__playwright__browser_drag",
        "mcp__playwright__browser_type",
        "mcp__playwright__browser_select_option",
        "mcp__playwright__browser_wait_for",
      ],
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
            const input = JSON.stringify(
              (block as any).input ?? {},
            );
            const truncated =
              input.length > 200
                ? input.slice(0, 200) + "..."
                : input;
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
        console.log(
          `Tokens: ${message.usage.input_tokens} in / ${message.usage.output_tokens} out`,
        );
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
