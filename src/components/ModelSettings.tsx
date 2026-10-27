import { Cpu, LoaderCircle, X } from "lucide-react";
import { MODELS } from "../local-ai";
import type { AIState } from "../hooks/useLocalAI";
export function ModelSettings({ ai }: { ai: AIState }) {
  const selected = MODELS.find((m) => m.id === ai.model);
  const active = ai.status === "loading" || ai.status === "working";
  return (
    <section className="page model-page">
      <div className="page-title">
        <div>
          <h1>Local AI</h1>
        </div>
        <span className="status-label">{ai.status}</span>
      </div>
      <div className="model-settings">
        <p>
          Summaries run in your browser. The reading desk works without them.
        </p>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={ai.preferred}
            onChange={(e) => ai.setPreferred(e.target.checked)}
          />
          Use local AI by default
        </label>
        <label htmlFor="local-model">Model</label>
        <select
          id="local-model"
          value={ai.model}
          onChange={(e) => ai.setModel(e.target.value)}
          disabled={active}
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <div className="model-specs">
          <span>
            {ai.bytes
              ? Math.round(ai.bytes / 1024 / 1024)
              : selected?.downloadMB || "Unknown"}{" "}
            MB weights{!ai.bytes ? " (estimate)" : ""}
          </span>
          <span>~{selected?.memory} MB GPU memory</span>
          <span>Browser cache</span>
        </div>
        <div className="model-controls">
          <button className="button" onClick={ai.check} disabled={ai.checking}>
            {ai.checking ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <Cpu size={14} />
            )}
            Check device & size
          </button>
          {active ? (
            <button className="button" onClick={ai.cancel}>
              <X size={14} />
              Cancel
            </button>
          ) : ai.status === "ready" ? (
            <button className="button" onClick={ai.disable}>
              Turn off
            </button>
          ) : (
            <button className="button primary" onClick={ai.enable}>
              Enable & download
            </button>
          )}
        </div>
        {ai.device && (
          <p className="device-status" role="status">
            {ai.device}
          </p>
        )}
        {ai.message && (
          <p
            className={
              ai.status === "error" ? "error-message" : "device-status"
            }
            role="status"
          >
            {ai.message}
          </p>
        )}
        {ai.status === "loading" && <progress value={ai.progress} max={1} />}
        <details className="method-details">
          <summary>Model tradeoffs & privacy</summary>
          <p>
            1.5B is recommended for summaries. Our 0.5B test invented a
            release-note claim despite valid JSON. Use the compact model for
            rough triage and check its output.
          </p>
          <p>
            Enable downloads weights from Hugging Face and the WebLLM runtime
            from GitHub. Prompts stay in the browser; there is no cloud
            inference fallback. Summaries use a supplied abstract or excerpt,
            not the full paper.
          </p>
        </details>
      </div>
    </section>
  );
}
