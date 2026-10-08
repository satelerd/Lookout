import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { capabilities } from "./onboarding.js";
import { privateHome, checkoutRoot } from "./private.js";
import { run, type Run } from "./contribution.js";
export async function doctor(home: string, repo = process.cwd(), execute: Run = run): Promise<unknown> {
  const tools: Record<string, boolean> = { node22: Number(process.versions.node.split(".")[0]) >= 22 };
  for (const tool of ["git", "codex", "gh"]) { try { await execute(tool, ["--version"]); tools[tool] = true; } catch { tools[tool] = false; } }
  let privateLocation = true, legacyDataInCheckout = false;
  try { await privateHome(home, repo); } catch { privateLocation = false; }
  try { await lstat(join(await checkoutRoot(repo), ".lookout")); legacyDataInCheckout = true; } catch {}
  return { version: 1, tools, privateLocation, legacyDataInCheckout, capabilities, authenticationChecked: false, schedulerInstalled: false, maintainerEnabled: false, next: !privateLocation ? "Choose a dedicated private --home outside all checkouts, with mode 0700." : "Resume onboard status. Login, chat processing, public contribution and runtime activation are separate decisions." };
}
