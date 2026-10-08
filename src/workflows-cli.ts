import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { readJson, withLock } from "./storage.js";
import {
  privateHome,
  defaultHome,
  checkoutRoot,
  assertOutsideCheckout,
} from "./private.js";
import {
  initOnboarding,
  configure,
  previewOnboarding,
  approveOnboarding,
  onboarding,
  profile,
  privateTerms,
} from "./onboarding.js";
import { doctor } from "./doctor.js";
import {
  discover,
  decideGap,
  prepareBundle,
  reviewBundle,
  consentBundle,
  publishBundle,
} from "./contribution.js";
import { maintainerProposal, triage } from "./maintainer.js";
import { planUpdate, switchUpdate } from "./updates.js";

export async function workflow(argv: string[]): Promise<void> {
  const { values: v, positionals: p } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      home: { type: "string", default: defaultHome() },
      file: { type: "string" },
      repository: { type: "string", default: "satelerd/Lookout" },
      "source-repository": { type: "string" },
      feature: { type: "string" },
      base: { type: "string" },
      path: { type: "string", multiple: true },
      summary: { type: "string" },
      validation: { type: "string" },
      digest: { type: "string" },
      identity: { type: "string" },
      confirm: { type: "string" },
      decision: { type: "string" },
      to: { type: "string" },
    },
  });
  const command = p[0],
    action = p[1] ?? "status";
  const repo = await checkoutRoot();
  if (command === "doctor") {
    console.log(JSON.stringify(await doctor(v.home, repo), null, 2));
    return;
  }
  const home = await privateHome(
    v.home,
    repo,
    command !== "doctor" && action !== "status" && action !== "proposal",
  );
  const required = (value: string | undefined, label: string): string => {
    if (!value) throw new Error("Missing " + label);
    return value;
  };
  const input = async (path: string | undefined): Promise<unknown> => {
    const full = resolve(required(path, "--file"));
    await assertOutsideCheckout(full, repo);
    return readJson(full);
  };
  const execute = async (): Promise<unknown> => {
    if (command === "doctor") return doctor(home, repo);
    if (command === "onboard") {
      if (action === "init") return initOnboarding(home);
      if (action === "configure") return configure(home, await input(v.file));
      if (action === "preview") return previewOnboarding(home);
      if (action === "approve")
        return approveOnboarding(home, required(v.confirm, "--confirm"));
      if (action === "status")
        return {
          checkpoint: await onboarding(home),
          containsPrivateAnswers: false,
          activeTransport: "local-outbox-only",
          schedulerInstalled: false,
        };
    }
    if (command === "contribute") {
      if (action === "discover")
        return discover(home, v.repository, required(v.feature, "--feature"));
      if (action === "decide") {
        if (!["new-work", "extend-existing"].includes(v.decision ?? ""))
          throw new Error("Choose --decision new-work|extend-existing");
        return decideGap(
          home,
          required(v.digest, "--digest"),
          v.decision as "new-work" | "extend-existing",
          required(v.confirm, "--confirm"),
        );
      }
      if (action === "prepare") {
        const summaryFile = resolve(required(v.summary, "--summary"));
        await assertOutsideCheckout(summaryFile, repo);
        const summary = await readJson(summaryFile);
        if (typeof summary !== "string")
          throw new Error(
            "Summary file must be a JSON string with generic public prose",
          );
        const bundle = await prepareBundle(home, repo, {
          repository: v.repository,
          ...(v["source-repository"]
            ? { sourceRepository: v["source-repository"] }
            : {}),
          feature: required(v.feature, "--feature"),
          baseSha: required(v.base, "--base"),
          paths: v.path ?? [],
          summary,
          validation: required(v.validation, "--validation"),
        });
        return {
          id: bundle.id,
          entries: bundle.entries.map((e) => ({
            path: e.path,
            digest: e.digest,
          })),
          draft: bundle.draft,
          publicationAuthorized: false,
        };
      }
      if (action === "review")
        return reviewBundle(home, required(v.digest, "--digest"));
      if (action === "consent")
        return consentBundle(
          home,
          required(v.digest, "--digest"),
          required(v.identity, "--identity"),
          required(v.confirm, "--confirm"),
        );
      if (action === "publish")
        return publishBundle(home, required(v.digest, "--digest"));
    }
    if (command === "maintainer") {
      if (action === "proposal") return maintainerProposal;
      if (action === "triage")
        return {
          drafts: await triage(
            home,
            v.repository,
            await input(v.file),
            privateTerms(await profile(home)),
          ),
          publicActions: false,
        };
    }
    if (command === "update") {
      if (action === "plan")
        return planUpdate(home, repo, required(v.to, "--to"));
      if (action === "adopt" || action === "rollback")
        return switchUpdate(
          home,
          repo,
          required(v.digest, "--digest"),
          action,
          required(v.confirm, "--confirm"),
        );
    }
    throw new Error(
      "Unknown workflow/action. Read docs/INSTALL.md or docs/CONTRIBUTOR.md.",
    );
  };
  const readonly =
    command === "doctor" || action === "status" || action === "proposal";
  const result = readonly ? await execute() : await withLock(home, execute);
  console.log(JSON.stringify(result, null, 2));
}
