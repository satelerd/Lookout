import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { privateHome, readPrivate, writePrivate } from "../src/private.js";
import {
  configure,
  previewOnboarding,
  approveOnboarding,
} from "../src/onboarding.js";
import { FileOutbox, readState, saveState, withLock } from "../src/storage.js";
import { emptyState } from "../src/model.js";
import { syntheticAnswers } from "../src/walkthrough.js";
import { config } from "./fixtures.js";

const exec = promisify(execFile);
const cli = resolve("dist/src/cli.js");
async function fixture(
  action: (home: string, repo: string, root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "lookout-boundary-test-"));
  try {
    const repo = join(root, "checkout"),
      home = join(root, "private");
    await mkdir(repo);
    await writeFile(join(repo, ".git"), "synthetic marker");
    await privateHome(home, repo, true);
    await configure(home, syntheticAnswers());
    await action(home, repo, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("nested outbox symlinks fail before CLI writes private output", async () =>
  fixture(async (home, repo, root) => {
    const preview = await previewOnboarding(home);
    await approveOnboarding(
      home,
      "approve-local:" + preview.checkpoint.previewDigest,
    );
    const before = await readFile(join(home, "runtime", "state.json"), "utf8");
    for (const target of [repo, join(root, "outside")]) {
      await mkdir(target, { recursive: true });
      const files = await readdir(target);
      await symlink(target, join(home, "runtime", "outbox"), "dir");
      await assert.rejects(
        exec(process.execPath, [cli, "run", "--home", home, "--commit"]),
        /symlink/u,
      );
      await assert.rejects(privateHome(home, repo), /symlink/u);
      assert.deepEqual(await readdir(target), files);
      assert.equal(
        await readFile(join(home, "runtime", "state.json"), "utf8"),
        before,
      );
      await rm(join(home, "runtime", "outbox"));
    }
  }));

test("onboarding rejects a substituted runtime before changing any private agreement", async () =>
  fixture(async (home, repo) => {
    const preview = await previewOnboarding(home);
    const before = await readFile(join(home, "profile.json"), "utf8");
    await rm(join(home, "runtime"), { recursive: true });
    await symlink(repo, join(home, "runtime"), "dir");
    const changed = syntheticAnswers() as { config: { objective: string } };
    changed.config.objective = "Another synthetic objective";
    await assert.rejects(configure(home, changed), /symlink/u);
    await assert.rejects(
      approveOnboarding(
        home,
        "approve-local:" + preview.checkpoint.previewDigest,
      ),
      /symlink/u,
    );
    assert.equal(await readFile(join(home, "profile.json"), "utf8"), before);
    assert.deepEqual(await readdir(repo), [".git"]);
  }));

test("private state, receipts, and root files reject symlinks at point of use", async () =>
  fixture(async (home, _repo, root) => {
    const target = join(root, "target.json");
    await writeFile(target, JSON.stringify(emptyState()));
    const runtime = join(home, "runtime");
    await rm(join(runtime, "state.json"));
    await symlink(target, join(runtime, "state.json"));
    await assert.rejects(readState(runtime, config), /symlink/u);
    await assert.rejects(saveState(runtime, emptyState()), /symlink/u);
    await symlink(target, join(home, "test.json"));
    await assert.rejects(readPrivate(home, "test.json"), /symlink/u);
    await assert.rejects(
      writePrivate(home, "test.json", { private: true }),
      /symlink/u,
    );
    const outbox = join(runtime, "outbox"),
      id = "a".repeat(64);
    await mkdir(outbox);
    await symlink(target, join(outbox, id + ".json"));
    await assert.rejects(
      new FileOutbox(outbox, [config.groupId]).send(
        config.groupId,
        "synthetic",
        id,
      ),
      /symlink/u,
    );
    assert.equal(await readFile(target, "utf8"), JSON.stringify(emptyState()));
  }));

test("onboarding and runtime mutations contend on the same runtime lock", async () =>
  fixture(async (home, _repo, root) => {
    const preview = await previewOnboarding(home);
    const beforeConfig = await readFile(join(home, "config.json"), "utf8");
    const beforeState = await readFile(
      join(home, "runtime", "state.json"),
      "utf8",
    );
    const answers = join(root, "answers.json");
    const changed = syntheticAnswers() as { config: { objective: string } };
    changed.config.objective = "Another synthetic objective";
    await writeFile(answers, JSON.stringify(changed));
    const calls = [
      ["onboard", "configure", "--file", answers],
      [
        "onboard",
        "approve",
        "--confirm",
        "approve-local:" + preview.checkpoint.previewDigest,
      ],
      ["run", "--commit"],
      ["pause"],
      ["terminate"],
      ["pause", "--state", join(home, "runtime")],
    ];
    await withLock(join(home, "runtime"), async () => {
      for (const args of calls) {
        await assert.rejects(
          exec(process.execPath, [cli, ...args, "--home", home]),
          /locked/u,
        );
      }
      assert.equal(
        await readFile(join(home, "config.json"), "utf8"),
        beforeConfig,
      );
      assert.equal(
        await readFile(join(home, "runtime", "state.json"), "utf8"),
        beforeState,
      );
    });
    await exec(process.execPath, [
      cli,
      "onboard",
      "configure",
      "--file",
      answers,
      "--home",
      home,
    ]);
    assert.notEqual(
      await readFile(join(home, "config.json"), "utf8"),
      beforeConfig,
    );
  }));
