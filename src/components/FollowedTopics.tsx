import { useState } from "react";
import type { DiscoveryProvider, FollowedTopic } from "../../shared/types.ts";
import { ago } from "../lib/format";
export function FollowedTopics({
  topics,
  providers,
  onUpdate,
  onRemove,
}: {
  topics: FollowedTopic[];
  providers: DiscoveryProvider[];
  onUpdate: (
    id: string,
    patch: { name?: string; paused?: boolean },
  ) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function change(id: string, action: () => Promise<void>) {
    setBusy(id);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="followed-topics" aria-label="Followed topics">
      <h2>Topics you follow</h2>
      <p className="field-note">
        Search in Discover to preview and follow a new topic. Active topics
        refresh about every six hours while Fieldnotes is running.
      </p>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {!topics.length && <p>No topics followed yet.</p>}
      {topics.map((topic) => (
        <article className="topic-card" key={topic.id}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(
                new FormData(e.currentTarget).get("name") || "",
              ).trim();
              if (name && name !== topic.name)
                void change(topic.id, () => onUpdate(topic.id, { name }));
            }}
          >
            <label htmlFor={`topic-${topic.id}`}>Topic name</label>
            <input
              id={`topic-${topic.id}`}
              key={topic.name}
              name="name"
              defaultValue={topic.name}
              maxLength={160}
              required
            />
            <button className="button" disabled={busy === topic.id}>
              Rename
            </button>
          </form>
          <p>
            Query: {topic.query}
            {topic.paused ? " · Paused" : ""}
          </p>
          {topic.providers.map((id) => {
            const check = topic.checks[id];
            return (
              <div className="topic-check" key={id}>
                <span>{providers.find((p) => p.id === id)?.name || id}</span>
                <span>
                  Last success: {ago(check?.lastSuccess || null)}
                  {check?.error && (
                    <span className="error-text" role="status">
                      {" "}
                      · {check.error}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
          <div className="topic-actions">
            <button
              className="button"
              disabled={busy === topic.id}
              onClick={() =>
                void change(topic.id, () =>
                  onUpdate(topic.id, { paused: !topic.paused }),
                )
              }
            >
              {topic.paused ? "Resume" : "Pause"}
            </button>
            <button
              className="text-link"
              disabled={busy === topic.id}
              onClick={() => void change(topic.id, () => onRemove(topic.id))}
            >
              Remove topic
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
