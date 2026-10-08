import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateHome } from "../src/private.js";
import { configure, profile } from "../src/onboarding.js";
import {
  discover,
  decideGap,
  prepareBundle,
  readBundle,
  reviewBundle,
  consentBundle,
  publishBundle,
  type Run,
} from "../src/contribution.js";
import { syntheticAnswers } from "../src/walkthrough.js";

const repository = "demo/lookout",
  baseSha = "a".repeat(40),
  privateTerm = "FictionalOwnerName",
  privatePath = "src/fictionalownername.ts",
  safeContent = "export const publicFeature = true;\n";
const emptyDiff: Run = async (command) => (command === "git" ? "" : "[]");

async function fixture(
  action: (home: string, repo: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "lookout-contribution-guards-"));
  try {
    const home = join(root, "private"),
      repo = join(root, "checkout");
    await mkdir(join(repo, "src"), { recursive: true });
    await writeFile(join(repo, ".git"), "synthetic marker");
    await privateHome(home, repo, true);
    await configure(home, syntheticAnswers());
    const discovery = await discover(home, repository, "privacy", emptyDiff);
    await decideGap(
      home,
      discovery.digest,
      "new-work",
      "review-gap:" + discovery.digest,
    );
    await action(home, repo);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function options(path: string) {
  return {
    repository,
    feature: "privacy",
    baseSha,
    paths: [path],
    summary: "Synthetic feature",
    validation: "Synthetic tests only",
  };
}

async function registerPrivateTerm(home: string): Promise<void> {
  const answers = await profile(home);
  await configure(home, {
    ...answers,
    redactionTerms: [...answers.redactionTerms, privateTerm],
  });
}

function privatePathBlocked(error: unknown): boolean {
  assert.ok(error instanceof Error);
  assert.match(error.message, /Export blocked: owner-private-term/u);
  assert.ok(!error.message.includes(privateTerm));
  assert.ok(!error.message.includes(privatePath));
  return true;
}

for (const content of [safeContent, null]) {
  const kind = content === null ? "deleted" : "untracked";
  test(`prepare rejects private ${kind} filenames even with safe content and an empty diff`, async () =>
    fixture(async (home, repo) => {
      await registerPrivateTerm(home);
      if (content !== null) await writeFile(join(repo, privatePath), content);
      await assert.rejects(
        prepareBundle(home, repo, options(privatePath), emptyDiff),
        privatePathBlocked,
      );
      assert.deepEqual(
        (await readdir(home)).filter((name) => name.startsWith("bundle-")),
        [],
      );
    }));

  test(`bundle revalidation scans ${kind} filenames against current private terms`, async () =>
    fixture(async (home, repo) => {
      if (content !== null) await writeFile(join(repo, privatePath), content);
      const bundle = await prepareBundle(
        home,
        repo,
        options(privatePath),
        emptyDiff,
      );
      assert.equal(bundle.patch, "");
      assert.equal(bundle.entries[0]?.content, content);
      assert.deepEqual(await readBundle(home, bundle.id), bundle);
      await reviewBundle(home, bundle.id);
      await consentBundle(
        home,
        bundle.id,
        "synthetic-contributor",
        "publish-one-draft:" +
          bundle.id +
          ":" +
          repository +
          ":synthetic-contributor",
      );

      await registerPrivateTerm(home);
      await assert.rejects(readBundle(home, bundle.id), privatePathBlocked);
      await assert.rejects(reviewBundle(home, bundle.id), privatePathBlocked);
      let remoteCalls = 0;
      await assert.rejects(
        publishBundle(home, bundle.id, async () => {
          remoteCalls++;
          throw new Error("No remote calls are permitted");
        }),
        privatePathBlocked,
      );
      assert.equal(remoteCalls, 0);
    }));
}

test("publication pins every API read and upload to github.com despite GH_HOST", async () =>
  fixture(async (home, repo) => {
    const path = "src/public-feature.ts",
      identity = "synthetic-contributor",
      sourceRepository = identity + "/lookout";
    await writeFile(join(repo, path), safeContent);
    const bundle = await prepareBundle(
      home,
      repo,
      { ...options(path), sourceRepository },
      emptyDiff,
    );
    await reviewBundle(home, bundle.id);
    await consentBundle(
      home,
      bundle.id,
      identity,
      "publish-one-draft:" + bundle.id + ":" + repository + ":" + identity,
    );
    const reads: string[] = [],
      uploads: { path: string; body: Record<string, unknown> }[] = [],
      originalHost = process.env.GH_HOST,
      conflictingHost = "enterprise.example.test";
    process.env.GH_HOST = conflictingHost;
    try {
      const execute: Run = async (command, args) => {
        assert.equal(command, "gh");
        assert.equal(process.env.GH_HOST, conflictingHost);
        const endpoint = args[1]!;
        assert.deepEqual(args.slice(0, 4), [
          "api",
          endpoint,
          "--hostname",
          "github.com",
        ]);
        const inputIndex = args.indexOf("--input");
        if (inputIndex >= 0) {
          assert.equal(args[args.indexOf("--method") + 1], "POST");
          uploads.push({
            path: endpoint,
            body: JSON.parse(await readFile(args[inputIndex + 1]!, "utf8")),
          });
        } else {
          reads.push(endpoint);
        }
        if (endpoint === "user")
          return JSON.stringify({ login: identity, id: 1, type: "User" });
        if (endpoint === "repos/" + repository)
          return JSON.stringify({
            full_name: repository,
            private: false,
            default_branch: "main",
          });
        if (endpoint === "repos/" + sourceRepository)
          return JSON.stringify({
            full_name: sourceRepository,
            private: false,
            fork: true,
            parent: { full_name: repository },
            owner: { login: identity },
          });
        if (endpoint.endsWith("/git/ref/heads/main"))
          return JSON.stringify({ object: { sha: baseSha } });
        if (endpoint.endsWith("/git/commits/" + baseSha))
          return JSON.stringify({ tree: { sha: "b".repeat(40) } });
        if (endpoint.includes("/pulls?")) return "[]";
        if (endpoint.endsWith("/git/trees"))
          return JSON.stringify({ sha: "c".repeat(40) });
        if (endpoint.endsWith("/git/commits"))
          return JSON.stringify({ sha: "d".repeat(40) });
        if (endpoint.endsWith("/git/refs")) return "{}";
        if (endpoint.endsWith("/pulls"))
          return JSON.stringify({
            html_url: "https://github.com/" + repository + "/pull/1",
            draft: true,
          });
        throw new Error("Unexpected synthetic endpoint");
      };
      const result = await publishBundle(home, bundle.id, execute);
      assert.equal(result.status, "published");
      assert.equal(reads.length, 6);
      assert.deepEqual(
        uploads.map((upload) => upload.path),
        [
          "repos/" + sourceRepository + "/git/trees",
          "repos/" + sourceRepository + "/git/commits",
          "repos/" + sourceRepository + "/git/refs",
          "repos/" + repository + "/pulls",
        ],
      );
      assert.deepEqual(uploads[0]?.body.tree, [
        { path, mode: "100644", type: "blob", content: safeContent },
      ]);
      assert.equal(uploads[3]?.body.draft, true);
    } finally {
      if (originalHost === undefined) delete process.env.GH_HOST;
      else process.env.GH_HOST = originalHost;
    }
  }));
