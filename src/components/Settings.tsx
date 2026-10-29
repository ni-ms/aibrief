import { Cpu, Database, Moon, Sparkles, Sun } from "lucide-react";
import type { Theme } from "../lib/appearance";
import "./onboarding.css";

export function Settings({
  theme,
  onTheme,
  onOnboarding,
  onModel,
  onData,
}: {
  theme: Theme;
  onTheme: (theme: Theme) => void;
  onOnboarding: () => void;
  onModel: () => void;
  onData?: () => void;
}) {
  return (
    <main className="page settings-page">
      <div className="page-title">
        <div>
          <span className="kicker">YOUR WORKSPACE</span>
          <h1>Settings</h1>
          <p className="desk-description">
            Make Fieldnotes feel like your own.
          </p>
        </div>
      </div>
      <section
        className="settings-section"
        aria-labelledby="personalization-heading"
      >
        <div className="settings-section-icon">
          <Sparkles size={21} />
        </div>
        <div>
          <h2 id="personalization-heading">Personalize your feed</h2>
          <p>
            Revisit your interests, priorities, and exclusions with the guided
            onboarding.
          </p>
          <button className="button primary" onClick={onOnboarding}>
            Redo onboarding
          </button>
        </div>
      </section>
      <section
        className="settings-section"
        aria-labelledby="appearance-heading"
      >
        <div className="settings-section-icon">
          <Moon size={21} />
        </div>
        <div>
          <h2 id="appearance-heading">Appearance</h2>
          <p>
            Dark mode is the default. Your choice is saved for future visits.
          </p>
          <div
            className="settings-theme-options"
            role="group"
            aria-label="Appearance"
          >
            <button
              className={`button ${theme === "dark" ? "active" : ""}`}
              aria-pressed={theme === "dark"}
              onClick={() => onTheme("dark")}
            >
              <Moon size={15} /> Dark
            </button>
            <button
              className={`button ${theme === "light" ? "active" : ""}`}
              aria-pressed={theme === "light"}
              onClick={() => onTheme("light")}
            >
              <Sun size={15} /> Light
            </button>
          </div>
        </div>
      </section>
      <section
        className="settings-section"
        aria-labelledby="ai-settings-heading"
      >
        <div className="settings-section-icon">
          <Cpu size={21} />
        </div>
        <div>
          <h2 id="ai-settings-heading">AI summaries</h2>
          <p>Choose a browser model or connect your own model server.</p>
          <button className="button" onClick={onModel}>
            Model settings
          </button>
        </div>
      </section>
      {onData && (
        <section
          className="settings-section"
          aria-labelledby="data-settings-heading"
        >
          <div className="settings-section-icon">
            <Database size={21} />
          </div>
          <div>
            <h2 id="data-settings-heading">Your data</h2>
            <p>Back up your reading desk or restore it on this device.</p>
            <button className="button" onClick={onData}>
              Data & backups
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
