// Thirty suggestions with 2,000-character messages and optional 500-character URLs.
export const FEEDBACK_HISTORY_LIMIT = 30;
// Allow JSON escaping as well as ordinary text in every entry.
export const FEEDBACK_LOG_LIMIT = FEEDBACK_HISTORY_LIMIT * 16_000;

/** Only the project owner's public Google Form can be opened by feedback UI. */
export function googleFormUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "docs.google.com" ||
      url.port ||
      url.username ||
      url.password ||
      !/^\/forms\/d\/e\/[A-Za-z0-9_-]+\/viewform\/?$/.test(url.pathname)
    )
      return null;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
