import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Intercept every signal. These checks never touch real servers or process groups.
function stopFixture(
  options: {
    pid?: string;
    command?: string;
    cwd?: string;
    group?: string;
    stubborn?: boolean;
  } = {},
) {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), "fieldnotes-stop-")),
  );
  const script = join(directory, "server.sh");
  const log = join(directory, "signals");
  copyFileSync(new URL("../server.sh", import.meta.url), script);
  writeFileSync(log, "");
  if (options.pid !== undefined)
    writeFileSync(join(directory, ".server.pid"), options.pid);
  try {
    execFileSync(
      "bash",
      [
        "-c",
        `
      kill() {
        if [[ "$1" == "-0" ]]; then
          [[ -z "$stopped" || "$FIELDNOTES_TEST_STUBBORN" == "true" ]]
        else
          printf '%s\\n' "$*" >> "$FIELDNOTES_TEST_LOG"
          stopped=true
        fi
      }
      ps() {
        if [[ "$*" == *"command="* ]]; then echo "$FIELDNOTES_TEST_COMMAND";
        else echo "$FIELDNOTES_TEST_GROUP"; fi
      }
      lsof() {
        if [[ "$*" == *"-d cwd"* ]]; then printf 'n%s\\n' "$FIELDNOTES_TEST_CWD";
        else echo 99999; fi
      }
      sleep() { :; }
      source "$1" stop
    `,
        "fieldnotes-test",
        script,
      ],
      {
        env: {
          ...process.env,
          FIELDNOTES_TEST_LOG: log,
          FIELDNOTES_TEST_COMMAND: options.command ?? "npm run dev:server",
          FIELDNOTES_TEST_CWD: options.cwd ?? directory,
          FIELDNOTES_TEST_GROUP: options.group ?? "424242",
          FIELDNOTES_TEST_STUBBORN: String(options.stubborn ?? false),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return readFileSync(log, "utf8").trim().split("\n").filter(Boolean);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("stop leaves unrelated port listeners alone when no valid PID is tracked", () => {
  assert.deepEqual(stopFixture(), []);
  assert.deepEqual(stopFixture({ pid: "invalid" }), []);
});

test("stop rejects reused PIDs, another checkout, and shared process groups", () => {
  assert.deepEqual(
    stopFixture({ pid: "424242", command: "python3 unrelated.py" }),
    [],
  );
  assert.deepEqual(
    stopFixture({ pid: "424242", cwd: "/another/checkout" }),
    [],
  );
  assert.deepEqual(stopFixture({ pid: "424242", group: "123" }), []);
});

test("stop signals only its validated group and escalates only for the same leader", () => {
  assert.deepEqual(stopFixture({ pid: "424242" }), ["-TERM -424242"]);
  assert.deepEqual(stopFixture({ pid: "424242", stubborn: true }), [
    "-TERM -424242",
    "-KILL -424242",
  ]);
});
