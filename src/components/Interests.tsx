import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import type { Profile } from "../../shared/types.ts";
import { deriveTerms } from "../../shared/interests.ts";
const split = (value: string) => [
  ...new Set(
    value
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  ),
];
export function Interests({
  profile,
  onSave,
  children,
}: {
  profile: Profile;
  children?: ReactNode;
  onSave: (p: Profile) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState(profile.prompt),
    [focus, setFocus] = useState(profile.focusTerms?.join(", ") || ""),
    [exclude, setExclude] = useState(profile.excludeTerms?.join(", ") || ""),
    [strict, setStrict] = useState(profile.strictFocus || false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="page interests-page">
      <div className="page-title">
        <div>
          <h1>Interests</h1>
        </div>
      </div>
      {children}
      <h2>Reading preferences</h2>
      <form
        className="interest-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          if (split(focus).length > 6) {
            setError("Use up to 6 focus phrases.");
            return;
          }
          setBusy(true);
          try {
            await onSave({
              ...profile,
              prompt,
              terms:
                prompt === profile.prompt ? profile.terms : deriveTerms(prompt),
              focusTerms: split(focus),
              excludeTerms: split(exclude).slice(0, 30),
              strictFocus: strict && split(focus).length > 0,
            });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="interest-prompt">What are you following?</label>
        <textarea
          id="interest-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          maxLength={2000}
          required
          placeholder="Quantum error correction, efficient local models, and open-source research tools."
        />
        <label htmlFor="focus-phrases">Prioritize these phrases</label>
        <input
          id="focus-phrases"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="quantum error correction, speculative decoding"
        />
        <p className="field-note">
          Up to 6 phrases, comma-separated. These prioritize library items.
          Follow separate topics in Discover to collect new papers.
        </p>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={strict}
            disabled={!focus.trim()}
            onChange={(e) => setStrict(e.target.checked)}
          />
          Require at least one focus phrase in For you
        </label>
        <label htmlFor="exclude-phrases">Leave out of For you</label>
        <input
          id="exclude-phrases"
          value={exclude}
          onChange={(e) => setExclude(e.target.value)}
          placeholder="funding rounds, trading, crypto prices"
        />
        <p className="field-note">Excluded items remain searchable in All.</p>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy} type="submit">
          <Check size={14} />
          {busy ? "Saving" : "Save interests"}
        </button>
      </form>
      <details className="method-details">
        <summary>How selection works</summary>
        <p>
          Title-weighted keyword matching with length normalization, focus
          phrases, freshness, and your explicit more/less feedback. A briefing
          spreads attention across sources and avoids repetitive titles. No
          model decides the ranking.
        </p>
        <p>
          Recognized fields add matching arXiv categories. Configure other feeds
          in Sources.
        </p>
      </details>
    </section>
  );
}
