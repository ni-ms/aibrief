import { useState } from "react";
import { ArrowUpRight, RefreshCw, X } from "lucide-react";
import { useTrail } from "../hooks/useTrail";
import { compareVersions } from "../../shared/trail.ts";
import type { TrailLink } from "../../shared/types.ts";
import { ago, date } from "../lib/format";
export function ResearchTrail({ groupId }: { groupId: number }) {
  const { trail, error, refresh, add, hide } = useTrail(groupId);
  const [from, setFrom] = useState<number | null>(null),
    [kind, setKind] = useState<"code" | "followup">("code"),
    [url, setUrl] = useState(""),
    [title, setTitle] = useState(""),
    [note, setNote] = useState(""),
    [formError, setFormError] = useState(""),
    [adding, setAdding] = useState(false),
    [undo, setUndo] = useState<string | null>(null);
  if (!trail)
    return (
      <div className="summary-empty" role="status">
        {error || "Loading research trail…"}
      </div>
    );
  const latest = trail.versions[0],
    previous = trail.versions.find(
      (v) => v.version === (from || trail.versions[1]?.version),
    );
  const changes = latest && previous ? compareVersions(previous, latest) : null;
  const remove = async (link: TrailLink) => {
    try {
      await hide(link.id, true);
      setUndo(link.id);
    } catch (e) {
      setFormError((e as Error).message);
    }
  };
  const renderLink = (link: TrailLink) => (
    <li key={link.id} className="trail-link">
      <div>
        <a href={link.url} target="_blank" rel="noreferrer">
          {link.title}
          <ArrowUpRight size={12} />
        </a>
        {link.relation === "user" && (
          <button
            aria-label={`Hide ${link.title}`}
            title="Hide link"
            onClick={() => void remove(link)}
          >
            <X size={12} />
          </button>
        )}
      </div>
      <span>
        {link.relation === "paper-linked"
          ? `Linked in paper${link.linkedVersion ? " v" + link.linkedVersion : ""}`
          : link.relation === "release-linked"
            ? "Repository source links this paper"
            : link.relation === "cites"
              ? "Cites this paper"
              : link.relation === "mentions"
                ? "Explicitly mentions this paper"
                : "Added by you"}
        {link.available ? " · repository verified" : ""}
        {link.publishedAt
          ? " · " + date(link.publishedAt)
          : !link.publishedAt && link.year
            ? " · " + link.year
            : ""}
      </span>
      <a
        className="trail-evidence"
        href={link.evidenceUrl}
        target="_blank"
        rel="noreferrer"
        title={link.evidenceText}
      >
        Evidence <ArrowUpRight size={10} />
      </a>
      {link.release && (
        <p>
          <a href={link.release.url} target="_blank" rel="noreferrer">
            Latest release: {link.release.title} <ArrowUpRight size={10} />
          </a>
        </p>
      )}
      {link.error && (
        <p className="trail-warning">
          Repository check failed; source link retained.
        </p>
      )}
    </li>
  );
  return (
    <section className="research-trail" aria-label="Research trail">
      <div className="trail-heading">
        <h3>Research trail</h3>
        <button
          className="button"
          onClick={refresh}
          disabled={trail.refreshing}
        >
          <RefreshCw size={12} className={trail.refreshing ? "spin" : ""} />
          {trail.refreshing ? "Checking" : "Update trail"}
        </button>
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <section className="trail-section">
        <h4>
          Code <span>{trail.code.length}</span>
        </h4>
        {trail.code.length ? (
          <ul>{trail.code.map(renderLink)}</ul>
        ) : (
          <p className="field-note">
            No code link found in the supplied metadata.
          </p>
        )}
      </section>
      <section className="trail-section">
        <h4>Versions & changes</h4>
        {latest ? (
          <>
            <div className="version-list">
              {trail.versions.map((v) => (
                <a
                  key={v.version}
                  href={v.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  v{v.version}
                  <span>{date(v.updatedAt)}</span>
                  <ArrowUpRight size={10} />
                </a>
              ))}
            </div>
            {previous && (
              <label className="compare-label">
                Compare v{latest.version} with{" "}
                <select
                  aria-label="Compare version"
                  value={previous.version}
                  onChange={(e) => setFrom(Number(e.target.value))}
                >
                  {trail.versions
                    .filter((v) => v.version !== latest.version)
                    .map((v) => (
                      <option key={v.version} value={v.version}>
                        v{v.version}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {changes && (
              <div className="version-changes">
                <p className="field-note">
                  Title, abstract and author comments only. Full PDFs were not
                  compared.
                </p>
                {changes.titleChanged && (
                  <p>
                    <strong>Title changed</strong>
                    <del>{previous!.title}</del>
                    <ins>{latest.title}</ins>
                  </p>
                )}
                {changes.removedSentences.map((s, i) => (
                  <del key={`r-${i}`}>{s}</del>
                ))}
                {changes.addedSentences.map((s, i) => (
                  <ins key={`a-${i}`}>{s}</ins>
                ))}
                {changes.commentChanged && (
                  <details>
                    <summary>Author comments changed</summary>
                    <del>{previous!.comment || "(none)"}</del>
                    <ins>{latest.comment || "(none)"}</ins>
                  </details>
                )}
                {changes.codeAdded.map((u) => (
                  <p key={u}>
                    Code link added:{" "}
                    <a href={u} target="_blank" rel="noreferrer">
                      {u}
                    </a>
                  </p>
                ))}
                {changes.codeRemoved.map((u) => (
                  <p key={u}>Code link removed from metadata: {u}</p>
                ))}
                {!changes.abstractChanged &&
                  !changes.titleChanged &&
                  !changes.commentChanged && (
                    <p>
                      No title, abstract or comment changes reported between v
                      {changes.from} and v{changes.to}. Other parts of the paper
                      may have changed.
                    </p>
                  )}
                {changes.truncated && (
                  <p className="field-note">
                    Some changes omitted here; open both versions for the full
                    excerpts.
                  </p>
                )}
              </div>
            )}
            {!previous && (
              <p className="field-note">
                {latest.version === 1
                  ? "First version."
                  : "Only this version is currently available in the trail."}
              </p>
            )}
          </>
        ) : (
          <p className="field-note">
            {trail.refreshing
              ? "Checking the versioned source…"
              : "No version record collected. Version history is available for arXiv papers."}
          </p>
        )}
      </section>
      <section className="trail-section">
        <h4>
          Follow-ups <span>{trail.followUps.length}</span>
        </h4>
        {trail.followUps.length ? (
          <>
            <ul>{trail.followUps.map(renderLink)}</ul>
            <p className="field-note">
              Citations and explicit links; not proof of an extension or
              endorsement.
              {trail.citationsPartial ? " The citation result is partial." : ""}
            </p>
          </>
        ) : (
          <p className="field-note">
            No follow-up links collected yet. This is not a complete citation
            index.
          </p>
        )}
      </section>
      <details className="trail-checks">
        <summary>Source checks</summary>
        {Object.entries(trail.checks).map(([name, check]) => (
          <div key={name}>
            <strong>
              {name === "versions"
                ? "arXiv"
                : name === "code"
                  ? "GitHub"
                  : "Semantic Scholar"}
            </strong>
            <span>
              Last success:{" "}
              {check.lastSuccess ? ago(check.lastSuccess) : "never"}
            </span>
            {check.error && <p>{check.error}</p>}
          </div>
        ))}
        {!Object.keys(trail.checks).length && (
          <p>No external checks completed yet.</p>
        )}
      </details>
      {Object.values(trail.checks).some((c) => c.error) && (
        <p className="trail-warning">
          Some sources are unavailable. Existing evidence is preserved; see
          Source checks.
        </p>
      )}
      <details className="add-trail">
        <summary>Add a known link</summary>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setAdding(true);
            setFormError("");
            try {
              await add({ kind, url, title, note });
              setUrl("");
              setTitle("");
              setNote("");
            } catch (e) {
              setFormError((e as Error).message);
            } finally {
              setAdding(false);
            }
          }}
        >
          <label>
            Relationship
            <select
              aria-label="Link relationship"
              value={kind}
              onChange={(e) => setKind(e.target.value as "code" | "followup")}
            >
              <option value="code">Code</option>
              <option value="followup">Follow-up</option>
            </select>
          </label>
          <label>
            Title
            <input
              aria-label="Trail link title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={300}
              required
            />
          </label>
          <label>
            URL
            <input
              aria-label="Trail link URL"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </label>
          <label>
            Note{" "}
            <input
              aria-label="Trail link note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </label>
          <button className="button" disabled={adding}>
            {adding ? "Saving" : "Add link"}
          </button>
        </form>
      </details>
      {formError && (
        <p role="alert" className="error-message">
          {formError}
        </p>
      )}
      {undo && (
        <button
          className="text-link"
          onClick={() => void hide(undo, false).then(() => setUndo(null))}
        >
          Undo hidden link
        </button>
      )}
    </section>
  );
}
