import { backup, DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const sourcePath = resolve(process.env.DB_PATH || "data/fieldnotes.sqlite");
const targetPath = resolve(
  process.argv[2] || "data/fieldnotes-browser-backup.sqlite",
);
if (!existsSync(sourcePath))
  throw new Error("The local Fieldnotes database was not found.");
if (existsSync(targetPath))
  throw new Error(
    "The backup already exists. Choose a different output filename.",
  );
mkdirSync(dirname(targetPath), { recursive: true });
const source = new DatabaseSync(sourcePath, { readOnly: true });
try {
  await backup(source, targetPath);
  console.log(
    `Backup saved to ${targetPath}. Import it through Your data → Restore a backup.`,
  );
} finally {
  source.close();
}
