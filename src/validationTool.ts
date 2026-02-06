import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";
import { readFileSync } from "fs";
import { summarizeUsage, type RunUsageSummary } from "./runMetrics";

const validationOutputSchema = z.object({
  status: z.enum(["VALID", "INVALID"]),
  reasoning: z.string(),
  suggestions: z.string().optional(),
});

export type ValidationResult = z.infer<typeof validationOutputSchema>;

export function createValidatorAgent(model: string) {
  return new Agent({
    name: "Purchase Validator",
    instructions: [
      "You validate a proposed shopping action against the provided rules.",
      "Return only the JSON object that matches the schema.",
      "If the action violates any rule, mark INVALID and explain why.",
      "If it complies, mark VALID and briefly explain.",
    ].join("\n"),
    model,
    outputType: validationOutputSchema,
  });
}

type ValidationToolOptions = {
  validatorAgent: Agent<any, any>;
  recordSubRun: (summary: RunUsageSummary) => void;
  label?: string;
};

export function createValidationTool({
  validatorAgent,
  recordSubRun,
  label = "validator",
}: ValidationToolOptions) {
  return tool({
    name: "validate_user_action",
    description:
      "Validates a user action against expected behavior defined in a JSON file. Reads the JSON file and uses a model to analyze whether the action matches expectations.",
    parameters: z.object({
      json_file_path: z
        .string()
        .describe(
          "Path to the JSON file containing validation rules or expected actions",
        ),
      user_action: z
        .string()
        .describe("Description of the user action to validate"),
      context: z
        .string()
        .describe("Additional context about the current state or situation"),
    }),
    execute: async ({ json_file_path, user_action, context }) => {
      try {
        const jsonContent = readFileSync(json_file_path, "utf-8");
        const validationData = JSON.parse(jsonContent);

        const validationPrompt = [
          "Validation Rules/Expected Behavior:",
          JSON.stringify(validationData, null, 2),
          "",
          "User Action:",
          user_action,
          "",
          context ? `Additional Context:\n${context}` : "",
          "",
          "Return JSON only.",
        ]
          .filter(Boolean)
          .join("\n");

        const result = await run(validatorAgent, validationPrompt);
        recordSubRun(
          summarizeUsage(
            label,
            validatorAgent.model ?? "unknown",
            result.state.usage,
          ),
        );

        return {
          validation_result: result.finalOutput,
          json_file_used: json_file_path,
          tokens_used: {
            input: result.state.usage.inputTokens,
            output: result.state.usage.outputTokens,
          },
        };
      } catch (error: any) {
        return {
          error: `Validation failed: ${error?.message || String(error)}`,
        };
      }
    },
  });
}
