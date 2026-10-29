export type Theme = "light" | "dark";

/** A saved choice wins; a new workspace starts in dark mode. */
export function initialTheme(saved: string | null): Theme {
  return saved === "light" ? "light" : "dark";
}
