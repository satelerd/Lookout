import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  assertOutsideCheckout,
  privateHome,
  readPrivate,
} from "../src/private.js";
import {
  configure,
  initOnboarding,
  previewOnboarding,
  approveOnboarding,
  onboarding,
} from "../src/onboarding.js";
import {
  scanPublic,
  redactProse,
  assertPublic,
  allowedExportPath,
} from "../src/privacy.js";
import {
  discover,
  decideGap,
  prepareBundle,
  reviewBundle,
  consentBundle,
  publishBundle,
  type Run,
} from "../src/contribution.js";
import { planUpdate, switchUpdate } from "../src/updates.js";
import { walkthrough, syntheticAnswers } from "../src/walkthrough.js";
const exec = promisify(execFile);
async function fixture(
  action: (home: string, repo: string, root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "lookout-workflow-test-"));
  try {
    const repo = join(root, "checkout"),
      home = join(root, "private");
    await mkdir(join(repo, "src"), { recursive: true });
    await writeFile(join(repo, ".git"), "synthetic marker");
    await privateHome(home, repo, true);
    await configure(home, syntheticAnswers());
    await action(home, repo, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
const repoName = "demo/lookout",
  base = "a".repeat(40);
async function bundleFixture(
  home: string,
  repo: string,
  summary = "Synthetic feature",
  sourceRepository?: string,
): Promise<string> {
  const runner: Run = async (command, args) =>
    command === "git" ? "+safe synthetic source\n" : "[]";
  const d = await discover(home, repoName, "privacy", runner);
  await decideGap(home, d.digest, "new-work", "review-gap:" + d.digest);
  await writeFile(
    join(repo, "src", "feature.ts"),
    "export const publicFeature = true;\n",
  );
  const b = await prepareBundle(
    home,
    repo,
    {
      repository: repoName,
      ...(sourceRepository ? { sourceRepository } : {}),
      feature: "privacy",
      baseSha: base,
      paths: ["src/feature.ts"],
      summary,
      validation: "Synthetic tests only",
    },
    runner,
  );
  return b.id;
}
test("full synthetic install-to-draft-contribution tour never uses a real account or duplicates", async () => {
  const result = (await walkthrough()) as Record<string, unknown>;
  for (const field of [
    "resumePreservedCheckpoint",
    "insufficientConsentBlocked",
    "prematurePublicationBlocked",
    "secretExportBlocked",
    "reportRedacted",
    "duplicatePublicationAvoided",
    "privateDataOutsideCheckout",
  ])
    assert.equal(result[field], true, field);
  assert.equal(result.publicNetworkUsed, false);
  assert.equal(result.createdMockPRs, 1);
  assert.equal(result.repeatedTriageDrafts, 0);
  assert.deepEqual(result.missing, ["whatsapp", "scheduler"]);
});
test("private storage rejects checkout, other Git roots and symlink aliases", async () =>
  fixture(async (home, repo, root) => {
    await assert.rejects(
      privateHome(join(repo, "private-data"), repo, true),
      /outside/u,
    );
    const alias = join(root, "alias");
    await symlink(repo, alias);
    await assert.rejects(
      assertOutsideCheckout(join(alias, "new-data"), repo),
      /outside/u,
    );
    await symlink(home, join(root, "home-alias"));
    await assert.rejects(
      privateHome(join(root, "home-alias"), repo),
      /symlink/u,
    );
    const other = join(root, "other");
    await mkdir(other);
    await writeFile(join(other, ".git"), "");
    await assert.rejects(
      assertOutsideCheckout(join(other, "data"), repo),
      /another/u,
    );
  }));
test("onboarding resumes, rejects generic consent and invalidates review after owner changes", async () =>
  fixture(async (home) => {
    const before = await onboarding(home);
    assert.deepEqual(await initOnboarding(home), before);
    assert.deepEqual(await configure(home, syntheticAnswers()), before);
    await assert.rejects(approveOnboarding(home, "yes"), /preview/u);
    const preview = await previewOnboarding(home);
    await assert.rejects(approveOnboarding(home, "yes"), /Insufficient/u);
    await approveOnboarding(
      home,
      "approve-local:" + preview.checkpoint.previewDigest,
    );
    const changed = syntheticAnswers() as { config: { objective: string } };
    changed.config.objective = "Changed owner search";
    const next = await configure(home, changed);
    assert.equal(next.stage, "configured");
    assert.equal(next.previewDigest, null);
    await assert.rejects(
      approveOnboarding(
        home,
        "approve-local:" + preview.checkpoint.previewDigest,
      ),
    );
  }));
test("a home cannot mix another group's private history", async () =>
  fixture(async (home) => {
    const changed = syntheticAnswers() as {
      config: { groupId: string; allowedGroupIds: string[] };
    };
    changed.config.groupId = "other-synthetic";
    changed.config.allowedGroupIds = ["other-synthetic"];
    await assert.rejects(configure(home, changed), /different group/u);
  }));
test("secret/PII scans redact prose, reject source and never echo matching values", () => {
  const values = [
    "ghp_" + "x".repeat(30),
    ["fictional", "example.test"].join("@"),
    "+" + "123456789012",
    "-----BEGIN " + "PRIVATE KEY-----",
    "123456789" + "@g.us",
    "/Users/" + "fictional/private",
    "Fictional Private Label",
  ];
  for (const value of values) {
    assert.ok(scanPublic(value, ["Fictional Private Label"]).length);
    assert.equal(redactProse(value, ["Fictional Private Label"]), "[REDACTED]");
    assert.throws(
      () => assertPublic(value, ["Fictional Private Label"]),
      (e: unknown) => e instanceof Error && !e.message.includes(value),
    );
  }
  assert.ok(allowedExportPath("test/feature.test.ts"));
  for (const path of [
    ".env",
    "sessions/auth.json",
    "src/../config.json",
    "src/link.local.ts",
    "examples/profile.json",
    "/src/feature.ts",
  ])
    assert.equal(allowedExportPath(path), false, path);
});
test("export needs gap review and excludes symlink/private paths and removed secrets", async () =>
  fixture(async (home, repo, root) => {
    const args = {
      repository: repoName,
      feature: "privacy",
      baseSha: base,
      paths: ["src/feature.ts"],
      summary: "Synthetic",
      validation: "Synthetic",
    };
    await assert.rejects(prepareBundle(home, repo, args), /Discover/u);
    const discovery = await discover(
      home,
      repoName,
      "privacy",
      async () => "[]",
    );
    await assert.rejects(decideGap(home, discovery.digest, "new-work", "yes"));
    await decideGap(
      home,
      discovery.digest,
      "new-work",
      "review-gap:" + discovery.digest,
    );
    await assert.rejects(
      prepareBundle(home, repo, { ...args, paths: [".env"] }),
      /allowlist/u,
    );
    const target = join(root, "private-source");
    await writeFile(target, "safe");
    await symlink(target, join(repo, "src", "feature.ts"));
    await assert.rejects(
      prepareBundle(home, repo, args, async () => ""),
      /symlink/u,
    );
    await rm(join(repo, "src", "feature.ts"));
    await writeFile(
      join(repo, "src", "feature.ts"),
      "export const safe = true;\n",
    );
    await assert.rejects(
      prepareBundle(home, repo, args, async () => "-ghp_" + "x".repeat(30)),
      /blocked/u,
    );
    await writeFile(join(repo, "src", "feature.ts"), "Fictional Private Label");
    await assert.rejects(
      prepareBundle(home, repo, args, async () => ""),
      /blocked/u,
    );
  }));
test("bundle review and exact account/scope consent required; expires and cannot survive tampering", async () =>
  fixture(async (home, repo) => {
    const id = await bundleFixture(home, repo);
    await assert.rejects(
      consentBundle(home, id, "synthetic-contributor", "yes"),
      /Inspect/u,
    );
    await reviewBundle(home, id);
    await assert.rejects(
      consentBundle(home, id, "synthetic-contributor", "yes"),
      /Insufficient/u,
    );
    await consentBundle(
      home,
      id,
      "synthetic-contributor",
      "publish-one-draft:" + id + ":" + repoName + ":synthetic-contributor",
      new Date("2000-01-01T00:00:00Z"),
    );
    await assert.rejects(
      publishBundle(home, id, async () => {
        throw new Error("must not contact remote");
      }),
      /current/u,
    );
    const body = (await readPrivate(home, "bundle-" + id + ".json")) as {
      draft: string;
    };
    body.draft += "changed";
    await writeFile(join(home, "bundle-" + id + ".json"), JSON.stringify(body));
    await assert.rejects(reviewBundle(home, id), /changed/u);
  }));
test("publication rejects wrong auth identity before mutation", async () =>
  fixture(async (home, repo) => {
    const id = await bundleFixture(home, repo);
    await reviewBundle(home, id);
    await consentBundle(
      home,
      id,
      "synthetic-contributor",
      "publish-one-draft:" + id + ":" + repoName + ":synthetic-contributor",
    );
    let calls = 0;
    await assert.rejects(
      publishBundle(home, id, async () => {
        calls++;
        return JSON.stringify({ login: "other", id: 2, type: "User" });
      }),
      /account/u,
    );
    assert.equal(calls, 1);
  }));
test("uncertain remote creation reserves and blocks replay", async () =>
  fixture(async (home, repo) => {
    const id = await bundleFixture(home, repo);
    await reviewBundle(home, id);
    await consentBundle(
      home,
      id,
      "synthetic-contributor",
      "publish-one-draft:" + id + ":" + repoName + ":synthetic-contributor",
    );
    const runner: Run = async (_command, args) => {
      const path = args[1]!;
      if (path === "user")
        return JSON.stringify({
          login: "synthetic-contributor",
          id: 1,
          type: "User",
        });
      if (path === "repos/" + repoName)
        return JSON.stringify({
          full_name: repoName,
          private: false,
          default_branch: "main",
        });
      if (path.endsWith("/git/ref/heads/main"))
        return JSON.stringify({ object: { sha: base } });
      if (path.endsWith("/git/commits/" + base))
        return JSON.stringify({ tree: { sha: "b".repeat(40) } });
      if (path.includes("/pulls?")) return "[]";
      throw new Error("unknown remote result");
    };
    await assert.rejects(publishBundle(home, id, runner));
    await assert.rejects(
      publishBundle(home, id, async () => {
        throw new Error("must not retry");
      }),
      /unresolved/u,
    );
  }));
test("CLI full local onboarding writes private data outside checkout and rejects in-checkout state", async () =>
  fixture(async (home, repo, root) => {
    const answers = join(root, "answers.json");
    await writeFile(answers, JSON.stringify(syntheticAnswers()));
    const cli = resolve("dist/src/cli.js");
    const call = async (...args: string[]) =>
      JSON.parse(
        (await exec(process.execPath, [cli, ...args, "--home", home])).stdout,
      ) as any;
    assert.equal(
      (await call("onboard", "configure", "--file", answers)).stage,
      "configured",
    );
    const preview = await call("onboard", "preview");
    await assert.rejects(call("onboard", "approve", "--confirm", "yes"));
    await call(
      "onboard",
      "approve",
      "--confirm",
      "approve-local:" + preview.checkpoint.previewDigest,
    );
    assert.equal((await call("run", "--commit")).mode, "local-commit");
    assert.equal((await readdir(join(home, "runtime", "outbox"))).length, 1);
    assert.equal((await call("run", "--commit")).reason, "not-due");
    await assert.rejects(
      call("run", "--state", join(process.cwd(), "private-state")),
    );
    assert.ok(await readFile(join(home, "config.json"), "utf8"));
  }));
test("adoption and rollback switch only reviewed immutable code, preserving private files", async () => {
  const root = await mkdtemp(join(tmpdir(), "lookout-update-test-"));
  try {
    const repo = join(root, "checkout"),
      home = join(root, "private");
    await mkdir(join(repo, "src"), { recursive: true });
    const isolated: Run = async (command, args, cwd) =>
      (
        await exec(command, args, {
          cwd: cwd ?? repo,
          env: {
            ...process.env,
            GIT_CONFIG_GLOBAL: "/dev/null",
            GIT_CONFIG_NOSYSTEM: "1",
          },
        })
      ).stdout;
    const git = async (...args: string[]) =>
      (await exec("git", args, { cwd: repo })).stdout.trim();
    await git("init", "--quiet");
    const commit = async () => {
      await git("add", ".");
      await git(
        "-c",
        "user.name=Synthetic",
        "-c",
        "user.email=synthetic" + "@example.test",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "core.hooksPath=/dev/null",
        "commit",
        "-qm",
        "Synthetic fixture",
      );
      return git("rev-parse", "HEAD");
    };
    await writeFile(
      join(repo, "src", "feature.ts"),
      "export const feature = 1;\n",
    );
    const from = await commit();
    await writeFile(
      join(repo, "src", "feature.ts"),
      "export const feature = 2;\n",
    );
    const to = await commit();
    await git("-c", "core.hooksPath=/dev/null", "switch", "--detach", from);
    await privateHome(home, repo, true);
    await configure(home, syntheticAnswers());
    const before = await readFile(join(home, "config.json"), "utf8");
    const plan = await planUpdate(home, repo, to, isolated);
    await assert.rejects(
      switchUpdate(home, repo, plan.id, "adopt", "yes", isolated),
    );
    await switchUpdate(
      home,
      repo,
      plan.id,
      "adopt",
      "adopt-code:" + plan.id,
      isolated,
    );
    assert.equal(await git("rev-parse", "HEAD"), to);
    await switchUpdate(
      home,
      repo,
      plan.id,
      "rollback",
      "rollback-code:" + plan.id,
      isolated,
    );
    assert.equal(await git("rev-parse", "HEAD"), from);
    assert.equal(await readFile(join(home, "config.json"), "utf8"), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fork ownership and public target cannot be inferred from a contributor request", async () =>
  fixture(async (home, repo) => {
    const id = await bundleFixture(
      home,
      repo,
      "Synthetic feature",
      "synthetic-contributor/lookout",
    );
    await reviewBundle(home, id);
    await consentBundle(
      home,
      id,
      "synthetic-contributor",
      "publish-one-draft:" + id + ":" + repoName + ":synthetic-contributor",
    );
    let writes = 0;
    const runner: Run = async (_command, args) => {
      if (args.includes("--method")) writes++;
      const path = args[1];
      if (path === "user")
        return JSON.stringify({
          login: "synthetic-contributor",
          id: 1,
          type: "User",
        });
      if (path === "repos/" + repoName)
        return JSON.stringify({
          full_name: repoName,
          private: false,
          default_branch: "main",
        });
      return JSON.stringify({
        full_name: "synthetic-contributor/lookout",
        private: false,
        fork: true,
        parent: { full_name: repoName },
        owner: { login: "other-account" },
      });
    };
    await assert.rejects(
      publishBundle(home, id, runner),
      /existing public fork/u,
    );
    assert.equal(writes, 0);
  }));
test("a changed public base blocks publication before remote mutations", async () =>
  fixture(async (home, repo) => {
    const id = await bundleFixture(home, repo);
    await reviewBundle(home, id);
    await consentBundle(
      home,
      id,
      "synthetic-contributor",
      "publish-one-draft:" + id + ":" + repoName + ":synthetic-contributor",
    );
    let writes = 0;
    const runner: Run = async (_command, args) => {
      if (args.includes("--method")) writes++;
      const path = args[1];
      if (path === "user")
        return JSON.stringify({
          login: "synthetic-contributor",
          id: 1,
          type: "User",
        });
      if (path === "repos/" + repoName)
        return JSON.stringify({
          full_name: repoName,
          private: false,
          default_branch: "main",
        });
      return JSON.stringify({ object: { sha: "e".repeat(40) } });
    };
    await assert.rejects(publishBundle(home, id, runner), /base changed/u);
    assert.equal(writes, 0);
  }));
