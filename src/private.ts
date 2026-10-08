import { homedir } from "node:os";
import {
  resolve,
  dirname,
  join,
  relative,
  isAbsolute,
  parse,
  basename,
} from "node:path";
import {
  lstat,
  realpath,
  mkdir,
  writeFile,
  rename,
  unlink,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { readJson } from "./storage.js";
export function defaultHome(): string {
  if (process.platform === "darwin")
    return join(homedir(), "Library", "Application Support", "Lookout");
  if (process.platform === "win32")
    return join(process.env.LOCALAPPDATA ?? homedir(), "Lookout");
  return join(
    process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
    "lookout",
  );
}
export async function canonicalPath(path: string): Promise<string> {
  const full = resolve(path);
  try {
    return await realpath(full);
  } catch (e) {
    if (
      (e as NodeJS.ErrnoException).code !== "ENOENT" ||
      dirname(full) === full
    )
      throw e;
    return join(await canonicalPath(dirname(full)), basename(full));
  }
}
export function contains(parent: string, child: string): boolean {
  const r = relative(parent, child);
  return (
    r === "" ||
    (!r.startsWith(".." + (process.platform === "win32" ? "\\" : "/")) &&
      r !== ".." &&
      !isAbsolute(r))
  );
}
export async function checkoutRoot(start = process.cwd()): Promise<string> {
  let path = await canonicalPath(start);
  while (true) {
    try {
      await lstat(join(path, ".git"));
      return path;
    } catch (e) {
      if (!["ENOENT", "ENOTDIR"].includes((e as NodeJS.ErrnoException).code ?? "")) throw e;
    }
    if (dirname(path) === path) return await canonicalPath(start);
    path = dirname(path);
  }
}
export async function assertOutsideCheckout(
  path: string,
  repo = process.cwd(),
): Promise<string> {
  const full = await canonicalPath(path),
    root = await checkoutRoot(repo);
  if (contains(root, full))
    throw new Error(
      "Private data must be outside the checkout. Choose --home outside every Git repository.",
    );
  let parent = full;
  while (true) {
    try {
      await lstat(join(parent, ".git"));
      throw new Error(
        "Private data cannot be stored inside another Git repository.",
      );
    } catch (e) {
      if (!["ENOENT", "ENOTDIR"].includes((e as NodeJS.ErrnoException).code ?? "")) throw e;
    }
    if (dirname(parent) === parent) return full;
    parent = dirname(parent);
  }
}
export async function privateHome(
  path = defaultHome(),
  repo = process.cwd(),
  create = false,
): Promise<string> {
  const home = await assertOutsideCheckout(path, repo);
  if (home === parse(home).root || home === (await canonicalPath(homedir())))
    throw new Error(
      "Choose a dedicated private directory, not a filesystem root or your entire home.",
    );
  const check = async () => {
    const stat = await lstat(resolve(path));
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error(
        "Private home must be a regular directory, not a symlink.",
      );
    if (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
      throw new Error(
        "Private home is accessible to other users. Review it and set mode 0700 before continuing.",
      );
  };
  try {
    await check();
  } catch (e) {
    if (!["ENOENT", "ENOTDIR"].includes((e as NodeJS.ErrnoException).code ?? "")) throw e;
  }
  if (create) {
    await mkdir(home, { recursive: true, mode: 0o700 });
    await check();
  }
  return home;
}
export async function regularFile(path: string): Promise<void> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error("Expected a regular file, not a symlink.");
}
export async function readPrivate(
  home: string,
  name: string,
): Promise<unknown | null> {
  const path = join(home, name);
  try {
    await regularFile(path);
    return await readJson(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
export async function writePrivate(
  home: string,
  name: string,
  value: unknown,
): Promise<void> {
  if (!/^[a-z0-9.-]+$/u.test(name)) throw new Error("Invalid private filename");
  const path = join(home, name),
    tmp = join(home, "write-" + randomUUID() + ".tmp");
  try {
    await regularFile(path);
  } catch (e) {
    if (!["ENOENT", "ENOTDIR"].includes((e as NodeJS.ErrnoException).code ?? "")) throw e;
  }
  try {
    await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    await rename(tmp, path);
  } finally {
    await unlink(tmp).catch(() => {});
  }
}
