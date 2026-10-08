import { mkdir, readdir, lstat } from "node:fs/promises";
import { join } from "node:path";
import { hash } from "./model.js";
import { readPrivate, writePrivate } from "./private.js";
import { profile, privateTerms } from "./onboarding.js";
import { allowedExportPath, assertPublic } from "./privacy.js";
import { run, type Run } from "./contribution.js";
export interface UpdatePlan { version: 1; from: string; to: string; paths: string[]; configFingerprint: string; id: string; }
async function safeCheckout(repo: string, sha: string, execute: Run): Promise<void> {
  const names = await execute("git", ["config", "--list", "--name-only"], repo);
  if (/^filter\..*\.(smudge|process)$/mu.test(names)) throw new Error("Configured Git filters require manual update review; automatic checkout is disabled");
  const tree = await execute("git", ["ls-tree", "-r", sha], repo);
  if (/^120000 /mu.test(tree) || /\t(?:.*\/)?\.(?:gitmodules|gitattributes)$/mu.test(tree)) throw new Error("Symlinks, submodules or Git attributes require manual update review");
}
export async function planUpdate(home: string, repo: string, to: string, execute: Run = run): Promise<UpdatePlan> {
  if (!/^[a-f0-9]{40}$/u.test(to)) throw new Error("Choose an immutable reviewed release commit");
  if ((await execute("git", ["status", "--porcelain"], repo)).trim()) throw new Error("Keep local contribution changes on their branch; updates require a clean checkout");
  try { await lstat(join(repo, ".lookout")); throw new Error("Move legacy private data out of the checkout before adopting updates"); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  const from = (await execute("git", ["rev-parse", "HEAD"], repo)).trim();
  if (!/^[a-f0-9]{40}$/u.test(from) || (await execute("git", ["rev-parse", "--verify", to + "^{commit}"], repo)).trim() !== to) throw new Error("Release commit is not available locally; fetch the trusted repository first");
  await safeCheckout(repo, to, execute); await safeCheckout(repo, from, execute);
  const paths = (await execute("git", ["diff", "--name-only", from, to, "--"], repo)).trim().split("\n").filter(Boolean);
  if (paths.some(p => !allowedExportPath(p))) throw new Error("Update changes paths outside the reviewed source/docs allowlist");
  const terms = privateTerms(await profile(home));
  assertPublic(await execute("git", ["diff", "--no-ext-diff", "--no-textconv", from, to, "--"], repo), terms);
  const data = { version: 1 as const, from, to, paths, configFingerprint: hash(await readPrivate(home, "profile.json")) };
  const plan: UpdatePlan = { ...data, id: hash(data) }; await writePrivate(home, "update-" + plan.id + ".json", plan); return plan;
}
export async function switchUpdate(home: string, repo: string, id: string, direction: "adopt" | "rollback", confirmation: string, execute: Run = run): Promise<unknown> {
  if (!/^[a-f0-9]{64}$/u.test(id)) throw new Error("Invalid update id");
  const plan = await readPrivate(home, "update-" + id + ".json") as UpdatePlan | null;
  if (!plan) throw new Error("Update plan missing");
  const { id: stored, ...data } = plan;
  if (stored !== id || hash(data) !== id || confirmation !== direction + "-code:" + id) throw new Error("Review the exact immutable update/rollback plan before confirming");
  if (direction === "adopt" && plan.configFingerprint !== hash(await readPrivate(home, "profile.json"))) throw new Error("Owner answers changed; prepare a new adoption plan");
  if ((await execute("git", ["status", "--porcelain"], repo)).trim()) throw new Error("Checkout changed; keep local work before switching code");
  const current = (await execute("git", ["rev-parse", "HEAD"], repo)).trim(), target = direction === "adopt" ? plan.to : plan.from, expected = direction === "adopt" ? plan.from : plan.to;
  if (current === target) return { code: target, privateDataChanged: false, repeated: true };
  if (current !== expected) throw new Error("Unexpected code revision; do not overwrite local work");
  await safeCheckout(repo, target, execute);
  const hooks = join(home, "disabled-hooks"); await mkdir(hooks, { recursive: true, mode: 0o700 });
  if ((await lstat(hooks)).isSymbolicLink() || (await readdir(hooks)).length) throw new Error("Expected an empty private hook directory");
  const fingerprint = hash(await readPrivate(home, "profile.json"));
  await writePrivate(home, "update-receipt-" + id + ".json", { status: "reserved", direction, from: current, to: target });
  await execute("git", ["-c", "core.hooksPath=" + hooks, "-c", "submodule.recurse=false", "switch", "--no-recurse-submodules", "--detach", target], repo);
  if ((await execute("git", ["rev-parse", "HEAD"], repo)).trim() !== target) throw new Error("Checkout outcome uncertain; inspect before retrying");
  if (hash(await readPrivate(home, "profile.json")) !== fingerprint) throw new Error("Private answers changed independently during checkout; inspect without restoring an old snapshot");
  await writePrivate(home, "update-receipt-" + id + ".json", { status: "completed", direction, from: current, to: target });
  return { code: target, privateDataChanged: false, repeated: false };
}
