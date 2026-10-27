export const browserStorage = import.meta.env.VITE_STORAGE_MODE !== "server";
export async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (browserStorage) {
    const { browserRequest } = await import("./browser-client");
    return browserRequest<T>(path, method, body);
  }
  const response = await fetch(`/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json"))
    throw new Error("Backend unavailable. Check that npm start is running.");
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result;
}
