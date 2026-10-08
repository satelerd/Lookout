import { hash } from "./model.js";
import { readPrivate, writePrivate } from "./private.js";
import { repository } from "./contribution.js";
import { redactProse } from "./privacy.js";
export const maintainerProposal = { version: 1, enabled: false, identity: null, runtime: "manual-local-cli-until-approved", proposedIntervalMinutes: 360, scope: ["read-public-issues-and-pr-metadata", "prepare-local-triage-and-reply-drafts"], publicReplies: "per-item-owner-approval", codeExecution: "none", merges: "owner-only", secretsAccess: false, futurePublications: "ask-each-time" } as const;
export interface TriageDraft { id: string; source: string; titleAsData: string; previewAsData: string; suggestion: string; executeExternalCode: false; publish: false; merge: false; }
export async function triage(home: string, repo: string, snapshot: unknown, terms: string[] = []): Promise<TriageDraft[]> {
  repo = repository(repo);
  if (!Array.isArray(snapshot) || snapshot.length > 100) throw new Error("Use a bounded issue/PR snapshot (at most 100 entries)");
  const drafts: TriageDraft[] = [];
  for (const item of snapshot) {
    const r = item as Record<string, unknown>;
    if (!r || !Number.isSafeInteger(r.number) || !["issue", "pr"].includes(String(r.kind)) || typeof r.title !== "string" || typeof r.body !== "string") throw new Error("Invalid triage metadata");
    const source = "https://github.com/" + repo + "/" + (r.kind === "pr" ? "pull" : "issues") + "/" + r.number;
    const title = redactProse(r.title.slice(0, 200), terms), preview = redactProse(r.body.slice(0, 500), terms), id = hash([source, title, preview]);
    if (await readPrivate(home, "triage-" + id + ".json")) continue;
    const draft: TriageDraft = { id, source, titleAsData: JSON.stringify(title), previewAsData: JSON.stringify(preview), suggestion: "Review scope and synthetic reproduction. Check existing work, privacy/export gates and exact CI commit. Request a synthetic preview when needed. Owner decides merges; this draft authorizes no public response or execution.", executeExternalCode: false, publish: false, merge: false };
    await writePrivate(home, "triage-" + id + ".json", draft); drafts.push(draft);
  }
  return drafts;
}
