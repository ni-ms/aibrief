type Request = {
  params: Record<string, string>;
  query: Record<string, string>;
  body: any;
};
type Result = { status: number; body: unknown };
type Response = {
  status(code: number): Response;
  json(body: unknown): Response;
};
type Handler = (request: Request, response: Response) => unknown;

/** The same validated operations run over HTTP or inside the database worker. */
export function Router() {
  const routes: { method: string; parts: string[]; handle: Handler }[] = [];
  const register = (method: string) => (path: string, handle: Handler) => {
    routes.push({ method, parts: path.split("/"), handle });
  };
  return {
    get: register("GET"),
    post: register("POST"),
    put: register("PUT"),
    patch: register("PATCH"),
    delete: register("DELETE"),
    async dispatch(
      path: string,
      method: string,
      body?: unknown,
    ): Promise<Result | undefined> {
      const url = new URL(path, "https://fieldnotes.invalid");
      const parts = url.pathname.split("/");
      for (const route of routes) {
        if (route.method !== method || route.parts.length !== parts.length)
          continue;
        const params: Record<string, string> = {};
        if (
          !route.parts.every((part, i) => {
            if (!part.startsWith(":")) return part === parts[i];
            params[part.slice(1)] = decodeURIComponent(parts[i]);
            return true;
          })
        )
          continue;
        const result: Result = { status: 200, body: null };
        const response: Response = {
          status(code) {
            result.status = code;
            return response;
          },
          json(value) {
            result.body = value;
            return response;
          },
        };
        await route.handle(
          { params, query: Object.fromEntries(url.searchParams), body },
          response,
        );
        return result;
      }
    },
  };
}
