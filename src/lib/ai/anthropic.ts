/**
 * Claude Messages API over HTTPS (no SDK). Key: ANTHROPIC_API_KEY.
 * POST https://api.anthropic.com/v1/messages · headers x-api-key, anthropic-version: 2023-06-01.
 */

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string }; title?: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export interface ChatMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

/** Forced tool: Claude must answer by "calling" it, so the reply is structured JSON (no prose, no parsing guesswork). */
export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ClaudeRequest {
  model: string;
  system?: string;
  messages: ChatMessage[];
  maxTokens: number;
  tool?: ClaudeTool;
}

export interface ClaudeResponse {
  text: string;
  /** Input of the forced tool call (the structured answer), when a tool was given and Claude used it */
  toolInput?: unknown;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}

export class ClaudeApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function callClaude(req: ClaudeRequest, attempt = 0): Promise<ClaudeResponse> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json" },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: req.messages,
      ...(req.tool ? { tools: [req.tool], tool_choice: { type: "tool", name: req.tool.name } } : {}),
    }),
    cache: "no-store",
  });
  if ((res.status === 429 || res.status === 529 || res.status >= 500) && attempt < 2) {
    const retry = Number(res.headers.get("retry-after") ?? "") || 2 ** attempt * 2;
    await sleep(Math.min(retry, 30) * (process.env.VITEST ? 0 : 1000));
    return callClaude(req, attempt + 1);
  }
  const raw = await res.text();
  if (!res.ok) {
    let msg = raw.slice(0, 300);
    try {
      msg = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? msg;
    } catch {
      /* keep raw */
    }
    const plain =
      res.status === 401 ? "Claude API key was rejected — check ANTHROPIC_API_KEY" : res.status === 404 ? `Claude model "${req.model}" not found` : `Claude API error (${res.status}): ${msg}`;
    throw new ClaudeApiError(plain, res.status, raw.slice(0, 500));
  }
  const body = JSON.parse(raw) as {
    content?: Array<{ type: string; text?: string; name?: string; input?: unknown }>;
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
    stop_reason?: string;
  };
  const u = body.usage ?? {};
  const toolUse = (body.content ?? []).find((c) => c.type === "tool_use" && (!req.tool || c.name === req.tool.name));
  return {
    text: (body.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join(""),
    ...(toolUse ? { toolInput: toolUse.input } : {}),
    inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    outputTokens: u.output_tokens ?? 0,
    stopReason: body.stop_reason ?? null,
  };
}
