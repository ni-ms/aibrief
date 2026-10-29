export const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        ...(new Date(value).getFullYear() !== new Date().getFullYear()
          ? { year: "numeric" as const }
          : {}),
      })
    : "No date";
export function ago(value: string | null) {
  if (!value) return "Not collected";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(value)) / 60000),
  );
  return minutes < 1
    ? "Just synced"
    : minutes < 60
      ? `${minutes}m ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h ago`
        : date(value);
}
export const scope = (s: {
  sourceKind?: string;
  releaseText: string;
  sourceName: string;
  metadata?: { publicationType?: string };
}) =>
  s.metadata?.publicationType === "launch"
    ? "launch excerpt"
    : s.releaseText
      ? "release excerpt"
      : s.sourceKind === "hn" ||
          s.sourceKind === "bluesky" ||
          s.sourceKind === "reddit" ||
          s.sourceKind === "lobsters"
        ? "post"
        : s.sourceKind === "rss" ||
            s.sourceKind === "medium" ||
            s.sourceKind === "substack"
          ? "article excerpt"
          : "abstract";
