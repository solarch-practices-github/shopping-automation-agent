import type { Model, Usage } from "@openai/agents";

type PricePer1M = {
  input: number;
  cachedInput?: number;
  output: number;
};

const MODEL_PRICING_PER_1M: Record<string, PricePer1M> = {
  "gpt-5.2": { input: 1.75, cachedInput: 0.175, output: 1400 },
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2 },
};

export type RunUsageSummary = {
  label: string;
  model: string;
  requests: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
};

export function countRequests(usage: Usage): number {
  if (usage.requests && usage.requests > 0) {
    return usage.requests;
  }
  return usage.requestUsageEntries?.length ?? 0;
}

export function resolveModelName(model: string | Model | undefined): string {
  if (!model) {
    return "unknown";
  }
  if (typeof model === "string") {
    return model;
  }
  const candidate =
    (model as any).modelName || (model as any).name || (model as any).id;
  return typeof candidate === "string" ? candidate : "unknown";
}

export function estimateRunCostUsd(
  usage: Usage,
  model: string | Model | undefined,
): number | null {
  const modelName = resolveModelName(model);
  const pricing = MODEL_PRICING_PER_1M[modelName];
  if (!pricing) {
    return null;
  }
  const cachedInputTokens = extractCachedInputTokens(usage);
  const billableInputTokens = Math.max(
    usage.inputTokens - cachedInputTokens,
    0,
  );
  const inputCost = (billableInputTokens / 1_000_000) * pricing.input;
  const cachedInputCost = pricing.cachedInput
    ? (cachedInputTokens / 1_000_000) * pricing.cachedInput
    : 0;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;
  return inputCost + cachedInputCost + outputCost;
}

export function summarizeUsage(
  label: string,
  model: string | Model | undefined,
  usage: Usage,
): RunUsageSummary {
  const modelName = resolveModelName(model);
  const estimatedCostUsd = estimateRunCostUsd(usage, modelName);
  return {
    label,
    model: modelName,
    requests: countRequests(usage),
    inputTokens: usage.inputTokens,
    cachedInputTokens: extractCachedInputTokens(usage),
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    estimatedCostUsd,
  };
}

export function formatUsd(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "unknown";
  }
  return `$${value.toFixed(6)}`;
}

function extractCachedInputTokens(usage: Usage): number {
  const details = usage.inputTokensDetails || [];
  let cached = 0;
  for (const entry of details) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const value =
      (entry as Record<string, number>).cached_input_tokens ??
      (entry as Record<string, number>).cached_tokens ??
      (entry as Record<string, number>).cache_read_input_tokens ??
      0;
    if (typeof value === "number" && Number.isFinite(value)) {
      cached += value;
    }
  }
  return cached;
}
