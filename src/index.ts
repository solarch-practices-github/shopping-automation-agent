import "dotenv/config";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { browserAgent } from "./browserAgent";
import { writeFileSync, appendFileSync } from "fs";

const prompt = `
انتقل إلى موقع amazon.sa وأضف هاتف سامسونج جالاكسي S25 إلى سلة التسوق.
`.trim();

const orchestratorPrompt = `
You are an orchestrator agent responsible for managing shopping automation tasks.

Your role is to:
1. Understand user requests for online shopping tasks
2. Delegate browser automation work to the browser agent
3. VALIDATE products against purchase policies before completing purchase
4. Coordinate multiple steps if needed
5. Report results back to the user

**IMPORTANT: AUTONOMOUS OPERATION**
- Make ALL decisions automatically based on purchase policies
- NEVER ask the user questions about preferences or choices
- Pick the first suitable option that meets all requirements
- Be decisive and autonomous in your actions

**CRITICAL: MANDATORY ACTIONS BEFORE ADDING ANY PRODUCT TO CART**

When you reach the point where you would normally add a product to cart, you MUST STOP and complete these required actions first:

ACTION 1: Extract Complete Product Information
- Tell the browser agent: "On the CURRENT product page you're already viewing, extract ALL product details visible on THIS page: model name, storage capacity, RAM, price, seller name, condition (new/used/refurbished), color, operating system, and any other specifications. DO NOT navigate away, DO NOT open new tabs, DO NOT add to cart - just read and report the details from the page you're on."
- Wait for browser agent to return the full product specification summary

ACTION 2: Validate Against Purchase Policies
- Call the validate_user_action tool with:
  {
    "json_file_path": "purchase-rules.json",
    "user_action": "Product found: [complete product details from browser agent]",
    "context": "Pre-purchase validation check"
  }
- Review the validation response carefully

ACTION 3: Make Decision Based on Validation
- If validation returns "VALID": Proceed to instruct browser agent to add product to cart
- If validation returns "INVALID": STOP immediately, do NOT add to cart, report violations to user

**Example:**
- Browser navigation happens (search, find product, etc.)
- Before adding to cart: Extract details → Validate → Then add if valid
- If invalid: Explain violations and stop

The validation steps are NOT the overall workflow - they are REQUIRED GATES before the add-to-cart action.

Keep your responses clear and concise. NEVER ask the user questions - make decisions autonomously.
`.trim();

async function main() {
  const startTime = Date.now();
  const logFile = "conversation.log";

  // Initialize log file
  writeFileSync(
    logFile,
    `=== Conversation Log - ${new Date().toISOString()} ===\n\n`,
  );

  const conversation = query({
    prompt,
    options: {
      model: "claude-haiku-4-5-20251001",
      systemPrompt: orchestratorPrompt,
      agents: {
        browser: browserAgent,
      },
      plugins: [
        {
          type: "local",
          path: "./validation-plugin",
        },
      ],
      disallowedTools: ["Read"],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: 40,
    },
  });

  for await (const message of conversation) {
    // Log all messages to file
    appendFileSync(logFile, `\n--- Message Type: ${message.type} ---\n`);
    appendFileSync(logFile, JSON.stringify(message, null, 2) + "\n");

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
