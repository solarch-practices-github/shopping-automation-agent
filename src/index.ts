import "dotenv/config";
import { stepCountIs, ToolLoopAgent } from "ai";
import { createGateway } from "@ai-sdk/gateway";
import { createPlaywrightMcpToolset } from "./playwright-mcp-tool";
import { prompt, systemPrompt } from "./prompts";

async function main() {
  const startTime = Date.now();

  const { tools, close } = await createPlaywrightMcpToolset();
  const gateway = createGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY,
    baseURL: "https://ai-gateway.vercel.sh/v1/ai",
  });

  const browserAgent = new ToolLoopAgent({
    model: gateway("google/gemini-2.5-flash"),
    instructions: systemPrompt,
    tools,
  });

  try {
    console.log("=== Starting Agent Execution ===\n");
    console.log("Prompt:", prompt);
    console.log("\n");

    const result = await browserAgent.generate({
      prompt,
      stopWhen: stepCountIs(40),
    });

    const endTime = Date.now();
    const durationSeconds = (endTime - startTime) / 1000;

    console.log("\n=== Agent Execution Complete ===\n");

    // TODO: fix logs
    console.log("--- Final Result ---");
    console.log(
      "steps:",
      result.steps?.map((s: any) => ({
        finishReason: s.finishReason,
        toolCalls: s.toolCalls?.map((tc: any) => tc.toolName),
      })),
    );
    console.log("\n");

    console.log("--- Usage Statistics ---");
    console.log(`Input tokens: ${result.totalUsage.inputTokens}`);
    console.log(`Output tokens: ${result.totalUsage.outputTokens}`);
    console.log("\n");

    // const inputCost =
    //   ((result.totalUsage.inputTokens as number) / 1_000_000) * 3;
    // const outputCost =
    //   ((result.totalUsage.outputTokens as number) / 1_000_000) * 15;
    // const totalCost = inputCost + outputCost;

    // console.log("--- Cost Breakdown ---");
    // console.log(`Input cost: $${inputCost.toFixed(6)}`);
    // console.log(`Output cost: $${outputCost.toFixed(6)}`);
    // console.log(`Total cost: $${totalCost.toFixed(6)}`);
    // console.log("\n");

    console.log("--- Execution Time ---");
    console.log(`Duration: ${durationSeconds.toFixed(2)} seconds`);
  } catch (error) {
    console.error("\n=== Error Occurred ===");
    console.error("Error details:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    throw error;
  } finally {
    await close();
  }
}

main().catch(console.error);
