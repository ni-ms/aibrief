import { matches, countMatches } from "./interests.ts";
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

/** Deterministic retrieval. No model, popularity score, or passive reading telemetry. */
export function rankStories(
  stories: Story[],
  profile: Profile,
  now = Date.now(),
): Story[] {
  const texts = stories.map(boundedText);
  const lengths = texts.map((t) => words(t).length || 1);
  const average = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);
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

  return stories.map((story, index) => {
    const text = texts[index];
    const matched = terms.filter((t) => matches(text, t));
    let lexical = 0;
    for (const term of matched) {
      const tf = Math.min(5, countMatches(text, term));
      const idf = Math.log(
        1 +
          (stories.length - (frequency.get(term) || 0) + 0.5) /
            ((frequency.get(term) || 0) + 0.5),
      );
      const norm =
        (tf * 2.2) /
        (tf + 1.2 * (0.25 + (0.75 * lengths[index]) / Math.max(1, average)));
      const titleBoost = matches(story.title, term) ? 2.8 : 1;
      lexical +=
        idf *
        norm *
        titleBoost *
        (GENERIC.has(term) ? 0.25 : term.includes(" ") ? 1.5 : 1);
    }
    lexical = Math.min(45, lexical * 3);
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
    const semanticFeedback = anchorTerms.reduce(
      (score, anchor) =>
        score +
        ((anchor.vote *
          anchor.terms.filter((t) => tokenSets[index].has(t)).length) /
          Math.max(1, anchor.terms.length)) *
          12,
      0,
    );
    const topicFeedback =
      story.topics.reduce((n, t) => n + (profile.weights[t] || 0), 0) * 1.2;
    const feedback = Math.max(
      -18,
      Math.min(18, semanticFeedback + topicFeedback),
    );
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
      (matched.length > 0 || focus > 0 || feedback > 2 || terms.length === 0);
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
