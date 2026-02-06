import "dotenv/config";
import {
  Agent,
  RunContext,
  Tool,
  run,
  tool,
  connectMcpServers,
} from "@openai/agents";
import { z } from "zod";
import { appendFileSync, writeFileSync } from "fs";
import { createBrowserAgent, createPlaywrightMcpServer } from "./browserAgent";
import { createValidationTool, createValidatorAgent } from "./validationTool";
import {
  formatUsd,
  summarizeUsage,
  type RunUsageSummary,
} from "./runMetrics";

const prompt = `
انتقل إلى موقع https://www.amazon.sa/?language=ar_AE وأضف هاتف سامسونج جالاكسي S25 إلى سلة التسوق.
`.trim();

const orchestratorPrompt = `
You are an orchestrator agent responsible for managing shopping automation tasks.

Your role is to:
1. Understand user requests for online shopping tasks
2. Delegate browser automation work to the browser agent tool
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
- Call the browser agent tool with the instruction:
  "On the CURRENT product page you're already viewing, extract ALL product details visible on THIS page: model name, storage capacity, RAM, price, seller name, condition (new/used/refurbished), color, operating system, and any other specifications. DO NOT navigate away, DO NOT open new tabs, DO NOT add to cart - just read and report the details from the page you're on."
- Wait for the browser agent tool to return the full product specification summary

ACTION 2: Validate Against Purchase Policies
- Call the validate_user_action tool with:
  {
    "json_file_path": "purchase-rules.json",
    "user_action": "Product found: [complete product details from browser agent]",
    "context": "Pre-purchase validation check"
  }
- Review the validation response carefully

ACTION 3: Make Decision Based on Validation
- If validation returns "VALID": Proceed to instruct browser agent tool to add product to cart
- If validation returns "INVALID": STOP immediately, do NOT add to cart, report violations to user

**Example:**
- Browser navigation happens (search, find product, etc.)
- Before adding to cart: Extract details → Validate → Then add if valid
- If invalid: Explain violations and stop

The validation steps are NOT the overall workflow - they are REQUIRED GATES before the add-to-cart action.

Keep your responses clear and concise. NEVER ask the user questions - make decisions autonomously.
`.trim();

type RunStats = {
  subRuns: RunUsageSummary[];
};

function recordSubRun(stats: RunStats, summary: RunUsageSummary) {
  stats.subRuns.push(summary);
}

function logRunResult(logFile: string, label: string, summary: RunUsageSummary) {
  appendFileSync(
    logFile,
    [
      "",
      `--- ${label} ---`,
      JSON.stringify(summary, null, 2),
      "",
    ].join("\n"),
  );
}

async function main() {
  const startTime = Date.now();
  const logFile = "conversation.log";
  const stats: RunStats = { subRuns: [] };

  writeFileSync(
    logFile,
    `=== Conversation Log - ${new Date().toISOString()} ===\n`,
  );

  const mcpServer = createPlaywrightMcpServer();
  let mcpServers: Awaited<ReturnType<typeof connectMcpServers>> | null = null;

  try {
    mcpServers = await connectMcpServers([mcpServer], {
      connectInParallel: true,
    });
    const browserAgent = createBrowserAgent(mcpServers.active);
    const validatorAgent = createValidatorAgent("gpt-5.2");

    const browserTool = tool({
      name: "browser_agent",
      description:
        "Runs the browser automation agent to navigate sites and perform shopping actions.",
      parameters: z.object({
        input: z
          .string()
          .describe("Instruction for the browser agent to execute"),
      }),
      execute: async ({ input }) => {
        const result = await run(browserAgent, input, {
          maxTurns: 50,
          stream: true,
        });

        for await (const event of result) {
          if (event.type === "run_item_stream_event") {
            console.log(`[browser][run-item] ${event.name}`);
          } else if (event.type === "agent_updated_stream_event") {
            console.log(`[browser][agent] ${event.agent.name}`);
          } else if (event.type === "raw_model_stream_event") {
            const data: any = event.data;
            if (data?.type === "output_text_delta") {
              const delta = typeof data.delta === "string" ? data.delta : "";
              const preview =
                delta.length > 120 ? `${delta.slice(0, 120)}...` : delta;
              console.log(`[browser][raw] output_text_delta: ${preview}`);
            } else if (data?.type) {
              console.log(`[browser][raw] ${data.type}`);
            } else {
              console.log("[browser][raw] model stream event");
            }
          }
        }

        await result.completed;
        const summary = summarizeUsage(
          "browser",
          browserAgent.model ?? "unknown",
          result.state.usage,
        );
        recordSubRun(stats, summary);
        logRunResult(logFile, "Browser Agent", summary);
        return result.finalOutput ?? "No output from browser agent.";
      },
    });

    const validationTool = createValidationTool({
      validatorAgent,
      recordSubRun: (summary) => {
        recordSubRun(stats, summary);
        logRunResult(logFile, "Validator", summary);
      },
      label: "validator",
    });

    const orchestrator = new Agent({
      name: "Shopping Orchestrator",
      instructions: orchestratorPrompt,
      model: "gpt-5.2",
      tools: [browserTool, validationTool],
    });

    orchestrator.on("agent_start", (_ctx: RunContext) => {
      console.log("[hook] agent_start");
    });
    orchestrator.on("agent_end", (_ctx: RunContext, output: string) => {
      console.log(`[hook] agent_end: ${output}`);
    });
    orchestrator.on(
      "agent_handoff",
      (_ctx: RunContext, nextAgent: Agent) => {
        console.log(`[hook] agent_handoff -> ${nextAgent.name}`);
      },
    );
    orchestrator.on(
      "agent_tool_start",
      (_ctx: RunContext, tool: Tool, details) => {
        const toolCallName =
          "toolCall" in details && details.toolCall && "name" in details.toolCall
            ? details.toolCall.name
            : "unknown";
        console.log(`[hook] tool_start: ${tool.name} (${toolCallName})`);
      },
    );
    orchestrator.on(
      "agent_tool_end",
      (_ctx: RunContext, tool: Tool, _result: string, details) => {
        const toolCallName =
          "toolCall" in details && details.toolCall && "name" in details.toolCall
            ? details.toolCall.name
            : "unknown";
        console.log(`[hook] tool_end: ${tool.name} (${toolCallName})`);
      },
    );

    const result = await run(orchestrator, prompt, {
      maxTurns: 40,
      stream: true,
    });

    for await (const event of result) {
      if (event.type === "run_item_stream_event") {
        console.log(`[run-item] ${event.name}`);
      } else if (event.type === "agent_updated_stream_event") {
        console.log(`[agent] ${event.agent.name}`);
      } else if (event.type === "raw_model_stream_event") {
        const data: any = event.data;
        if (data?.type === "output_text_delta") {
          const delta = typeof data.delta === "string" ? data.delta : "";
          const preview = delta.length > 120 ? `${delta.slice(0, 120)}...` : delta;
          console.log(`[raw] output_text_delta: ${preview}`);
        } else if (data?.type) {
          console.log(`[raw] ${data.type}`);
        } else {
          console.log("[raw] model stream event");
        }
      }
    }

    await result.completed;
    const rootSummary = summarizeUsage(
      "orchestrator",
      orchestrator.model ?? "unknown",
      result.state.usage,
    );

    logRunResult(logFile, "Orchestrator", rootSummary);

    console.log(result.finalOutput ?? "No final output.");

    const allSummaries = [rootSummary, ...stats.subRuns];
    const totalRequests = allSummaries.reduce(
      (sum, item) => sum + item.requests,
      0,
    );
    const totalInputTokens = allSummaries.reduce(
      (sum, item) => sum + item.inputTokens,
      0,
    );
    const totalOutputTokens = allSummaries.reduce(
      (sum, item) => sum + item.outputTokens,
      0,
    );
    const totalTokens = allSummaries.reduce(
      (sum, item) => sum + item.totalTokens,
      0,
    );
    const totalCostUsd = allSummaries.some(
      (item) => item.estimatedCostUsd === null,
    )
      ? null
      : allSummaries.reduce(
          (sum, item) => sum + (item.estimatedCostUsd ?? 0),
          0,
        );

    console.log("\n=== Run Summary ===");
    for (const summary of allSummaries) {
      console.log(
        `- ${summary.label} (${summary.model}): ${summary.requests} iterations, ${summary.inputTokens} input tokens (${summary.cachedInputTokens} cached), ${summary.outputTokens} output tokens, cost ${formatUsd(summary.estimatedCostUsd)}`,
      );
    }
    console.log(
      `Total iterations (root + sub-agents): ${totalRequests}`,
    );
    console.log(
      `Total tokens: ${totalTokens} (input ${totalInputTokens}, output ${totalOutputTokens})`,
    );
    console.log(`Total estimated cost: ${formatUsd(totalCostUsd)}`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Duration: ${elapsed}s`);
  } finally {
    if (mcpServers) {
      await mcpServers.close();
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
