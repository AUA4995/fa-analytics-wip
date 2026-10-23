/**
 * Claude models the app can use, with prices (US$ per million tokens). Configurable: Setting "aiModelCatalog"
 * (JSON array of AiModel) replaces/extends this list so newer models can be added without code changes.
 * Prices checked on platform.claude.com/docs/en/about-claude/pricing (21/10/2026).
 */

export interface AiModel {
  /** API model id, e.g. "claude-haiku-5-5" */
  id: string;
  /** Shown in Settings, e.g. "Haiku 5.5" */
  label: string;
  inputPerMTok: number;
  outputPerMTok: number;
  /** Long-context tier: prompts above this many input tokens are priced at the long rates */
  longContextThreshold?: number;
  longInputPerMTok?: number;
  longOutputPerMTok?: number;
}

export const HAIKU = "claude-haiku-5-5";
export const SONNET = "claude-sonnet-5-5";

export const DEFAULT_MODELS: AiModel[] = [
  { id: HAIKU, label: "Haiku 5.5", inputPerMTok: 0.1, outputPerMTok: 0.5, longContextThreshold: 100_000, longInputPerMTok: 0.5, longOutputPerMTok: 2.5 },
  { id: SONNET, label: "Sonnet 5.5", inputPerMTok: 2, outputPerMTok: 10 },
];

/** Estimated cost of one call in US$ (rounded to 6 dp). Unknown model → 0. */
export function estimateCostUsd(model: AiModel | undefined, inputTokens: number, outputTokens: number): number {
  if (!model) return 0;
  const long = model.longContextThreshold != null && inputTokens > model.longContextThreshold;
  const inRate = long ? (model.longInputPerMTok ?? model.inputPerMTok) : model.inputPerMTok;
  const outRate = long ? (model.longOutputPerMTok ?? model.outputPerMTok) : model.outputPerMTok;
  const usd = (inputTokens * inRate + outputTokens * outRate) / 1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

/** Merge a configured catalog over the defaults (same id replaces; new ids are added). Invalid rows are ignored. */
export function mergeCatalog(configured: unknown): AiModel[] {
  const out = new Map(DEFAULT_MODELS.map((m) => [m.id, m]));
  if (Array.isArray(configured)) {
    for (const row of configured) {
      const r = row as Partial<AiModel>;
      if (typeof r?.id !== "string" || !r.id || typeof r.inputPerMTok !== "number" || typeof r.outputPerMTok !== "number") continue;
      out.set(r.id, { ...r, id: r.id, label: typeof r.label === "string" && r.label ? r.label : r.id, inputPerMTok: r.inputPerMTok, outputPerMTok: r.outputPerMTok });
    }
  }
  return [...out.values()];
}
