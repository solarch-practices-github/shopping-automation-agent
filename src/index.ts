import "dotenv/config";
import {
  AgentTool,
  FunctionTool,
  Gemini,
  InMemoryMemoryService,
  InMemorySessionService,
  LlmAgent,
  Runner,
} from "@google/adk";
import { Content } from "@google/genai";
import { appendFileSync, readFileSync, writeFileSync } from "fs";
import { z } from "zod";
import { browserAgent } from "./browserAgent";
import { fileURLToPath } from "url";
import { resolve } from "path";

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

const validatorModel = new Gemini({ model: "gemini-2.5-flash" });

const validateUserActionTool = new FunctionTool({
  name: "validate_user_action",
  description:
    "Validates a user action against expected behavior defined in a JSON file.",
  parameters: z.object({
    json_file_path: z.string(),
    user_action: z.string(),
    context: z.string().optional(),
  }),
  execute: async (input) => {
    try {
      const jsonContent = readFileSync(input.json_file_path, "utf-8");
      const validationData = JSON.parse(jsonContent);

      const validationPrompt = `
You are a validation assistant. Analyze whether the user action matches the expected behavior.

**Validation Rules/Expected Behavior:**
${JSON.stringify(validationData, null, 2)}

**User Action:**
${input.user_action}

${input.context ? `**Additional Context:**\n${input.context}` : ""}

**Task:**
Validate whether the user action:
1. Matches the expected behavior
2. Follows the rules defined in the validation data
3. Is appropriate given the context

Respond with:
- "VALID" if the action matches expectations
- "INVALID" if the action doesn't match
- Brief explanation of your reasoning

Format your response as JSON:
{
  "status": "VALID" or "INVALID",
  "reasoning": "explanation here",
  "suggestions": "optional suggestions if invalid"
}
`.trim();

      const llmRequest = {
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [{ text: validationPrompt }],
          },
        ],
        config: {
          responseMimeType: "application/json",
        },
        liveConnectConfig: {},
        toolsDict: {},
      };

      let responseText = "";
      let usageMetadata: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      } | null = null;

      for await (const chunk of validatorModel.generateContentAsync(llmRequest)) {
        if (chunk.content?.parts) {
          responseText += chunk.content.parts
            .map((part) => part.text ?? "")
            .join("");
        }
        if (chunk.usageMetadata) {
          usageMetadata = chunk.usageMetadata;
        }
      }

      const trimmedResponse = responseText.trim();
      let validationResult;
      try {
        validationResult = JSON.parse(trimmedResponse);
      } catch {
        validationResult = {
          status: "UNKNOWN",
          reasoning: trimmedResponse,
        };
      }

      return {
        validation_result: validationResult,
        json_file_used: input.json_file_path,
        tokens_used: usageMetadata
          ? {
              input: usageMetadata.promptTokenCount ?? 0,
              output: usageMetadata.candidatesTokenCount ?? 0,
              total: usageMetadata.totalTokenCount ?? 0,
            }
          : undefined,
      };
    } catch (error: any) {
      return {
        error: `Validation failed: ${error.message || String(error)}`,
      };
    }
  },
});

export const rootAgent = new LlmAgent({
  name: "orchestrator",
  description:
    "Orchestrator agent that coordinates shopping automation and policy validation.",
  model: "gemini-2.5-flash",
  instruction: orchestratorPrompt,
  tools: [new AgentTool({ agent: browserAgent }), validateUserActionTool],
});

async function runDemo(): Promise<void> {
  const prompt = `
انتقل إلى موقع https://www.amazon.sa/?language=ar_AE وأضف هاتف سامسونج جالاكسي S25 إلى سلة التسوق.
`.trim();

  const startTime = Date.now();
  const logFile = "conversation.log";
  const sessionService = new InMemorySessionService();
  const memoryService = new InMemoryMemoryService();
  const runner = new Runner({
    appName: rootAgent.name,
    agent: rootAgent,
    sessionService,
    memoryService,
  });

  writeFileSync(
    logFile,
    `=== Conversation Log - ${new Date().toISOString()} ===\n\n`,
  );

  const session = await sessionService.createSession({
    appName: rootAgent.name,
    userId: "local_user",
  });

  const newMessage: Content = {
    role: "user",
    parts: [{ text: prompt }],
  };

  for await (const event of runner.runAsync({
    userId: session.userId,
    sessionId: session.id,
    newMessage,
  })) {
    appendFileSync(logFile, `\n--- Event ---\n`);
    appendFileSync(logFile, JSON.stringify(event, null, 2) + "\n");

    if (event.content?.parts?.length) {
      const text = event.content.parts
        .map((part) => part.text ?? "")
        .join("")
        .trim();
      if (text) {
        console.log(`\n💭 ${text}\n`);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDuration: ${elapsed}s`);
}

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  runDemo().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
