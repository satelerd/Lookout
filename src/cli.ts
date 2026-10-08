import { parseArgs } from "node:util";
import { resolve, join } from "node:path";
import { parseConfig, parseMessages, configDigest } from "./model.js";
import { readJson, readState, saveState, withLock, FileOutbox } from "./storage.js";
import { DemoProvider, CodexProvider } from "./providers.js";
import { planCycle, commitCycle } from "./engine.js";

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true, strict: true,
    options: {
      config: { type: "string", default: "examples/apartments.json" },
      messages: { type: "string" }, state: { type: "string", default: ".lookout" },
      provider: { type: "string", default: "demo" },
      commit: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      digest: { type: "string" },
    },
  });
  const command = positionals[0] ?? "help";
  if (command === "help") {
    console.log("Lookout 0.1 — local prototype\nCommands: status | run [--dry-run] [--commit] | approve --digest HASH | pause | terminate\nOptions: --config FILE --messages FILE --state DIR --provider demo|codex\nDefault run = preview, no writes. Commit delivers ONLY to a local outbox. No WhatsApp adapter is bundled.");
    return;
  }
  if (positionals.length !== 1 || !["status", "run", "approve", "pause", "terminate"].includes(command))
    throw new Error("Unknown command; use help");
  if (values.commit && values["dry-run"]) throw new Error("Choose --commit or --dry-run");
  if (!["demo", "codex"].includes(values.provider)) throw new Error("Unknown provider");
  const config = parseConfig(await readJson(resolve(values.config)));
  const dir = resolve(values.state);
  const execute = async (): Promise<void> => {
    const state = await readState(dir, config);
    const digest = configDigest(config);
    if (command === "status") {
      console.log(JSON.stringify({ status: state.status, approved: state.approvedDigest === digest, configDigest: digest, groupId: config.groupId, objective: config.objective, preferences: config.preferences, budget: config.budget, intervalMinutes: config.intervalMinutes, sourceHosts: config.sourceHosts, transport: "local-file-outbox", pending: state.pending?.id ?? null }, null, 2));
      return;
    }
    if (command === "approve") {
      if (state.status === "terminated") throw new Error("Terminated state cannot be reactivated. Start a new state directory deliberately.");
      if (state.pending) throw new Error("Reconcile pending delivery before approval");
      if (values.digest !== digest) throw new Error("Review status and pass the exact config digest");
      await saveState(dir, { ...state, status: "active", approvedDigest: digest });
      console.log("Approved for local outbox only. No scheduler installed.");
      return;
    }
    if (command === "pause" || command === "terminate") {
      if (state.status === "terminated" && command === "pause") throw new Error("Terminated state cannot be paused or reactivated.");
      await saveState(dir, { ...state, status: command === "pause" ? "paused" : "terminated", approvedDigest: null });
      console.log(command === "pause" ? "Paused." : "Terminated. This state cannot be reactivated.");
      return;
    }
    const messages = values.messages ? parseMessages(await readJson(resolve(values.messages))) : [];
    const now = new Date();
    const provider = values.provider === "codex" ? new CodexProvider() : new DemoProvider();
    const plan = await planCycle(config, state, messages, provider, now, !values.commit);
    if (values.commit && ["news", "no-news"].includes(plan.reason))
      await commitCycle(config, state, plan, now, (next) => saveState(dir, next), new FileOutbox(join(dir, "outbox"), [config.groupId]));
    console.log(JSON.stringify({ mode: values.commit ? "local-commit" : "dry-run", provider: values.provider, synthetic: values.provider === "demo", reason: plan.reason, groupId: config.groupId, text: plan.text, configDigest: digest }, null, 2));
  };
  if (["approve", "pause", "terminate"].includes(command) || values.commit) await withLock(dir, execute);
  else await execute();
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Lookout failed");
  process.exitCode = 1;
});
