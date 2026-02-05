import { readFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const validateUserActionTool = {
  name: "validate_user_action",
  description:
    "Validates a user action against expected behavior defined in a JSON file. Reads the JSON file and uses an LLM to analyze whether the action matches expectations.",
  input_schema: {
    type: "object",
    properties: {
      json_file_path: {
        type: "string",
        description:
          "Path to the JSON file containing validation rules or expected actions",
      },
      user_action: {
        type: "string",
        description: "Description of the user action to validate",
      },
      context: {
        type: "string",
        description:
          "Additional context about the current state or situation (optional)",
      },
    },
    required: ["json_file_path", "user_action"],
  },
  handler: async (input: any) => {
    try {
      // Read the JSON file
      const jsonContent = readFileSync(input.json_file_path, "utf-8");
      const validationData = JSON.parse(jsonContent);

      // Prepare validation prompt
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

      // Call LLM for validation
      const message = await client.messages.create({
        model: "haiku" as const,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: validationPrompt,
          },
        ],
      });

      const responseText =
        message.content[0].type === "text" ? message.content[0].text : "";

      // Try to parse JSON response
      let validationResult;
      try {
        validationResult = JSON.parse(responseText);
      } catch {
        // If not JSON, return raw response
        validationResult = {
          status: "UNKNOWN",
          reasoning: responseText,
        };
      }

      return {
        validation_result: validationResult,
        json_file_used: input.json_file_path,
        tokens_used: {
          input: message.usage.input_tokens,
          output: message.usage.output_tokens,
        },
      };
    } catch (error: any) {
      return {
        error: `Validation failed: ${error.message || String(error)}`,
      };
    }
  },
};
