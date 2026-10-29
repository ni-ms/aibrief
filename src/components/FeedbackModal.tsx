import { useState } from "react";
import {
  Check,
  Download,
  ExternalLink,
  MessageSquarePlus,
  X,
} from "lucide-react";
import type { FeedbackSubmission } from "../../shared/types.ts";
import { preferences } from "../lib/preferences";
import { feedbackFormUrl } from "../lib/project-config";
import { FEEDBACK_HISTORY_LIMIT } from "../../shared/feedback.ts";

export function FeedbackModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [category, setCategory] =
    useState<FeedbackSubmission["category"]>("source");
  const [message, setMessage] = useState("");
  const [exampleUrl, setExampleUrl] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [submissions, setSubmissions] = useState<FeedbackSubmission[]>(() => {
    try {
      return JSON.parse(preferences.get("feedback-log") || "[]");
    } catch {
      return [];
    }
  });

  if (!open) return null;

  async function saveSubmissionLocally(): Promise<FeedbackSubmission | null> {
    if (!message.trim()) return null;
    const entry: FeedbackSubmission = {
      id: crypto.randomUUID().slice(0, 8),
      category,
      message: message.trim(),
      ...(exampleUrl.trim() ? { url: exampleUrl.trim() } : {}),
      createdAt: new Date().toISOString(),
    };
    const next = [entry, ...submissions].slice(0, FEEDBACK_HISTORY_LIMIT);
    await preferences.save("feedback-log", JSON.stringify(next));
    setSubmissions(next);
    return entry;
  }

  async function handleSaveLocal(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError("");
    setSavedNotice("");
    try {
      const entry = await saveSubmissionLocally();
      if (!entry) return;
      setMessage("");
      setExampleUrl("");
      setSavedNotice("Saved your suggestion locally.");
      setTimeout(() => setSavedNotice(""), 3000);
    } catch (error) {
      setSaveError(
        `Could not save your suggestion: ${(error as Error).message}`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleOpenGoogleForm() {
    if (!feedbackFormUrl || !message.trim() || saving) return;
    setSaving(true);
    setSaveError("");
    setSavedNotice("");
    const summaryText = `[${category.toUpperCase()}] ${message.trim()}${
      exampleUrl.trim() ? `\nURL: ${exampleUrl.trim()}` : ""
    }`;
    // Start copying while this tab still has focus, without delaying the new tab.
    const copy = navigator.clipboard?.writeText(summaryText).then(
      () => true,
      () => false,
    );
    window.open(feedbackFormUrl, "_blank", "noopener,noreferrer");
    try {
      await saveSubmissionLocally();
    } catch (error) {
      setSaveError(`Could not save a local copy: ${(error as Error).message}`);
    }
    try {
      if (!(await copy)) throw new Error("Clipboard unavailable");
      setSavedNotice(
        "Your suggestion was copied. Paste it into the Google Form that opened, then submit it there.",
      );
    } catch {
      setSavedNotice(
        "The Google Form opened. Copy your suggestion above and paste it into the form.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleExportFeedbackJson() {
    const blob = new Blob([JSON.stringify(submissions, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fieldnotes-suggestions-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="command-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Suggest an Improvement"
    >
      <div
        className="command-dialog"
        style={{ maxWidth: "540px", padding: "20px 22px" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "12px",
          }}
        >
          <h3
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "16px",
              fontWeight: 600,
            }}
          >
            <MessageSquarePlus size={17} /> Suggest an Improvement
          </h3>
          <button
            type="button"
            aria-label="Close feedback modal"
            onClick={onClose}
            style={{ color: "var(--quiet)", padding: "4px" }}
          >
            <X size={16} />
          </button>
        </div>

        <p
          className="field-note"
          style={{ marginTop: 0, marginBottom: "14px" }}
        >
          Submit a new source request, UI improvement, ranking tweak, or bug
          report via Google Form or save it to your local suggestions log.
        </p>

        <form
          onSubmit={(e) => void handleSaveLocal(e)}
          style={{ display: "flex", flexDirection: "column", gap: "12px" }}
        >
          <label style={{ fontSize: "12px", fontWeight: 500 }}>
            Category
            <select
              disabled={saving}
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as FeedbackSubmission["category"])
              }
              style={{ width: "100%", marginTop: "5px", fontSize: "13px" }}
            >
              <option value="source">New Source / Blog Request</option>
              <option value="ui">UI & Workflow Improvement</option>
              <option value="ranking">Ranking & Semantic Search</option>
              <option value="bug">Bug Report</option>
              <option value="other">Other Idea</option>
            </select>
          </label>

          <label style={{ fontSize: "12px", fontWeight: 500 }}>
            What would make Fieldnotes better?
            <textarea
              disabled={saving}
              required
              rows={4}
              maxLength={2000}
              placeholder="Describe the source, workflow change, or feature you'd like to see…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={{ width: "100%", marginTop: "5px", fontSize: "13px" }}
            />
          </label>

          <label style={{ fontSize: "12px", fontWeight: 500 }}>
            Example URL or feed address (optional)
            <input
              type="text"
              maxLength={500}
              disabled={saving}
              placeholder="https://example.com/blog or @author"
              value={exampleUrl}
              onChange={(e) => setExampleUrl(e.target.value)}
              style={{ width: "100%", marginTop: "5px", fontSize: "13px" }}
            />
          </label>

          {savedNotice && (
            <p
              className="field-note"
              role="status"
              style={{ color: "var(--accent)", margin: 0 }}
            >
              {savedNotice}
            </p>
          )}
          {saveError && (
            <p className="error-message" role="alert">
              {saveError}
            </p>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
              marginTop: "4px",
            }}
          >
            <button
              type="button"
              className="button primary"
              disabled={saving || !message.trim() || !feedbackFormUrl}
              onClick={() => void handleOpenGoogleForm()}
            >
              <ExternalLink size={13} /> Copy & open Google Form
            </button>
            <button
              type="submit"
              className="button"
              disabled={saving || !message.trim()}
            >
              <Check size={13} />{" "}
              {saving ? "Saving…" : "Save suggestion locally"}
            </button>
          </div>
        </form>

        {submissions.length > 0 && (
          <div
            style={{
              marginTop: "16px",
              paddingTop: "12px",
              borderTop: "1px solid var(--line)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "11.5px",
              color: "var(--quiet)",
            }}
          >
            <span>
              {submissions.length} saved suggestion
              {submissions.length === 1 ? "" : "s"} on this computer
            </span>
            <button
              type="button"
              className="text-link"
              onClick={handleExportFeedbackJson}
            >
              <Download size={12} /> Export JSON
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
