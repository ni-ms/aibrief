import { deriveTerms } from "./interests.ts";
import type { Profile } from "./types.ts";

export const INTEREST_STARTERS = [
  {
    id: "ai-ml",
    label: "AI & Local LLMs",
    description: "Language models, efficient inference, and open tools.",
    prompt:
      "AI and machine learning, local language models, efficient inference, quantization, and open-source agentic tools",
    focus: ["speculative decoding", "kv cache", "quantization"],
  },
  {
    id: "quantum",
    label: "Quantum Computing",
    description: "Logical qubits, error correction, and quantum hardware.",
    prompt:
      "quantum computing, fault-tolerant quantum error correction, surface codes, logical qubits, and quantum hardware",
    focus: ["quantum error correction", "surface code", "logical qubits"],
  },
  {
    id: "systems",
    label: "Systems & Compilers",
    description: "Compilers, distributed systems, and databases.",
    prompt:
      "distributed systems, compilers, MLIR, LLVM, WebGPU, WebAssembly, and database storage engines",
    focus: ["mlir", "webgpu", "distributed systems"],
  },
  {
    id: "security",
    label: "Security & Cryptography",
    description: "Applied cryptography, security, and vulnerability research.",
    prompt:
      "systems security, applied cryptography, zero-knowledge proofs, post-quantum cryptography, and vulnerability research",
    focus: ["zero-knowledge", "post-quantum", "cryptography"],
  },
  {
    id: "robotics",
    label: "Robotics & Embodied AI",
    description: "Robots that learn, move, and interact with the world.",
    prompt:
      "robotics, embodied intelligence, visuomotor policies, sim-to-real transfer, manipulation, and locomotion",
    focus: ["embodied intelligence", "sim-to-real", "manipulation"],
  },
  {
    id: "bio",
    label: "Biology & Protein Design",
    description: "Protein structures, genomics, and molecular design.",
    prompt:
      "computational biology, protein structure prediction, genomics, molecular design, and biotech tools",
    focus: ["protein folding", "genomics", "molecular design"],
  },
];

export interface OnboardingRecord {
  version: 1;
  topicIds: string[];
  custom: string;
  prompt: string;
  skipped?: boolean;
}

export function readOnboarding(value: string | null): OnboardingRecord | null {
  try {
    const saved = JSON.parse(value || "null");
    if (
      saved?.version !== 1 ||
      !Array.isArray(saved.topicIds) ||
      saved.topicIds.length > INTEREST_STARTERS.length ||
      !saved.topicIds.every(
        (id: unknown) =>
          typeof id === "string" && INTEREST_STARTERS.some((s) => s.id === id),
      ) ||
      typeof saved.custom !== "string" ||
      saved.custom.length > 2000 ||
      typeof saved.prompt !== "string" ||
      saved.prompt.length > 2000 ||
      (saved.skipped !== undefined && typeof saved.skipped !== "boolean") ||
      (!saved.skipped &&
        (!saved.prompt.trim() ||
          saved.prompt !== onboardingPrompt(saved.topicIds, saved.custom)))
    )
      return null;
    return saved;
  } catch {
    return null;
  }
}

export const splitPhrases = (value: string) => [
  ...new Set(
    value
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  ),
];

export function suggestedFocus(topicIds: string[]) {
  const packs = INTEREST_STARTERS.filter((pack) => topicIds.includes(pack.id));
  // Give each chosen field a place before adding more phrases from one field.
  return [
    ...new Set([0, 1, 2].flatMap((i) => packs.map((pack) => pack.focus[i]))),
  ].slice(0, 6);
}

export function onboardingPrompt(topicIds: string[], custom: string) {
  const topics = INTEREST_STARTERS.filter((pack) =>
    topicIds.includes(pack.id),
  ).map((pack) => pack.prompt);
  return [topics.length ? `Follow ${topics.join("; ")}.` : "", custom.trim()]
    .filter(Boolean)
    .join(" ");
}

export function personalizedProfile(
  profile: Profile,
  draft: {
    topicIds: string[];
    custom: string;
    focus: string;
    exclude: string;
    strict: boolean;
  },
): Profile {
  const prompt = onboardingPrompt(draft.topicIds, draft.custom);
  const focusTerms = splitPhrases(draft.focus);
  const excludeTerms = splitPhrases(draft.exclude);
  if (!prompt || prompt.length > 2000)
    throw new Error(
      "Choose a topic or describe your interests in up to 2,000 characters.",
    );
  if (focusTerms.length > 6)
    throw new Error("Use up to 6 focus phrases, separated by commas.");
  if (excludeTerms.length > 30)
    throw new Error("Use up to 30 exclusions, separated by commas.");
  if ([...focusTerms, ...excludeTerms].some((phrase) => phrase.length > 100))
    throw new Error("Keep each phrase under 100 characters.");
  return {
    ...profile,
    prompt,
    terms: prompt === profile.prompt ? profile.terms : deriveTerms(prompt),
    focusTerms,
    excludeTerms,
    strictFocus: draft.strict && focusTerms.length > 0,
  };
}
