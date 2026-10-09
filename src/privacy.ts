export interface Exposure {
  category: string;
  count: number;
}
const rules: { category: string; pattern: RegExp }[] = [
  {
    category: "provider-token",
    pattern:
      /\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/gu,
  },
  {
    category: "private-key",
    pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/gu,
  },
  {
    category: "authorization",
    pattern: /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}/giu,
  },
  {
    category: "secret-assignment",
    pattern:
      /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\b["']?\s*[:=]\s*["']?[A-Za-z0-9+\/_=-]{8,}/giu,
  },
  {
    category: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gu,
  },
  { category: "phone", pattern: /\+\d[\d ().-]{8,}\d/gu },
  {
    category: "whatsapp-id",
    pattern: /\b\d{6,}(?:-\d+)?@(?:g\.us|s\.whatsapp\.net)\b/gu,
  },
  {
    category: "local-path",
    pattern: /(?:\/Users\/|\/home\/|[A-Z]:\\Users\\)[^\s"'<>]+/gu,
  },
  {
    category: "url-credential",
    pattern: /https?:\/\/[^\s/"']+:[^\s/"']+@[^\s"']+/giu,
  },
];
function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
function patterns(terms: string[]): { category: string; pattern: RegExp }[] {
  return [
    ...rules.map((r) => ({
      ...r,
      pattern: new RegExp(r.pattern.source, r.pattern.flags),
    })),
    ...terms
      .filter((t) => t.trim().length >= 3)
      .map((t) => ({
        category: "owner-private-term",
        pattern: new RegExp(escape(t), "giu"),
      })),
  ];
}
export function scanPublic(text: string, terms: string[] = []): Exposure[] {
  return patterns(terms).flatMap(({ category, pattern }) => {
    const count = [...text.matchAll(pattern)].length;
    return count ? [{ category, count }] : [];
  });
}
export function redactProse(text: string, terms: string[] = []): string {
  let result = text;
  for (const { pattern } of patterns(terms))
    result = result.replace(pattern, "[REDACTED]");
  return result;
}
export function assertPublic(text: string, terms: string[] = []): void {
  const found = scanPublic(text, terms);
  if (found.length)
    throw new Error(
      "Export blocked: " +
        [...new Set(found.map((f) => f.category))].join(", ") +
        ". Remove or replace private values locally, then prepare a new bundle.",
    );
}
export function allowedExportPath(path: string): boolean {
  if (
    !/^[A-Za-z0-9._/-]+$/u.test(path) ||
    path.startsWith("/") ||
    path.split("/").some((p) => !p || p === "." || p === "..")
  )
    return false;
  if (
    path
      .split("/")
      .some((p) =>
        [
          ".lookout",
          ".env",
          "sessions",
          "chats",
          "logs",
          "credentials",
          "auth.json",
          "profile.json",
          "private",
        ].includes(p.toLowerCase()),
      ) ||
    /\.local\./u.test(path)
  )
    return false;
  return (
    /^(?:src\/|test\/|scripts\/)[A-Za-z0-9._/-]+\.ts$/u.test(path) ||
    /^docs\/[A-Za-z0-9_/-]+\.md$/u.test(path) ||
    /^examples\/[a-z0-9.-]+\.json$/u.test(path) ||
    [
      "README.md",
      "AGENTS.md",
      "CONTRIBUTING.md",
      "CHECKPOINT.md",
      "LICENSE",
      "package.json",
      "package-lock.json",
      "tsconfig.json",
      ".gitignore",
      ".prettierignore",
      ".github/workflows/ci.yml",
    ].includes(path)
  );
}
