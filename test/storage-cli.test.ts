import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir, writeFile, chmod } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FileOutbox, readState, saveState, withLock } from "../src/storage.js";
import { emptyState, configDigest } from "../src/model.js";
import { CodexProvider } from "../src/providers.js";
import { config } from "./fixtures.js";
const exec = promisify(execFile);
async function temporary(action: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "lookout-test-"));
  try { await action(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
test("atomic private state reload and corrupted state fails closed", async () => temporary(async (dir) => {
  await saveState(dir, emptyState());
  assert.deepEqual(await readState(dir, config), emptyState());
  await writeFile(join(dir, "state.json"), "{}");
  await assert.rejects(readState(dir, config), /state/u);
}));
test("lock prevents overlapping cycles", async () => temporary(async (dir) => {
  await withLock(dir, async () => {
    await assert.rejects(withLock(dir, async () => {}), /locked/u);
  });
  assert.ok(!(await readdir(dir)).includes("lock"));
}));
test("outbox is idempotent and rejects destination/path misuse", async () => temporary(async (dir) => {
  const outbox = new FileOutbox(dir, [config.groupId]);
  const id = "a".repeat(64);
  await outbox.send(config.groupId, "synthetic", id);
  await outbox.send(config.groupId, "synthetic", id);
  assert.equal((await readdir(dir)).length, 1);
  await assert.rejects(outbox.send("other", "synthetic", id));
  await assert.rejects(outbox.send(config.groupId, "changed", id), /collision/u);
  await assert.rejects(outbox.send(config.groupId, "synthetic", "../bad"));
}));
test("CLI defaults to no-write preview; approval, local commit, pause and terminate work", async () => temporary(async (dir) => {
  const stateDir = join(dir, "state");
  const configFile = join(dir, "config.json");
  await writeFile(configFile, JSON.stringify(config));
  const cli = resolve("dist/src/cli.js");
  const args = ["--config", configFile, "--state", stateDir];
  const run = async (...more: string[]) => JSON.parse((await exec(process.execPath, [cli, "run", ...args, ...more])).stdout) as { mode: string; text: string | null; reason: string };
  assert.equal((await run()).mode, "dry-run");
  assert.deepEqual(await readdir(dir), ["config.json"]);
  await assert.rejects(exec(process.execPath, [cli, "approve", ...args, "--digest", "wrong"]));
  await exec(process.execPath, [cli, "approve", ...args, "--digest", configDigest(config)]);
  assert.equal((await run("--commit")).mode, "local-commit");
  assert.equal((await readdir(join(stateDir, "outbox"))).length, 1);
  assert.equal((await run("--commit")).reason, "not-due");
  await exec(process.execPath, [cli, "pause", ...args]);
  assert.equal((await run("--commit")).reason, "paused");
  await exec(process.execPath, [cli, "terminate", ...args]);
  assert.equal((await run()).reason, "terminated");
  await assert.rejects(exec(process.execPath, [cli, "pause", ...args]));
  await assert.rejects(exec(process.execPath, [cli, "approve", ...args, "--digest", configDigest(config)]));
}));
test("Codex CLI contract with synthetic executable, no account or network used", async () => temporary(async (dir) => {
  const executable = join(dir, "codex");
  await writeFile(executable, `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args.includes("--help")) { console.log("--ignore-user-config --ignore-rules --strict-config --ephemeral --output-schema"); process.exit(0); }
if (!args.includes("read-only") || !args.includes("features.shell_tool=false")) process.exit(2);
let prompt = "";
process.stdin.on("data", x => prompt += x);
process.stdin.on("end", () => {
  if (!prompt.includes("untrusted quoted DATA")) process.exit(3);
  fs.writeFileSync(args[args.indexOf("--output-last-message") + 1], JSON.stringify({ findings: [] }));
});
`);
  await chmod(executable, 0o700);
  const old = process.env.PATH;
  process.env.PATH = dir + ":" + (old ?? "");
  try {
    const result = await new CodexProvider().research({ config, messages: [], previousFindings: [], now: "2026-01-01T00:00:00Z" });
    assert.deepEqual(result, { findings: [] });
  } finally { process.env.PATH = old; }
  assert.ok(await readFile(executable, "utf8"));
}));
