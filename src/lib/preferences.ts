import { api } from "./api";
let values: Record<string, string> = {};
export async function loadPreferences() {
  values = await api("/preferences");
}
export const preferences = {
  get(key: string) {
    return values[key] ?? null;
  },
  async save(key: string, value: string) {
    await api(`/preferences/${encodeURIComponent(key)}`, "PUT", { value });
    values[key] = value;
  },
  set(key: string, value: string) {
    values[key] = value;
    void api(`/preferences/${encodeURIComponent(key)}`, "PUT", { value }).catch(
      (error) => {
        window.dispatchEvent(
          new CustomEvent("fieldnotes:storage-error", {
            detail: error.message,
          }),
        );
      },
    );
  },
};
