import { matches, countMatches } from "./interests.ts";
import {
  cosineSimilarity,
  embedText,
  rocchioCentroid,
} from "./semantic.ts";
import type { Profile, Story } from "./types.ts";

const GENERIC = new Set([
  "ai",
  "llm",
  "models",
  "model",
  "language",
  "local",
  "open-source",
  "neural",
  "learning",
  "research",
  "paper",
  "papers",
]);
const STOP = new Set(
  "the and for with that this from are was were have has our their into using through based which can not also results method data model models new".split(
    " ",
  ),
);
const words = (s: string) =>
  s
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{2,}/g)
    ?.filter((w) => !STOP.has(w)) || [];
const boundedText = (s: Story) =>
  `${s.title} ${s.abstract.slice(0, 7000)} ${s.releaseText.slice(0, 4000)}`;
const rounded = (n: number) => Math.round(n * 10) / 10;

/**
 * Sequential Dependence Model (SDM) proximity bonus:
 * Rewards documents where distinct non-generic query terms appear adjacent
 * or within a tight 4-word window inside the title or abstract.
 */
function proximityBonus(text: string, matchedTerms: string[]): number {
  const specific = matchedTerms.filter((t) => !GENERIC.has(t) && !t.includes(" "));
  if (specific.length < 2) return 0;
  const tokens = words(text.slice(0, 2000));
  let bonus = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (!specific.includes(tokens[i])) continue;
    for (let j = i + 1; j <= Math.min(i + 4, tokens.length - 1); j++) {
      if (tokens[j] !== tokens[i] && specific.includes(tokens[j])) {
        bonus += j === i + 1 ? 2.2 : 1.1;
        if (bonus >= 5.5) return 5.5;
      }
    }
  }
  return bonus;
}

/**
 * Multi-stage v1.0 Ranker:
 * 1. BM25F fielded saturation (separate length normalization for title, metadata/topics, and body)
 * 2. Sequential Dependence Model (SDM) term-proximity boost
 * 3. Rocchio feedback centroid + distinctive anchor term transfer
 * 4. Exponential freshness decay + context completeness
 */
export function rankStories(
  stories: Story[],
  profile: Profile,
  now = Date.now(),
): Story[] {
  const texts = stories.map(boundedText);
  const bodyTexts = stories.map(
    (s) => `${s.abstract.slice(0, 7000)} ${s.releaseText.slice(0, 4000)}`,
  );
  const titleLengths = stories.map((s) => words(s.title).length || 1);
  const avgTitleLen =
    titleLengths.reduce((a, b) => a + b, 0) / (titleLengths.length || 1);
  const bodyLengths = bodyTexts.map((t) => words(t).length || 1);
  const avgBodyLen =
    bodyLengths.reduce((a, b) => a + b, 0) / (bodyLengths.length || 1);

  const terms = [...new Set(profile.terms)].slice(0, 70);
  const frequency = new Map(
    terms.map((t) => [t, texts.filter((text) => matches(text, t)).length]),
  );
  const anchors = stories.filter((s) => s.feedback !== 0);
  const tokenSets = texts.map((t) => new Set(words(t)));
  const documentFrequency = new Map<string, number>();
  for (const set of tokenSets)
    for (const token of set)
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
  const anchorTerms = anchors.map((anchor) => ({
    vote: anchor.feedback,
    terms: [...new Set(words(boundedText(anchor)))]
      .filter((t) => !GENERIC.has(t))
      .sort(
        (a, b) =>
          (documentFrequency.get(a) || 1) - (documentFrequency.get(b) || 1),
      )
      .slice(0, 20),
  }));

  // Compute local semantic embeddings for Rocchio preference centroid and semantic boost
  const storyVectors = stories.map((s, idx) =>
    embedText(bodyTexts[idx].slice(0, 2500), s.title),
  );
  const profileVec = embedText(
    `${profile.prompt} ${(profile.focusTerms || []).join(" ")}`,
    (profile.focusTerms || []).join(" "),
  );
  const likedVecs = stories
    .map((s, idx) => (s.feedback > 0 ? storyVectors[idx] : null))
    .filter((v): v is Float32Array => v !== null);
  const dislikedVecs = stories
    .map((s, idx) => (s.feedback < 0 ? storyVectors[idx] : null))
    .filter((v): v is Float32Array => v !== null);
  const rocchioVec = rocchioCentroid(profileVec, likedVecs, dislikedVecs);

  return stories.map((story, index) => {
    const text = texts[index];
    const bodyText = bodyTexts[index];
    const metaText = `${story.topics.join(" ")} ${story.metadata?.venue || ""} ${(story.metadata?.authors || []).join(" ")}`;
    const matched = terms.filter((t) => matches(text, t));

    // Stage 1: BM25F Fielded Lexical Scoring + SDM Proximity
    let lexical = 0;
    for (const term of matched) {
      const idf = Math.log(
        1 +
          (stories.length - (frequency.get(term) || 0) + 0.5) /
            ((frequency.get(term) || 0) + 0.5),
      );
      const tfTitle = Math.min(3, countMatches(story.title, term));
      const tfMeta = Math.min(2, countMatches(metaText, term));
      const tfBody = Math.min(5, countMatches(bodyText, term));

      const normTitle =
        tfTitle > 0
          ? (tfTitle * 2.2) /
            (tfTitle +
              1.2 * (0.35 + (0.65 * titleLengths[index]) / Math.max(1, avgTitleLen)))
          : 0;
      const normBody =
        tfBody > 0
          ? (tfBody * 2.2) /
            (tfBody +
              1.2 * (0.25 + (0.75 * bodyLengths[index]) / Math.max(1, avgBodyLen)))
          : 0;
      const normMeta = tfMeta > 0 ? 0.8 : 0;

      // Field weights: Title (2.8x), Body (1.0x), Metadata/Topics (0.6x)
      const fieldedScore = normTitle * 2.8 + normBody * 1.0 + normMeta * 0.6;
      lexical +=
        idf *
        fieldedScore *
        (GENERIC.has(term) ? 0.25 : term.includes(" ") ? 1.5 : 1);
    }
    const sdmBonus = proximityBonus(`${story.title} ${bodyText}`, matched);
    const semSim = Math.max(0, cosineSimilarity(profileVec, storyVectors[index]));
    lexical = Math.min(45, lexical * 2.6 + sdmBonus + semSim * 4.5);

    // Stage 2: Focus Phrases
    const focusMatches = (profile.focusTerms || []).filter((t) =>
      matches(text, t),
    );
    const focus = Math.min(
      30,
      focusMatches.reduce((n, t) => n + (matches(story.title, t) ? 18 : 10), 0),
    );
    const excludedBy = (profile.excludeTerms || []).filter((t) =>
      matches(text, t),
    );

    // Stage 3: Rocchio Vector Feedback + Distinctive Anchor Terms
    const anchorTermFeedback = anchorTerms.reduce(
      (score, anchor) =>
        score +
        ((anchor.vote *
          anchor.terms.filter((t) => tokenSets[index].has(t)).length) /
          Math.max(1, anchor.terms.length)) *
          10,
      0,
    );
    const rocchioDelta =
      likedVecs.length || dislikedVecs.length
        ? (cosineSimilarity(rocchioVec, storyVectors[index]) - semSim) * 14
        : 0;
    const topicFeedback =
      story.topics.reduce((n, t) => n + (profile.weights[t] || 0), 0) * 1.2;
    const feedback = Math.max(
      -18,
      Math.min(18, anchorTermFeedback + rocchioDelta + topicFeedback),
    );

    // Stage 4: Freshness & Context
    const age = Math.max(
      0,
      (now -
        Date.parse(
          (story.metadata?.arxivVersion && story.metadata.arxivVersion > 1
            ? story.metadata.updatedAt
            : null) ||
            story.publishedAt ||
            story.firstSeenAt,
        )) /
        86400000,
    );
    const freshness = 12 * Math.exp(-age / 10);
    const context = (story.abstract || story.releaseText).length > 180 ? 3 : 0;
    const eligible =
      !excludedBy.length &&
      (!profile.strictFocus ||
        !profile.focusTerms?.length ||
        focusMatches.length > 0) &&
      (matched.length > 0 ||
        focus > 0 ||
        feedback > 2 ||
        semSim >= 0.28 ||
        terms.length === 0);
    const total = rounded(lexical + focus + feedback + freshness + context);
    const titleMatches = matched.filter(
      (t) => matches(story.title, t) && !GENERIC.has(t),
    );
    const reasons = [
      ...(focusMatches.length ? [`Focus: ${focusMatches.join(", ")}`] : []),
      ...(titleMatches.length
        ? [`Title: ${titleMatches.slice(0, 3).join(", ")}`]
        : matched.length
          ? [`Text: ${matched.slice(0, 3).join(", ")}`]
          : semSim >= 0.22
            ? [`Semantic match (${Math.round(semSim * 100)}%)`]
            : ["From selected resources"]),
      ...(feedback > 1
        ? ["Similar to your positive feedback"]
        : feedback < -1
          ? ["Reduced by your feedback"]
          : []),
      ...(excludedBy.length ? [`Excluded: ${excludedBy.join(", ")}`] : []),
      ...(profile.strictFocus &&
      profile.focusTerms?.length &&
      !focusMatches.length
        ? ["Does not match a required focus phrase"]
        : []),
    ];
    return {
      ...story,
      score: total,
      semanticScore: Math.round(semSim * 100),
      reasons,
      ranking: {
        lexical: rounded(lexical),
        focus,
        feedback: rounded(feedback),
        freshness: rounded(freshness),
        context,
        total,
        eligible,
        matchedTerms: matched,
        excludedBy,
      },
    };
  });
}
