import { join } from "node:path";
import { hash, parseConfig, configDigest, emptyState, type Config } from "./model.js";
import { readPrivate, writePrivate } from "./private.js";
import { readState, saveState } from "./storage.js";
import { planCycle } from "./engine.js";
import { DemoProvider } from "./providers.js";
export const capabilities = { "local-outbox": true, "codex-research": true, whatsapp: false, scheduler: false } as const;
type Feature = keyof typeof capabilities;
export interface Profile { version: 1; config: Config; runtime: { provider: "demo" | "codex"; host: "manual-local"; requestedFeatures: Feature[] }; redactionTerms: string[]; }
export interface Onboarding { version: 1; stage: "interview" | "configured" | "previewed" | "ready-local-only"; digest: string | null; previewDigest: string | null; missing: Feature[]; }
const start = (): Onboarding => ({ version: 1, stage: "interview", digest: null, previewDigest: null, missing: [] });
export function parseProfile(value: unknown): Profile {
  if (!value || typeof value !== "object") throw new Error("Expected owner answers object");
  const p = value as Record<string, unknown>, r = p.runtime as Record<string, unknown> | undefined;
  if (p.version !== 1 || !r || !["demo", "codex"].includes(String(r.provider)) || r.host !== "manual-local" || !Array.isArray(r.requestedFeatures) || r.requestedFeatures.length > 10 || r.requestedFeatures.some(f => typeof f !== "string" || !Object.hasOwn(capabilities, f))) throw new Error("Invalid runtime or requested feature. Scheduling and WhatsApp remain unavailable.");
  if (!Array.isArray(p.redactionTerms) || p.redactionTerms.length > 100 || p.redactionTerms.some(t => typeof t !== "string" || t.trim().length < 3 || t.length > 300)) throw new Error("Redaction terms must be strings of 3–300 characters");
  return { version: 1, config: parseConfig(p.config), runtime: { provider: r.provider as "demo" | "codex", host: "manual-local", requestedFeatures: [...new Set(r.requestedFeatures)] as Feature[] }, redactionTerms: (p.redactionTerms as string[]).map(t => t.trim()) };
}
export async function profile(home: string): Promise<Profile> {
  const value = await readPrivate(home, "profile.json");
  if (value === null) throw new Error("Complete the owner interview with onboard configure first");
  return parseProfile(value);
}
export async function onboarding(home: string): Promise<Onboarding> {
  const value = await readPrivate(home, "onboarding.json");
  if (value === null) return start();
  const s = value as Onboarding;
  if (s.version !== 1 || !["interview", "configured", "previewed", "ready-local-only"].includes(s.stage) || !Array.isArray(s.missing)) throw new Error("Invalid onboarding checkpoint");
  return s;
}
export async function initOnboarding(home: string): Promise<Onboarding> {
  const state = await onboarding(home); await writePrivate(home, "onboarding.json", state); return state;
}
export async function configure(home: string, answers: unknown): Promise<Onboarding> {
  const p = parseProfile(answers), digest = hash(p), old = await readPrivate(home, "profile.json");
  if (old !== null && parseProfile(old).config.groupId !== p.config.groupId) throw new Error("A different group needs its own private home; do not reuse another group's history.");
  const state = await onboarding(home);
  if (state.digest === digest) return state;
  const runtime = await readState(join(home, "runtime"), p.config);
  if (runtime.status === "terminated") throw new Error("Terminated search cannot be reactivated. Choose a new private home deliberately.");
  if (runtime.pending) throw new Error("Reconcile pending delivery before changing owner answers");
  await writePrivate(home, "profile.json", p); await writePrivate(home, "config.json", p.config);
  await saveState(join(home, "runtime"), { ...runtime, status: "paused", approvedDigest: null });
  const next: Onboarding = { version: 1, stage: "configured", digest, previewDigest: null, missing: p.runtime.requestedFeatures.filter(f => !capabilities[f]) };
  await writePrivate(home, "onboarding.json", next); return next;
}
export async function previewOnboarding(home: string): Promise<{ checkpoint: Onboarding; text: string | null; synthetic: true }> {
  const p = await profile(home), state = await onboarding(home);
  if (state.digest !== hash(p)) throw new Error("Answers changed outside onboarding; configure again before preview");
  const result = await planCycle(p.config, emptyState(), [], new DemoProvider(), new Date(), true);
  const next: Onboarding = { ...state, stage: "previewed", previewDigest: hash([state.digest, result.text]) };
  await writePrivate(home, "preview.json", { digest: next.previewDigest, text: result.text, provider: "demo", synthetic: true });
  await writePrivate(home, "onboarding.json", next);
  return { checkpoint: next, text: result.text, synthetic: true };
}
export async function approveOnboarding(home: string, confirmation: string): Promise<Onboarding> {
  const p = await profile(home), state = await onboarding(home);
  if (!state.previewDigest || !["previewed", "ready-local-only"].includes(state.stage) || state.digest !== hash(p)) throw new Error("Review a current synthetic preview before local approval");
  if (confirmation !== "approve-local:" + state.previewDigest) throw new Error("Insufficient confirmation: use the exact approve-local preview digest after owner review");
  const runtime = await readState(join(home, "runtime"), p.config);
  if (runtime.status === "terminated" || runtime.pending) throw new Error("Runtime is terminated or delivery is unresolved");
  await saveState(join(home, "runtime"), { ...runtime, status: "active", approvedDigest: configDigest(p.config) });
  const next: Onboarding = { ...state, stage: "ready-local-only" }; await writePrivate(home, "onboarding.json", next); return next;
}
export function privateTerms(p: Profile): string[] {
  return [...p.redactionTerms, p.config.groupId, p.config.objective, ...p.config.preferences].filter(t => t.length >= 3);
}
