import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  Cpu,
  Dna,
  Fingerprint,
  Layers,
  LoaderCircle,
  Orbit,
  Sparkles,
} from "lucide-react";
import type { Profile } from "../../shared/types.ts";
import {
  INTEREST_STARTERS,
  onboardingPrompt,
  personalizedProfile,
  readOnboarding,
  splitPhrases,
  suggestedFocus,
  type OnboardingRecord,
} from "../../shared/onboarding.ts";
import { preferences } from "../lib/preferences";
import "./onboarding.css";

const icons = [Cpu, Orbit, Layers, Fingerprint, Sparkles, Dna];
const steps = ["Your interests", "Fine-tune", "Your feed"];

export function Onboarding({
  profile,
  replaying,
  onComplete,
  onSkip,
}: {
  profile: Profile;
  replaying: boolean;
  onComplete: (profile: Profile, record: OnboardingRecord) => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const saved = readOnboarding(preferences.get("onboarding"));
  const restoreAnswers =
    saved && !saved.skipped && saved.prompt === profile.prompt;
  const [step, setStep] = useState(0);
  const [topicIds, setTopicIds] = useState<string[]>(() =>
    restoreAnswers ? saved.topicIds : [],
  );
  const [custom, setCustom] = useState(() =>
    restoreAnswers ? saved.custom : replaying ? profile.prompt : "",
  );
  const [focus, setFocus] = useState(() =>
    replaying ? profile.focusTerms?.join(", ") || "" : "",
  );
  const [exclude, setExclude] = useState(
    () => profile.excludeTerms?.join(", ") || "",
  );
  const [strict, setStrict] = useState(profile.strictFocus || false);
  const [focusEdited, setFocusEdited] = useState(replaying);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [step]);

  function toggleTopic(id: string) {
    const next = topicIds.includes(id)
      ? topicIds.filter((value) => value !== id)
      : [...topicIds, id];
    setTopicIds(next);
    if (!focusEdited) setFocus(suggestedFocus(next).join(", "));
    setError("");
  }
  function next() {
    try {
      personalizedProfile(profile, {
        topicIds,
        custom,
        focus,
        exclude,
        strict,
      });
      setError("");
      setStep((prior) => Math.min(2, prior + 1));
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function finish() {
    setBusy(true);
    setError("");
    try {
      const nextProfile = personalizedProfile(profile, {
        topicIds,
        custom,
        focus,
        exclude,
        strict,
      });
      await onComplete(nextProfile, {
        version: 1,
        topicIds,
        custom: custom.trim(),
        prompt: nextProfile.prompt,
      });
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  async function skip() {
    setBusy(true);
    setError("");
    try {
      await onSkip();
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  const chosen = INTEREST_STARTERS.filter((pack) => topicIds.includes(pack.id));

  return (
    <main className="onboarding" aria-labelledby="onboarding-title">
      <header className="onboarding-header">
        <span className="wordmark">
          fieldnotes
          <span className="wordmark-square" />
        </span>
        <button
          type="button"
          className="text-link"
          disabled={busy}
          onClick={() => void skip()}
        >
          {replaying ? "Cancel" : "Skip for now"}
        </button>
      </header>
      <div className="onboarding-content">
        <ol className="onboarding-steps" aria-label="Personalization progress">
          {steps.map((label, index) => (
            <li
              key={label}
              className={
                step === index ? "current" : step > index ? "complete" : ""
              }
              aria-current={step === index ? "step" : undefined}
            >
              <span>{step > index ? <Check size={13} /> : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <form
          className="onboarding-card"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) {
              if (step < 2) next();
              else void finish();
            }
          }}
        >
          <span className="kicker">
            {replaying ? "MAKE IT YOURS AGAIN" : "WELCOME TO FIELDNOTES"} · STEP{" "}
            {step + 1} OF 3
          </span>
          <h1 id="onboarding-title" ref={heading} tabIndex={-1}>
            {
              [
                "What are you curious about?",
                "Make room for what matters.",
                "Your next discovery starts here.",
              ][step]
            }
          </h1>
          <p className="onboarding-description">
            {
              [
                "Pick a few interests, or tell us in your own words. We’ll use them to shape your feed.",
                "Give your favorite ideas a little more weight and leave out the noise. You can change these anytime.",
                "Here’s what your personalized feed will follow. Research feeds for recognized fields are connected automatically.",
              ][step]
            }
          </p>
          <fieldset className="onboarding-fields" disabled={busy}>
            {step === 0 ? (
              <>
                <div
                  className="onboarding-topics"
                  aria-label="Choose your interests"
                >
                  {INTEREST_STARTERS.map((pack, index) => {
                    const Icon = icons[index];
                    const selected = topicIds.includes(pack.id);
                    return (
                      <button
                        key={pack.id}
                        type="button"
                        className={`onboarding-topic ${selected ? "selected" : ""}`}
                        aria-pressed={selected}
                        onClick={() => toggleTopic(pack.id)}
                      >
                        <Icon size={21} />
                        <span>
                          <strong>{pack.label}</strong>
                          <small>{pack.description}</small>
                        </span>
                        <span className="onboarding-check" aria-hidden="true">
                          {selected && <Check size={13} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <label htmlFor="onboarding-custom">
                  {replaying && !restoreAnswers
                    ? "Your current interests"
                    : "Anything else you’re following?"}
                </label>
                <textarea
                  id="onboarding-custom"
                  rows={3}
                  maxLength={1000}
                  placeholder="For example, energy storage, open-source design tools, or a specific research question…"
                  value={custom}
                  onChange={(event) => {
                    setCustom(event.target.value);
                    setError("");
                  }}
                />
                <p className="field-note">
                  Choose as many topics as you like. Your own description works
                  too.
                </p>
              </>
            ) : step === 1 ? (
              <div className="onboarding-refine">
                <label htmlFor="onboarding-focus">
                  Ideas to prioritize <span>Optional</span>
                </label>
                <input
                  id="onboarding-focus"
                  value={focus}
                  onChange={(event) => {
                    setFocus(event.target.value);
                    setFocusEdited(true);
                  }}
                  placeholder="quantum error correction, efficient inference"
                />
                <p className="field-note">
                  Up to 6 phrases, separated by commas.{" "}
                  {topicIds.length
                    ? "We’ve suggested a few from your topics."
                    : "Leave blank for a broad mix of your interests."}
                </p>
                <label htmlFor="onboarding-exclude">
                  Topics to leave out <span>Optional</span>
                </label>
                <input
                  id="onboarding-exclude"
                  value={exclude}
                  onChange={(event) => setExclude(event.target.value)}
                  placeholder="funding rounds, trading, crypto prices"
                />
                <p className="field-note">
                  These stay out of For you. You can still find them in Latest.
                </p>
                <label className="checkbox-label onboarding-strict">
                  <input
                    type="checkbox"
                    checked={strict}
                    disabled={!focus.trim()}
                    onChange={(event) => setStrict(event.target.checked)}
                  />
                  <span>
                    Keep For you focused
                    <small>
                      Only include items matching at least one priority phrase.
                    </small>
                  </span>
                </label>
              </div>
            ) : (
              <div className="onboarding-review">
                <div className="onboarding-review-icon">
                  <CheckCheck size={25} />
                </div>
                {chosen.length > 0 && (
                  <div className="onboarding-chosen">
                    {chosen.map((pack) => (
                      <span key={pack.id}>{pack.label}</span>
                    ))}
                  </div>
                )}
                <p className="onboarding-review-prompt">
                  {onboardingPrompt(topicIds, custom)}
                </p>
                <dl>
                  <div>
                    <dt>Priorities</dt>
                    <dd>
                      {splitPhrases(focus).join(", ") ||
                        "A broad mix of your interests"}
                    </dd>
                  </div>
                  <div>
                    <dt>Leave out</dt>
                    <dd>
                      {splitPhrases(exclude).join(", ") || "No exclusions"}
                    </dd>
                  </div>
                  <div>
                    <dt>Selection</dt>
                    <dd>
                      {strict && focus.trim()
                        ? "Focus matches only"
                        : "A balanced mix, with your priorities first"}
                    </dd>
                  </div>
                </dl>
                <p className="field-note">
                  Redo this anytime in Settings → Personalize your feed.
                </p>
              </div>
            )}
          </fieldset>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <footer className="onboarding-actions">
            {step > 0 ? (
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() => {
                  setStep((prior) => prior - 1);
                  setError("");
                }}
              >
                <ArrowLeft size={14} /> Back
              </button>
            ) : (
              <span className="onboarding-local">
                Your preferences stay on this device.
              </span>
            )}
            <button
              className="button primary"
              type="submit"
              disabled={
                busy || (step === 0 && !topicIds.length && !custom.trim())
              }
            >
              {busy ? (
                <LoaderCircle size={15} className="spin" />
              ) : step === 2 ? (
                <Sparkles size={15} />
              ) : null}
              {busy
                ? "Saving your feed…"
                : step === 2
                  ? "Build my feed"
                  : "Continue"}
              {!busy && step < 2 && <ArrowRight size={14} />}
            </button>
          </footer>
        </form>
      </div>
    </main>
  );
}
