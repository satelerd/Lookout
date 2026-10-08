import { createHash } from "node:crypto";
export interface Config {
  version: 1; groupId: string; allowedGroupIds: string[]; objective: string;
  preferences: string[]; budget: { amount: number; currency: string };
  intervalMinutes: number; sourceHosts: string[]; maxItems: number;
}
export interface Message { id: string; groupId: string; text: string; }
export interface Finding { title: string; detail: string; url: string; amount: number; currency: string; }
export interface ResearchInput { config: Config; messages: Message[]; previousFindings: Finding[]; now: string; }
export interface Provider { research(input: ResearchInput): Promise<unknown>; }
export interface Transport {
  /** Must be idempotent for id. Return only after acknowledged delivery. */
  send(groupId: string, text: string, id: string): Promise<void>;
}
export interface State {
  version: 1; status: "paused" | "active" | "terminated";
  approvedDigest: string | null; lastRun: string | null;
  seenMessageIds: string[]; findings: Finding[];
  pending: { id: string; groupId: string; text: string } | null;
}
export const emptyState = (): State => ({
  version: 1, status: "paused", approvedDigest: null, lastRun: null,
  seenMessageIds: [], findings: [], pending: null,
});
export const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const configDigest = (config: Config): string => hash(config);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, multiline = false): string {
  if (typeof value !== "string" || !value.trim() || value.length > max ||
    (multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u).test(value))
    throw new Error("Invalid text or length");
  return value.trim();
}
function texts(value: unknown, max: number, length: number): string[] {
  if (!Array.isArray(value) || value.length > length) throw new Error("Invalid list");
  return value.map((x) => text(x, max));
}
function number(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error("Invalid number");
  return value;
}
export function parseConfig(value: unknown): Config {
  const c = object(value), b = object(c.budget);
  if (c.version !== 1) throw new Error("Unsupported config version");
  const config: Config = {
    version: 1, groupId: text(c.groupId, 150), allowedGroupIds: texts(c.allowedGroupIds, 150, 20),
    objective: text(c.objective, 500), preferences: texts(c.preferences, 300, 20),
    budget: { amount: number(b.amount, 0, 1e12), currency: text(b.currency, 3) },
    intervalMinutes: number(c.intervalMinutes, 60, 525600),
    sourceHosts: texts(c.sourceHosts, 253, 20), maxItems: number(c.maxItems, 1, 3),
  };
  if (!config.allowedGroupIds.includes(config.groupId)) throw new Error("Selected group is outside the allowlist");
  if (!/^[A-Z]{3}$/u.test(config.budget.currency) || !Number.isInteger(config.maxItems) || !Number.isInteger(config.intervalMinutes))
    throw new Error("Use a three-letter uppercase currency and integer limits");
  if (!config.sourceHosts.length || config.sourceHosts.some((h) => !/^(?=.{1,253}$)[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/u.test(h)))
    throw new Error("Explicit lowercase source hostnames are required");
  return config;
}
export function parseMessages(value: unknown): Message[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error("Expected at most 200 messages; batch locally");
  return value.map((item) => {
    const m = object(item);
    return { id: text(m.id, 200), groupId: text(m.groupId, 150), text: text(m.text, 2000, true) };
  });
}
export function canonicalUrl(value: unknown): string {
  const url = new URL(text(value, 500));
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error("Sources must be HTTPS without credentials or custom ports");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/u.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.toString();
}
export function parseFindings(value: unknown, config: Config): Finding[] {
  const result = object(value);
  if (!Array.isArray(result.findings) || result.findings.length > 10) throw new Error("Expected at most ten findings");
  return result.findings.map((item) => {
    const f = object(item), url = canonicalUrl(f.url);
    if (!config.sourceHosts.includes(new URL(url).hostname)) throw new Error("Source is outside the owner-approved host allowlist");
    return { title: text(f.title, 80), detail: text(f.detail, 180), url, amount: number(f.amount, 0, 1e12), currency: text(f.currency, 3) };
  }).filter((f) => f.currency === config.budget.currency && f.amount <= config.budget.amount);
}
/** One opportunity per canonical URL + price; price changes are useful news. */
export const findingKey = (f: Finding): string => hash([f.url, f.amount, f.currency]);
export function parseState(value: unknown, config: Config): State {
  const s = object(value);
  if (s.version !== 1 || !["paused", "active", "terminated"].includes(String(s.status))) throw new Error("Invalid state version or status");
  const nullableText = (v: unknown, max: number): string | null => v === null ? null : text(v, max);
  const lastRun = nullableText(s.lastRun, 50);
  if (lastRun !== null && !Number.isFinite(Date.parse(lastRun))) throw new Error("Invalid lastRun");
  if (!Array.isArray(s.findings) || s.findings.length > 1000) throw new Error("Invalid finding history");
  const findings = s.findings.map((f) => parseFindings({ findings: [f] }, {
    ...config, budget: { amount: 1e12, currency: text(object(f).currency, 3) },
    sourceHosts: [new URL(canonicalUrl(object(f).url)).hostname],
  })[0]!);
  let pending: State["pending"] = null;
  if (s.pending !== null) {
    const p = object(s.pending);
    if (typeof p.text !== "string" || p.text.length > 3000 || !p.text.trim()) throw new Error("Invalid pending text");
    pending = { id: text(p.id, 64), groupId: text(p.groupId, 150), text: p.text };
  }
  return { version: 1, status: s.status as State["status"], approvedDigest: nullableText(s.approvedDigest, 64), lastRun, seenMessageIds: texts(s.seenMessageIds, 200, 10000), findings, pending };
}
