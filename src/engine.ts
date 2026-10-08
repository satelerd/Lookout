import {
  configDigest,
  findingKey,
  hash,
  parseFindings,
  type Config,
  type Finding,
  type Message,
  type Provider,
  type State,
  type Transport,
} from "./model.js";
export interface Plan {
  reason: "paused" | "terminated" | "not-due" | "no-news" | "news";
  text: string | null;
  findings: Finding[];
  messageIds: string[];
}
export async function planCycle(
  config: Config,
  state: State,
  messages: Message[],
  provider: Provider,
  now: Date,
  preview = false,
): Promise<Plan> {
  const skip = (reason: Plan["reason"]): Plan => ({
    reason,
    text: null,
    findings: [],
    messageIds: [],
  });
  if (state.status === "terminated") return skip("terminated");
  if (!preview && state.status !== "active") return skip("paused");
  if (state.pending)
    throw new Error(
      "Unresolved delivery; reconcile pending receipt before running again",
    );
  if (!preview && configDigest(config) !== state.approvedDigest)
    throw new Error("Configuration changed: review and approve the new digest");
  if (
    !preview &&
    state.lastRun &&
    now.getTime() - Date.parse(state.lastRun) < config.intervalMinutes * 60000
  )
    return skip("not-due");
  const seen = new Set(state.seenMessageIds),
    unique = new Map<string, Message>();
  for (const m of messages)
    if (
      m.groupId === config.groupId &&
      config.allowedGroupIds.includes(m.groupId) &&
      !seen.has(m.id)
    )
      unique.set(m.id, m);
  const fresh = [...unique.values()];
  const raw = await provider.research({
    config,
    messages: fresh,
    previousFindings: state.findings.slice(-30),
    now: now.toISOString(),
  });
  const known = new Set(state.findings.map(findingKey));
  const findings = parseFindings(raw, config)
    .filter((f) => {
      const key = findingKey(f);
      if (known.has(key)) return false;
      known.add(key);
      return true;
    })
    .slice(0, config.maxItems);
  const text = findings.length
    ? [
        "👀 Lookout",
        ...findings.map(
          (f) =>
            `• ${f.title}: ${f.detail} (${f.currency} ${f.amount})\n${f.url}`,
        ),
      ].join("\n")
    : null;
  return {
    reason: text ? "news" : "no-news",
    text,
    findings,
    messageIds: fresh.map((m) => m.id),
  };
}
/** Save reservation before delivery. Ambiguous failures never trigger automatic retries. */
export async function commitCycle(
  config: Config,
  state: State,
  plan: Plan,
  now: Date,
  save: (state: State) => Promise<void>,
  transport: Transport,
): Promise<State> {
  if (
    state.status !== "active" ||
    state.approvedDigest !== configDigest(config) ||
    state.pending
  )
    throw new Error(
      "Commit requires active, approved state without pending delivery",
    );
  if (!["news", "no-news"].includes(plan.reason)) return state;
  const next: State = {
    ...state,
    lastRun: now.toISOString(),
    seenMessageIds: [
      ...new Set([...state.seenMessageIds, ...plan.messageIds]),
    ].slice(-10000),
    findings: [...state.findings, ...plan.findings].slice(-1000),
    pending: null,
  };
  if (plan.text)
    next.pending = {
      id: hash([configDigest(config), plan.findings.map(findingKey)]),
      groupId: config.groupId,
      text: plan.text,
    };
  await save(next);
  if (next.pending) {
    await transport.send(
      next.pending.groupId,
      next.pending.text,
      next.pending.id,
    );
    next.pending = null;
    await save(next);
  }
  return next;
}
