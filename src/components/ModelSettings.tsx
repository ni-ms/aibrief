import { useState } from "react";
import {
  Check,
  Cpu,
  Download,
  LoaderCircle,
  Server,
  ShieldCheck,
  X,
} from "lucide-react";
import { MODELS } from "../local-ai";
import type { AIState } from "../hooks/useLocalAI";

export function ModelSettings({ ai }: { ai: AIState }) {
  const selected = MODELS.find((m) => m.id === ai.model)!;
  const active = ai.status === "loading" || ai.status === "working";
  const [draftUrl, setDraftUrl] = useState(ai.endpointUrl);
  const [draftModel, setDraftModel] = useState(ai.endpointModel);
  const [savedNotice, setSavedNotice] = useState("");
  const [configError, setConfigError] = useState("");

  function saveEndpoint() {
    try {
      if (draftUrl.trim()) {
        const url = new URL(draftUrl.trim());
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw new Error(
            "Enter an HTTP or HTTPS endpoint without credentials in the URL.",
          );
      }
      ai.setEndpointConfig(draftUrl, draftModel);
      setConfigError("");
      setSavedNotice(
        draftUrl.trim()
          ? "Connection saved. Summaries will use this endpoint."
          : "Using the browser model.",
      );
    } catch (error) {
      setConfigError(
        error instanceof Error ? error.message : "Enter a valid endpoint URL.",
      );
    }
  }

  return (
    <section className="page model-page">
      <div className="page-title">
        <div>
          <span className="kicker">YOUR WORKSPACE</span>
          <h1>AI summaries</h1>
          <p className="desk-description">
            A little help making sense of what’s new.
          </p>
        </div>
        <span className={`status-label model-status-${ai.status}`}>
          {
            {
              off: "Not loaded",
              loading: "Loading",
              ready: "Ready",
              working: "Summarizing",
              error: "Try again",
            }[ai.status]
          }
        </span>
      </div>
      <div className="model-settings">
        <div className="model-intro">
          <span className="model-icon">
            <Cpu size={24} />
          </span>
          <div>
            <h2>
              {ai.endpointUrl
                ? "Your connected model"
                : "Your model, on your device"}
            </h2>
            <p>
              {ai.endpointUrl
                ? "Summaries use the model endpoint you’ve connected below."
                : "Load once to download and start the model. We’ll check your device and reuse the download next time."}
            </p>
          </div>
        </div>
        <div className="model-specs">
          <span>{ai.endpointUrl ? ai.endpointModel : "Qwen 2.5"}</span>
          {!ai.endpointUrl && (
            <span>
              {selected.downloadMB
                ? `About ${selected.downloadMB} MB download`
                : "Download size varies"}
            </span>
          )}
          <span>
            <ShieldCheck size={13} />{" "}
            {ai.endpointUrl ? "Your chosen endpoint" : "Runs in this browser"}
          </span>
        </div>
        <div className="model-controls">
          {active ? (
            <button className="button" onClick={ai.cancel}>
              <X size={15} /> Cancel{" "}
              {ai.status === "loading" ? "loading" : "summary"}
            </button>
          ) : ai.status === "ready" ? (
            <>
              <span className="model-ready">
                <Check size={16} /> Model ready
              </span>
              <button className="button" onClick={ai.disable}>
                Unload model
              </button>
            </>
          ) : (
            <button className="button primary" onClick={() => void ai.enable()}>
              <Download size={15} />{" "}
              {ai.status === "error"
                ? "Retry loading model"
                : ai.endpointUrl
                  ? "Use connected model"
                  : "Load model"}
            </button>
          )}
        </div>
        {ai.status === "loading" && (
          <div className="model-progress" role="status">
            <span>
              <LoaderCircle size={14} className="spin" /> Loading model{" "}
              <strong>{Math.round(ai.progress * 100)}%</strong>
            </span>
            <progress
              aria-label="Model loading progress"
              value={ai.progress}
              max={1}
            />
          </div>
        )}
        {ai.message && (
          <p
            className={
              ai.status === "error" ? "error-message" : "device-status"
            }
            role={ai.status === "error" ? "alert" : "status"}
          >
            {ai.message}
          </p>
        )}
        <label className="checkbox-label model-auto-summary">
          <input
            type="checkbox"
            checked={ai.preferred}
            onChange={(e) => ai.setPreferred(e.target.checked)}
          />
          Summarize selected items automatically when the model is ready
        </label>
        <details className="method-details model-advanced">
          <summary>Advanced options</summary>
          <label htmlFor="local-model">Browser model</label>
          <select
            id="local-model"
            value={ai.model}
            onChange={(e) => ai.setModel(e.target.value)}
            disabled={active || !!ai.endpointUrl}
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="field-note">
            About {selected.memory.toLocaleString()} MB graphics memory. The
            recommended model produces better summaries; compact models use less
            memory. A compatible option is chosen automatically when needed.
          </p>
          <div className="endpoint-settings">
            <h3>
              <Server size={15} /> Connect your own model server
            </h3>
            <p className="field-note">
              Already use Ollama or LM Studio? Enter its chat completions URL.
              Leave this blank to run the model in your browser.
            </p>
            <label htmlFor="endpoint-url">Endpoint URL</label>
            <input
              id="endpoint-url"
              type="url"
              placeholder="http://127.0.0.1:11434/v1/chat/completions"
              value={draftUrl}
              disabled={active}
              onChange={(e) => {
                setDraftUrl(e.target.value);
                setSavedNotice("");
                setConfigError("");
              }}
            />
            <label htmlFor="endpoint-model">Model name</label>
            <input
              id="endpoint-model"
              maxLength={100}
              placeholder="qwen2.5:7b"
              value={draftModel}
              disabled={active}
              onChange={(e) => {
                setDraftModel(e.target.value);
                setSavedNotice("");
              }}
            />
            <div className="model-controls">
              <button
                className="button"
                onClick={saveEndpoint}
                disabled={active}
              >
                <Check size={14} /> Save connection
              </button>
              {ai.endpointUrl && (
                <button
                  className="text-link"
                  disabled={active}
                  onClick={() => {
                    setDraftUrl("");
                    ai.setEndpointConfig("", draftModel);
                    setSavedNotice("Using the browser model.");
                  }}
                >
                  Use browser model
                </button>
              )}
            </div>
            {configError && (
              <p className="error-message" role="alert">
                {configError}
              </p>
            )}
            {savedNotice && (
              <p className="device-status" role="status">
                {savedNotice}
              </p>
            )}
          </div>
        </details>
        <p className="model-privacy">
          Browser models download from Hugging Face and WebLLM, then process
          text on your device. Summaries cover the supplied abstract or excerpt.
          Check the source for the full picture.
        </p>
      </div>
    </section>
  );
}
