/** Accept a community name or its public Reddit URL, never arbitrary feed hosts. */
export function normalizeSubreddit(input: string): string {
  let value = input.trim();
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !["reddit.com", "www.reddit.com", "old.reddit.com"].includes(
        url.hostname,
      ) ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    )
      throw new Error("Use a subreddit name or public Reddit community URL");
    value = url.pathname;
  }
  value = value.replace(/^\/?r\//i, "").replace(/\/$/, "");
  if (!/^[A-Za-z0-9][A-Za-z0-9_]{1,20}$/.test(value))
    throw new Error(
      "Use one subreddit name, such as MachineLearning or r/LocalLLaMA",
    );
  return value.toLowerCase();
}
