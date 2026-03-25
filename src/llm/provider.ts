import { ChatOpenAI } from "@langchain/openai";

let _model: ChatOpenAI | null = null;

export function getLLM(): ChatOpenAI | null {
  // If no API key configured, return null (signals fallback to keyword/template)
  const apiKey = process.env.OPENAI_API_KEY || process.env.AES_OPENAI_API_KEY;
  if (!apiKey) return null;

  if (!_model) {
    _model = new ChatOpenAI({
      modelName: process.env.AES_LLM_MODEL || "gpt-4o",
      temperature: 0.1, // Low temperature for deterministic structured output
      apiKey,
    });
  }
  return _model;
}

export function isLLMAvailable(): boolean {
  return getLLM() !== null;
}

/** Reset the cached model instance — used in tests */
export function resetLLM(): void {
  _model = null;
}
