import {
  mkdir,
  readFile,
  rename,
  writeFile,
  open,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  emptyState,
  parseState,
  type Config,
  type State,
  type Transport,
} from "./model.js";
export async function readJson(path: string): Promise<unknown> {
  const file = await open(path, "r");
  try {
    if ((await file.stat()).size > 5_000_000)
      throw new Error("Input file too large");
    return JSON.parse(await file.readFile("utf8")) as unknown;
  } finally {
    await file.close();
  }
}
export async function readState(dir: string, config: Config): Promise<State> {
  try {
    return parseState(await readJson(join(dir, "state.json")), config);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw error;
  }
}
export async function saveState(dir: string, state: State): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const temp = join(dir, `state-${randomUUID()}.tmp`);
  try {
    await writeFile(temp, JSON.stringify(state, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temp, join(dir, "state.json"));
  } finally {
    await unlink(temp).catch(() => {});
  }
}
export async function withLock<T>(
  dir: string,
  action: () => Promise<T>,
): Promise<T> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, "lock");
  const file = await open(path, "wx", 0o600).catch(() => {
    throw new Error(
      "State is locked. Check for a running process before removing a stale lock.",
    );
  });
  try {
    await file.writeFile(String(process.pid));
    return await action();
  } finally {
    await file.close();
    await unlink(path);
  }
}
/** Local-only delivery adapter. Never opens a WhatsApp connection. */
export class FileOutbox implements Transport {
  constructor(
    private dir: string,
    private allowed: string[],
  ) {}
  async send(groupId: string, text: string, id: string): Promise<void> {
    if (!this.allowed.includes(groupId))
      throw new Error("Destination not allowed");
    if (!text.trim() || text.length > 3000)
      throw new Error("Invalid delivery text");
    if (!/^[a-f0-9]{64}$/u.test(id)) throw new Error("Invalid delivery id");
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const body = JSON.stringify({ id, groupId, text }, null, 2) + "\n",
      path = join(this.dir, `${id}.json`);
    try {
      await writeFile(path, body, { mode: 0o600, flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if ((await readFile(path, "utf8")) !== body)
        throw new Error("Outbox receipt collision");
    }
  }
}
