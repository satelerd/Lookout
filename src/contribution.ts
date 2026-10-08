import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, lstat, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { hash } from "./model.js";
import {
  readPrivate,
  writePrivate,
  canonicalPath,
  contains,
  regularFile,
} from "./private.js";
import { profile, privateTerms } from "./onboarding.js";
import { assertPublic, redactProse, allowedExportPath } from "./privacy.js";
export type Run = (
  command: string,
  args: string[],
  cwd?: string,
) => Promise<string>;
export const run: Run = async (command, args, cwd) => {
  try {
    const result = await promisify(execFile)(command, args, {
      ...(cwd ? { cwd } : {}),
      encoding: "utf8",
      maxBuffer: 5_000_000,
      timeout: 30000,
    });
    return result.stdout;
  } catch {
    throw new Error(
      "Command failed: " +
        command +
        ". Check access/availability locally; no credentials or raw logs are exported.",
    );
  }
};
export const features = [
  "whatsapp",
  "scheduler",
  "onboarding",
  "privacy",
  "other",
] as const;
export type FeatureKey = (typeof features)[number];
export function repository(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value))
    throw new Error("Expected an explicit GitHub owner/repository");
  return value;
}
function feature(value: string): FeatureKey {
  if (!features.includes(value as FeatureKey))
    throw new Error(
      "Choose a generic feature key; never search with private group/objective data",
    );
  return value as FeatureKey;
}
export interface Discovery {
  version: 1;
  repository: string;
  feature: FeatureKey;
  matches: {
    number: number;
    title: string;
    url: string;
    kind: "issue" | "pr";
  }[];
  coverage: "up-to-100-per-kind-not-exhaustive";
  digest: string;
  decision: null | "new-work" | "extend-existing";
}
export async function discover(
  home: string,
  repo: string,
  key: string,
  execute: Run = run,
): Promise<Discovery> {
  repo = repository(repo);
  const f = feature(key),
    terms = privateTerms(await profile(home)),
    matches: Discovery["matches"] = [];
  for (const kind of ["issue", "pr"] as const) {
    const raw = JSON.parse(
      await execute("gh", [
        "search",
        kind === "issue" ? "issues" : "prs",
        f,
        "--repo",
        repo,
        "--limit",
        "100",
        "--json",
        "number,title,url",
      ]),
    ) as unknown;
    if (!Array.isArray(raw)) throw new Error("Invalid discovery response");
    for (const item of raw) {
      const r = item as Record<string, unknown>;
      if (
        !Number.isSafeInteger(r.number) ||
        typeof r.title !== "string" ||
        typeof r.url !== "string" ||
        r.url !==
          "https://github.com/" +
            repo +
            "/" +
            (kind === "issue" ? "issues" : "pull") +
            "/" +
            r.number
      )
        throw new Error("Unexpected discovery record");
      matches.push({
        number: r.number as number,
        title: redactProse(r.title.slice(0, 200), terms),
        url: r.url,
        kind,
      });
    }
  }
  const data = {
    version: 1 as const,
    repository: repo,
    feature: f,
    matches,
    coverage: "up-to-100-per-kind-not-exhaustive" as const,
  };
  const d: Discovery = { ...data, digest: hash(data), decision: null };
  await writePrivate(home, "discovery.json", d);
  return d;
}
export async function decideGap(
  home: string,
  digest: string,
  decision: "new-work" | "extend-existing",
  confirmation: string,
): Promise<Discovery> {
  const d = (await readPrivate(home, "discovery.json")) as Discovery | null;
  if (
    !d ||
    d.digest !== digest ||
    confirmation !== "review-gap:" + digest ||
    !["new-work", "extend-existing"].includes(decision)
  )
    throw new Error(
      "Review discovery data and confirm the exact gap digest; a title/comment is not permission",
    );
  const next = { ...d, decision };
  await writePrivate(home, "discovery.json", next);
  return next;
}
export interface Bundle {
  version: 1;
  repository: string;
  sourceRepository: string;
  feature: FeatureKey;
  baseSha: string;
  discoveryDigest: string;
  entries: { path: string; content: string | null; digest: string }[];
  patch: string;
  draft: string;
  validation: string;
  id: string;
}
export async function prepareBundle(
  home: string,
  repoRoot: string,
  options: {
    repository: string;
    sourceRepository?: string;
    feature: string;
    baseSha: string;
    paths: string[];
    summary: string;
    validation: string;
  },
  execute: Run = run,
): Promise<Bundle> {
  const repo = repository(options.repository),
    sourceRepository = repository(options.sourceRepository ?? repo),
    key = feature(options.feature);
  if (!/^[a-f0-9]{40}$/u.test(options.baseSha))
    throw new Error("Use an immutable 40-character public base commit");
  const discovery = (await readPrivate(
    home,
    "discovery.json",
  )) as Discovery | null;
  if (
    !discovery?.decision ||
    discovery.repository !== repo ||
    discovery.feature !== key
  )
    throw new Error(
      "Discover existing issues/PRs and review the gap decision first",
    );
  const paths = [...new Set(options.paths)].sort();
  if (
    !paths.length ||
    paths.length > 50 ||
    paths.some((p) => !allowedExportPath(p))
  )
    throw new Error(
      "Export path not in the fixed source/docs/fixture allowlist",
    );
  const terms = privateTerms(await profile(home)),
    root = await canonicalPath(repoRoot),
    entries: Bundle["entries"] = [];
  for (const path of paths) {
    const file = join(root, path);
    if (!contains(root, await canonicalPath(file)))
      throw new Error("Export path escapes checkout through a symlink");
    let content: string | null;
    try {
      await regularFile(file);
      if ((await lstat(file)).size > 500000)
        throw new Error("Export file too large");
      content = await readFile(file, "utf8");
      if (content.includes("\ufffd"))
        throw new Error("Binary/invalid UTF-8 export rejected");
      assertPublic(content, terms);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      content = null;
    }
    entries.push({ path, content, digest: hash(content) });
  }
  const patch = await execute(
    "git",
    ["diff", "--no-ext-diff", "--no-textconv", options.baseSha, "--", ...paths],
    root,
  );
  assertPublic(patch, terms);
  const summary = redactProse(options.summary, terms),
    validation = redactProse(options.validation, terms);
  if (
    !summary.trim() ||
    summary.length > 4000 ||
    !validation.trim() ||
    validation.length > 1000
  )
    throw new Error(
      "Provide a brief generic summary and truthful validation notes",
    );
  const draft = [
    "Implement " + key,
    "",
    summary,
    "",
    "Validation",
    validation,
    "",
    "Scope: reviewed source/docs/fixtures only. No private config, chats, sessions or local Git history.",
    "Gap decision: " +
      discovery.decision +
      ". Existing references: " +
      (discovery.matches.map((m) => m.url).join(", ") ||
        "none returned in bounded search") +
      ".",
    "This is a draft contribution. Maintainer review and owner-decided merge are required.",
  ].join("\n");
  assertPublic(draft, terms);
  const data = {
    version: 1 as const,
    repository: repo,
    sourceRepository,
    feature: key,
    baseSha: options.baseSha,
    discoveryDigest: discovery.digest,
    entries,
    patch,
    draft,
    validation,
  };
  const bundle: Bundle = { ...data, id: hash(data) };
  await writePrivate(home, "bundle-" + bundle.id + ".json", bundle);
  return bundle;
}
export async function readBundle(home: string, id: string): Promise<Bundle> {
  if (!/^[a-f0-9]{64}$/u.test(id)) throw new Error("Invalid bundle id");
  const b = (await readPrivate(
    home,
    "bundle-" + id + ".json",
  )) as Bundle | null;
  if (!b) throw new Error("Bundle missing");
  const { id: storedId, ...data } = b;
  if (
    storedId !== id ||
    hash(data) !== id ||
    !Array.isArray(b.entries) ||
    b.entries.length > 50 ||
    b.entries.some(
      (e) =>
        !allowedExportPath(e.path) ||
        (e.content !== null && typeof e.content !== "string") ||
        e.digest !== hash(e.content),
    )
  )
    throw new Error(
      "Bundle changed or contains a forbidden path; prepare and review again",
    );
  repository(b.repository);
  repository(b.sourceRepository);
  const terms = privateTerms(await profile(home));
  for (const e of b.entries)
    if (e.content !== null) assertPublic(e.content, terms);
  assertPublic(b.patch, terms);
  assertPublic(b.draft, terms);
  return b;
}
export async function reviewBundle(home: string, id: string): Promise<Bundle> {
  const b = await readBundle(home, id);
  await writePrivate(home, "review-" + id + ".json", {
    id,
    repository: b.repository,
    sourceRepository: b.sourceRepository,
    scope: "exact-bundle",
    at: new Date().toISOString(),
  });
  return b;
}
export interface Consent {
  version: 1;
  bundleId: string;
  repository: string;
  sourceRepository: string;
  identity: string;
  action: "one-draft-pr";
  futurePublications: "ask-each-time";
  expiresAt: string;
}
export async function consentBundle(
  home: string,
  id: string,
  identity: string,
  confirmation: string,
  now = new Date(),
): Promise<Consent> {
  const b = await readBundle(home, id);
  if (!(await readPrivate(home, "review-" + id + ".json")))
    throw new Error(
      "Inspect the exact bundle and draft before asking for publication consent",
    );
  if (
    !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/u.test(identity) ||
    confirmation !==
      "publish-one-draft:" + id + ":" + b.repository + ":" + identity
  )
    throw new Error(
      "Insufficient publication confirmation: require exact bundle, repository and account. Future publications still ask each time.",
    );
  const c: Consent = {
    version: 1,
    bundleId: id,
    repository: b.repository,
    sourceRepository: b.sourceRepository,
    identity,
    action: "one-draft-pr",
    futurePublications: "ask-each-time",
    expiresAt: new Date(now.getTime() + 10 * 60000).toISOString(),
  };
  await writePrivate(home, "consent-" + id + ".json", c);
  return c;
}
interface Publication {
  version: 1;
  status: "reserved" | "published";
  bundleId: string;
  url: string | null;
  commit: string | null;
}
export async function publishBundle(
  home: string,
  id: string,
  execute: Run = run,
  now = new Date(),
): Promise<Publication> {
  const b = await readBundle(home, id),
    old = (await readPrivate(
      home,
      "publication-" + id + ".json",
    )) as Publication | null;
  if (
    old?.status === "published" &&
    old.bundleId === id &&
    old.url?.startsWith("https://github.com/" + b.repository + "/pull/") &&
    /^[a-f0-9]{40}$/u.test(old.commit ?? "")
  )
    return old;
  if (old)
    throw new Error(
      "Publication outcome is unresolved; inspect the remote branch/PR before any retry. No automatic replay.",
    );
  const c = (await readPrivate(
    home,
    "consent-" + id + ".json",
  )) as Consent | null;
  if (
    !c ||
    c.bundleId !== id ||
    c.repository !== b.repository ||
    c.sourceRepository !== b.sourceRepository ||
    c.action !== "one-draft-pr" ||
    c.futurePublications !== "ask-each-time" ||
    !Number.isFinite(Date.parse(c.expiresAt)) ||
    Date.parse(c.expiresAt) <= now.getTime()
  )
    throw new Error(
      "A current, reviewed, one-draft publication consent is required",
    );
  const api = async (path: string, body?: unknown): Promise<any> => {
    if (body === undefined)
      return JSON.parse(await execute("gh", ["api", path]));
    const input = join(home, "request-" + randomUUID() + ".json");
    try {
      await writeFile(input, JSON.stringify(body), { mode: 0o600, flag: "wx" });
      return JSON.parse(
        await execute("gh", [
          "api",
          path,
          "--method",
          "POST",
          "--input",
          input,
        ]),
      );
    } finally {
      await unlink(input).catch(() => {});
    }
  };
  const user = await api("user");
  if (
    user.login !== c.identity ||
    user.type !== "User" ||
    !Number.isSafeInteger(user.id)
  )
    throw new Error(
      "Authenticated account differs from owner-approved identity",
    );
  const target = await api("repos/" + b.repository);
  if (
    target.private !== false ||
    target.full_name !== b.repository ||
    typeof target.default_branch !== "string"
  )
    throw new Error("Only the explicit public target repository is supported");
  if (b.sourceRepository !== b.repository) {
    const source = await api("repos/" + b.sourceRepository);
    if (
      source.private !== false ||
      source.full_name !== b.sourceRepository ||
      !source.fork ||
      source.parent?.full_name !== b.repository ||
      source.owner?.login !== c.identity
    )
      throw new Error(
        "Choose an existing public fork of this project owned by the approved account. No fork or access request is created automatically.",
      );
  }
  const base = await api(
    "repos/" +
      b.repository +
      "/git/ref/heads/" +
      encodeURIComponent(target.default_branch),
  );
  if (base.object.sha !== b.baseSha)
    throw new Error(
      "Public base changed. Review/rebase and prepare a new bundle before publication.",
    );
  const baseCommit = await api(
    "repos/" + b.sourceRepository + "/git/commits/" + b.baseSha,
  );
  const branch = "lookout/contribution-" + id.slice(0, 20),
    owner = b.sourceRepository.split("/")[0];
  const priorPRs = await api(
    "repos/" +
      b.repository +
      "/pulls?head=" +
      owner +
      ":" +
      branch +
      "&state=all",
  );
  if (!Array.isArray(priorPRs))
    throw new Error("Unexpected PR lookup response");
  const reservation: Publication = {
    version: 1,
    status: "reserved",
    bundleId: id,
    url: null,
    commit: null,
  };
  await writePrivate(home, "publication-" + id + ".json", reservation);
  const tree = await api("repos/" + b.sourceRepository + "/git/trees", {
    base_tree: baseCommit.tree.sha,
    tree: b.entries.map((e) =>
      e.content === null
        ? { path: e.path, mode: "100644", type: "blob", sha: null }
        : { path: e.path, mode: "100644", type: "blob", content: e.content },
    ),
  });
  const body = b.draft + "\n\nLookout reviewed bundle: " + id + "\n";
  if (priorPRs.length) {
    if (
      priorPRs.length !== 1 ||
      priorPRs[0].body !== body ||
      !/^[a-f0-9]{40}$/u.test(priorPRs[0].head?.sha ?? "")
    )
      throw new Error("Existing contribution requires manual reconciliation");
    const prior = await api(
      "repos/" + b.sourceRepository + "/git/commits/" + priorPRs[0].head.sha,
    );
    if (
      prior.tree.sha !== tree.sha ||
      prior.parents.length !== 1 ||
      prior.parents[0].sha !== b.baseSha
    )
      throw new Error(
        "Existing branch does not match the clean reviewed export",
      );
    const done: Publication = {
      ...reservation,
      status: "published",
      url: priorPRs[0].html_url,
      commit: prior.sha,
    };
    await writePrivate(home, "publication-" + id + ".json", done);
    return done;
  }
  const author = {
    name: user.login,
    email: user.id + "+" + user.login + "@users.noreply.github.com",
  };
  const commit = await api("repos/" + b.sourceRepository + "/git/commits", {
    message: "Implement " + b.feature + " from reviewed Lookout bundle",
    tree: tree.sha,
    parents: [b.baseSha],
    author,
    committer: author,
  });
  await api("repos/" + b.sourceRepository + "/git/refs", {
    ref: "refs/heads/" + branch,
    sha: commit.sha,
  });
  const pr = await api("repos/" + b.repository + "/pulls", {
    title: "Implement " + b.feature + " from reviewed bundle",
    body,
    head: owner + ":" + branch,
    base: target.default_branch,
    draft: true,
  });
  if (
    typeof pr.html_url !== "string" ||
    !pr.html_url.startsWith("https://github.com/" + b.repository + "/pull/") ||
    pr.draft !== true
  )
    throw new Error(
      "Draft PR result is uncertain; inspect remotely before retrying",
    );
  const done: Publication = {
    ...reservation,
    status: "published",
    url: pr.html_url,
    commit: commit.sha,
  };
  await writePrivate(home, "publication-" + id + ".json", done);
  return done;
}
