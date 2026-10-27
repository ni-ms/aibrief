import { createRoot } from "react-dom/client";
import App from "./App";
import { loadPreferences } from "./lib/preferences";
const root = createRoot(document.getElementById("root")!);
root.render(
  <main style={{ padding: "3rem", fontFamily: "system-ui" }}>
    <h1>Fieldnotes</h1>
    <p>Opening your reading desk…</p>
  </main>,
);
void loadPreferences()
  .then(() => root.render(<App />))
  .catch((error) => {
    root.render(
      <main
        style={{ padding: "3rem", fontFamily: "system-ui", maxWidth: "42rem" }}
      >
        <h1>Your reading desk could not open</h1>
        <p role="alert">{error.message}</p>
        <button onClick={() => location.reload()}>Try again</button>
      </main>,
    );
  });
