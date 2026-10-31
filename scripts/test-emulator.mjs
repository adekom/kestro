// Runs the emulator test suite in its own emulators (firebase.test.json).
//
// The Storage emulator keeps files in <OS temp>/firebase/storage and deletes
// that folder on shutdown. Pointing this run at a private temp folder stops a
// test run from wiping (and crashing) the development emulators' storage.
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const tmp = join(process.cwd(), ".emulator-tmp-test");
mkdirSync(tmp, { recursive: true });
const env = { ...process.env, TEMP: tmp, TMP: tmp, TMPDIR: tmp };

const command =
  'npx firebase emulators:exec --config firebase.test.json --project demo-kestro-test --only auth,firestore,storage "vitest run --project emulator"';
const result = spawnSync(command, { stdio: "inherit", env, shell: true });
rmSync(tmp, { recursive: true, force: true });
process.exit(result.status ?? 1);
