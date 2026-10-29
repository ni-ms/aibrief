import type { Story } from "./types.ts";

export const EMBEDDING_DIM = 384;

const STOP_WORDS = new Set(
  "the and for with that this from are was were have has our their into using through based which can not also results method data new one two three more between over under such when where while after before".split(
    " ",
  ),
);

/**
 * Curated domain concept clusters so semantic search bridges vocabulary gaps
 * (e.g. "speculative decoding" <-> "draft verify token generation",
 * "kv cache compression" <-> "attention sink paged memory quantization").
 */
const CONCEPT_CLUSTERS: [string, string[]][] = [
  [
    "concept:fast_inference",
    [
      "speculative decoding",
      "draft",
      "verify",
      "autoregressive",
      "latency",
      "throughput",
      "token generation",
      "medusa",
      "lookahead",
    ],
  ],
  [
    "concept:kv_memory",
    [
      "kv cache",
      "attention sink",
      "paged attention",
      "context window",
      "long context",
      "memory compression",
      "ring attention",
      "sparse attention",
      "flashattention",
    ],
  ],
  [
    "concept:quantization",
    [
      "quantization",
      "quantized",
      "awq",
      "gptq",
      "gguf",
      "bitnet",
      "fp8",
      "int4",
      "4-bit",
      "low-bit",
      "weight compression",
      "pruning",
    ],
  ],
  [
    "concept:qec",
    [
      "quantum error correction",
      "surface code",
      "syndrome",
      "logical qubit",
      "stabilizer",
      "fault-tolerant",
      "ldpc",
      "decoder",
      "decoherence",
    ],
  ],
  [
    "concept:agents_reasoning",
    [
      "chain of thought",
      "reasoning",
      "test-time compute",
      "reinforcement learning",
      "rlhf",
      "grpo",
      "ppo",
      " verifier",
      "tree search",
      "mcts",
      "agentic",
    ],
  ],
  [
    "concept:compilers_systems",
    [
      "compiler",
      "mlir",
      "llvm",
      "triton",
      "cuda",
      "webgpu",
      "wasm",
      "webassembly",
      "kernel",
      "distributed",
      "runtime",
    ],
  ],
  [
    "concept:security_crypto",
    [
      "cryptography",
      "zero-knowledge",
      "zk-snark",
      "homomorphic",
      "post-quantum",
      "vulnerability",
      "exploit",
      "sandbox",
      "fuzzing",
    ],
  ],
  [
    "concept:robotics_embodied",
    [
      "robotics",
      "embodied",
      "manipulation",
      "locomotion",
      "sim-to-real",
      "teleoperation",
      "humanoid",
      "visuomotor",
    ],
  ],
  [
    "concept:bio_protein",
    [
      "protein",
      "folding",
      "genomics",
      "crispr",
      "molecular",
      "drug discovery",
      "rna",
      "dna",
      "single-cell",
    ],
  ],
];

export function stemWord(word: string): string {
  if (word.length <= 4) return word;
  return word
    .replace(/(?:ational|tional)$/, "tion")
    .replace(/(?:encies|ancies)$/, "ence")
    .replace(/(?:izing|ising|ized|ised)$/, "ize")
    .replace(/(?:ingly|edly)$/, "")
    .replace(/(?:ments|ment)$/, "")
    .replace(/(?:ness|able|ible|ious|eous)$/, "")
    .replace(/(?:ies)$/, "y")
    .replace(/(?:ing|ers|ors|ed|es|ly)$/, "")
    .replace(/s$/, "");
}

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function addFeature(vec: Float32Array, feature: string, weight: number) {
  const hash = fnv1a(feature);
  const idx = hash % EMBEDDING_DIM;
  const sign = (hash & 0x10000) !== 0 ? 1 : -1;
  vec[idx] += sign * weight;
}

export function normalizeVector(vec: Float32Array): Float32Array {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) sumSq += vec[i] * vec[i];
  const norm = Math.sqrt(sumSq);
  if (norm > 1e-8) {
    for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  }
  return vec;
}

/**
 * Generates a normalized 384-dimensional local semantic vector combining:
 * 1. Stemmed unigrams and technical bigrams with sublinear TF scaling
 * 2. Character 4-grams for morphological/compound word resilience
 * 3. Domain concept cluster activations for synonym bridging
 */
export function embedText(text: string, titleBoostText = ""): Float32Array {
  const vec = new Float32Array(EMBEDDING_DIM);
  const lower = `${titleBoostText} ${titleBoostText} ${text}`.toLowerCase();
  const tokens =
    lower
      .match(/[a-z][a-z0-9-]{1,}/g)
      ?.filter((w) => !STOP_WORDS.has(w) && w.length >= 2) || [];

  if (!tokens.length) return vec;

  const counts = new Map<string, number>();
  const stems = tokens.map((t) => {
    const s = stemWord(t);
    counts.set(s, (counts.get(s) || 0) + 1);
    return s;
  });

  // 1. Stemmed unigrams with sublinear TF (1 + log(tf))
  for (const [stem, tf] of counts) {
    const w = 1 + Math.log(tf);
    addFeature(vec, `u:${stem}`, w * 1.8);
    // Character 4-grams for technical compound terms
    if (stem.length >= 5) {
      for (let i = 0; i <= stem.length - 4; i++) {
        addFeature(vec, `g:${stem.slice(i, i + 4)}`, w * 0.45);
      }
    }
  }

  // 2. Adjacent stem bigrams
  for (let i = 0; i < Math.min(stems.length - 1, 250); i++) {
    addFeature(vec, `b:${stems[i]}_${stems[i + 1]}`, 1.35);
  }

  // 3. Domain concept clusters (bridges vocabulary gaps)
  for (const [conceptId, phrases] of CONCEPT_CLUSTERS) {
    let hits = 0;
    for (const phrase of phrases) {
      if (lower.includes(phrase)) hits++;
    }
    if (hits > 0) {
      addFeature(vec, conceptId, (1 + Math.log(hits)) * 2.6);
      // Secondary projection for higher concept SNR
      addFeature(vec, `${conceptId}:2`, (1 + Math.log(hits)) * 2.2);
    }
  }

  return normalizeVector(vec);
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * Rocchio preference vector:
 * u = alpha * profileVec + beta * mean(liked) - gamma * mean(disliked)
 */
export function rocchioCentroid(
  profileVec: Float32Array,
  likedVecs: Float32Array[],
  dislikedVecs: Float32Array[],
  alpha = 1.0,
  beta = 0.75,
  gamma = 0.35,
): Float32Array {
  const out = new Float32Array(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    out[i] = alpha * (profileVec[i] || 0);
  }
  if (likedVecs.length > 0) {
    const scale = beta / likedVecs.length;
    for (const v of likedVecs) {
      for (let i = 0; i < EMBEDDING_DIM; i++) out[i] += scale * v[i];
    }
  }
  if (dislikedVecs.length > 0) {
    const scale = gamma / dislikedVecs.length;
    for (const v of dislikedVecs) {
      for (let i = 0; i < EMBEDDING_DIM; i++) out[i] -= scale * v[i];
    }
  }
  return normalizeVector(out);
}

export interface HybridSearchMatch {
  story: Story;
  lexicalScore: number;
  semanticScore: number;
  rrfScore: number;
  matchType: "hybrid" | "keyword" | "semantic";
}

// Feed refreshes replace Story objects. Reuse text features by content instead
// of recomputing every document vector for every letter typed in the search box.
const searchDocuments = new Map<
  number,
  {
    signature: string;
    title: string;
    body: string;
    meta: string;
    full: string;
    vector?: Float32Array;
  }
>();

function searchDocument(story: Story, semantic: boolean) {
  const signature = JSON.stringify([
    story.title,
    story.abstract,
    story.releaseText,
    story.sourceName,
    story.topics,
    story.metadata?.authors,
  ]);
  let doc = searchDocuments.get(story.groupId);
  if (!doc || doc.signature !== signature) {
    const title = story.title.toLowerCase();
    const body = `${story.abstract} ${story.releaseText}`.toLowerCase();
    const meta =
      `${story.sourceName} ${story.topics.join(" ")} ${(story.metadata?.authors || []).join(" ")}`.toLowerCase();
    doc = { signature, title, body, meta, full: `${title} ${meta} ${body}` };
    if (searchDocuments.size >= 6000)
      searchDocuments.delete(searchDocuments.keys().next().value!);
    searchDocuments.set(story.groupId, doc);
  }
  if (semantic && !doc.vector)
    doc.vector = embedText(
      `${story.abstract.slice(0, 3000)} ${story.releaseText.slice(0, 2000)} ${story.topics.join(" ")}`,
      story.title,
    );
  return doc;
}

/**
 * Hybrid search over stories using Reciprocal Rank Fusion (RRF, k=60)
 * combining fielded lexical matching with dense local semantic similarity.
 */
export function hybridSearchStories(
  stories: Story[],
  query: string,
  mode: "hybrid" | "keyword" | "semantic" = "hybrid",
): HybridSearchMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return stories.map((story) => ({
      story,
      lexicalScore: 0,
      semanticScore: 0,
      rrfScore: 0,
      matchType: "keyword",
    }));
  }

  const queryTokens = q
    .match(/[a-z0-9][a-z0-9-]{1,}/g)
    ?.filter((w) => !STOP_WORDS.has(w)) || [q];
  const queryStems = queryTokens.map(stemWord);
  const queryVec = mode === "keyword" ? null : embedText(q, q);

  const scored = stories.map((story) => {
    const doc = searchDocument(story, mode !== "keyword");
    const {
      title: titleLower,
      body: bodyLower,
      meta: metaLower,
      full: fullLower,
    } = doc;

    // Fielded lexical score (BM25F-inspired)
    let lexical = 0;
    if (titleLower.includes(q)) lexical += 12;
    else if (fullLower.includes(q)) lexical += 6;

    for (let i = 0; i < queryTokens.length; i++) {
      const tok = queryTokens[i];
      const stem = queryStems[i];
      if (
        titleLower.includes(tok) ||
        (stem.length >= 4 && titleLower.includes(stem))
      ) {
        lexical += 4.5;
      }
      if (metaLower.includes(tok)) {
        lexical += 2.5;
      }
      if (
        bodyLower.includes(tok) ||
        (stem.length >= 4 && bodyLower.includes(stem))
      ) {
        lexical += 1.5;
      }
    }

    const semantic =
      queryVec && doc.vector
        ? Math.max(0, cosineSimilarity(queryVec, doc.vector))
        : 0;

    return {
      story,
      lexicalScore: lexical,
      semanticScore: semantic,
    };
  });

  if (mode === "keyword") {
    return scored
      .filter((item) => item.lexicalScore > 0)
      .sort((a, b) => b.lexicalScore - a.lexicalScore)
      .map((item) => ({
        ...item,
        rrfScore: item.lexicalScore,
        matchType: "keyword" as const,
        story: {
          ...item.story,
          semanticScore: Math.round(item.semanticScore * 100),
        },
      }));
  }

  // Semantic threshold: strong conceptual overlap
  const semanticThreshold = 0.16;

  if (mode === "semantic") {
    return scored
      .filter(
        (item) =>
          item.semanticScore >= semanticThreshold || item.lexicalScore > 0,
      )
      .sort((a, b) => b.semanticScore - a.semanticScore)
      .map((item) => ({
        ...item,
        rrfScore: item.semanticScore,
        matchType:
          item.lexicalScore > 0 ? ("hybrid" as const) : ("semantic" as const),
        story: {
          ...item.story,
          semanticScore: Math.round(item.semanticScore * 100),
        },
      }));
  }

  // Hybrid Reciprocal Rank Fusion (RRF, k = 60)
  const k = 60;
  const byLexical = [...scored]
    .filter((s) => s.lexicalScore > 0)
    .sort((a, b) => b.lexicalScore - a.lexicalScore);
  const bySemantic = [...scored]
    .filter((s) => s.semanticScore >= semanticThreshold)
    .sort((a, b) => b.semanticScore - a.semanticScore);

  const lexRank = new Map<number, number>();
  byLexical.forEach((item, idx) => lexRank.set(item.story.groupId, idx + 1));

  const semRank = new Map<number, number>();
  bySemantic.forEach((item, idx) => semRank.set(item.story.groupId, idx + 1));

  return scored
    .filter(
      (item) =>
        lexRank.has(item.story.groupId) || semRank.has(item.story.groupId),
    )
    .map((item) => {
      const rL = lexRank.get(item.story.groupId);
      const rS = semRank.get(item.story.groupId);
      const rrfScore = (rL ? 1.25 / (k + rL) : 0) + (rS ? 1.0 / (k + rS) : 0);
      const matchType: "hybrid" | "keyword" | "semantic" =
        rL && rS ? "hybrid" : rL ? "keyword" : "semantic";
      return {
        ...item,
        rrfScore,
        matchType,
        story: {
          ...item.story,
          semanticScore: Math.round(item.semanticScore * 100),
        },
      };
    })
    .sort(
      (a, b) =>
        b.rrfScore - a.rrfScore ||
        b.lexicalScore - a.lexicalScore ||
        b.semanticScore - a.semanticScore,
    );
}
