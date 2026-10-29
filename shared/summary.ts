import { z } from "zod";
import type { Item, Profile, SummaryDepth } from "./types.ts";
export const PROMPT_VERSION = "source-only-v3-depth";
export const SOURCE_LIMIT = 4800;
export const SUMMARY_DEPTHS: SummaryDepth[] = ["brief", "standard", "detailed"];
export const DepthSchema = z.enum(["brief", "standard", "detailed"]);
export const DEPTH_SETTINGS = {
  brief: {
    label: "Brief",
    tokens: 220,
    coverage: "Contribution and main limitation",
    instruction:
      "Keep it brief. whatChanged: the main contribution. whyItMatters: one short relevance sentence. evidence: the main limitation or say it is missing. Use one short sentence per field.",
  },
  standard: {
    label: "Standard",
    tokens: 420,
    coverage: "Contribution, approach, results, relevance",
    instruction:
      "whatChanged: contribution and approach. whyItMatters: relevance to the interests. evidence: reported results and main limitations. Use one or two concrete sentences per field.",
  },
  detailed: {
    label: "Detailed",
    tokens: 800,
    coverage:
      "Methods, assumptions, evidence, limitations, remaining questions",
    instruction:
      "whatChanged: contribution and methodological details actually supplied. whyItMatters: relevance and stated assumptions. evidence: reported evidence, limitations, and remaining questions. Explicitly identify missing methods, assumptions, measurements, or validation. Never fill gaps from background knowledge. Use several concise sentences per field as needed.",
  },
} satisfies Record<
  SummaryDepth,
  { label: string; tokens: number; coverage: string; instruction: string }
>;
export function summaryScope(
  item: Pick<
    Item,
    "abstract" | "releaseText" | "sourceKind" | "kind" | "metadata"
  >,
) {
  if (item.metadata?.publicationType === "launch") return "Launch excerpt";
  if (!item.abstract && item.releaseText) return "Release excerpt";
  if (
    item.sourceKind === "rss" ||
    item.sourceKind === "medium" ||
    item.sourceKind === "substack"
  )
    return "Article excerpt";
  if (
    item.sourceKind === "hn" ||
    item.sourceKind === "bluesky" ||
    item.sourceKind === "reddit" ||
    item.sourceKind === "lobsters"
  )
    return "Post excerpt";
  return item.kind === "research" ? "Abstract only" : "Post excerpt";
}
export function summaryInterests(profile: Profile) {
  return profile.focusTerms?.length
    ? `${profile.prompt} Priorities: ${profile.focusTerms.join(", ")}`
    : profile.prompt;
}
/** This is the exact final user message sent to the model and used as cache identity. */
export function summaryInput(
  item: Pick<
    Item,
    "title" | "abstract" | "releaseText" | "sourceKind" | "kind" | "metadata"
  >,
  interests: string,
) {
  return JSON.stringify({
    interests: interests.slice(0, 800),
    title: item.title.slice(0, 400),
    sourceScope: summaryScope(item),
    SOURCE: (item.abstract || item.releaseText).slice(0, SOURCE_LIMIT),
  });
}
export const SummarySchema = z
  .object({
    whatChanged: z.string().min(1).max(2400),
    whyItMatters: z.string().min(1).max(1800),
    evidence: z.string().min(1).max(2800),
    topics: z.array(z.string().min(1).max(60)).min(1).max(5),
  })
  .strict();
export const summaryJSONSchema = {
  type: "object",
  properties: {
    whatChanged: { type: "string" },
    whyItMatters: { type: "string" },
    evidence: { type: "string" },
    topics: { type: "array", items: { type: "string" } },
  },
  required: ["whatChanged", "whyItMatters", "evidence", "topics"],
  additionalProperties: false,
};
