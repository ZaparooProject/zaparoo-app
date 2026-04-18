const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

// Mirrors Core's config.IsDevelopmentVersion logic.
// Treats empty, "DEVELOPMENT", pre-release suffixes, and unrecognised formats as
// dev builds, which automatically satisfy all feature gates.
export function isDevelopmentVersion(raw: string): boolean {
  if (!raw || raw === "DEVELOPMENT") return true;
  if (
    raw.includes("-dev") ||
    raw.includes("-rc") ||
    raw.includes("-beta") ||
    raw.includes("-alpha")
  )
    return true;
  return !SEMVER_RE.test(raw);
}

export function parseVersion(
  raw: string,
): { major: number; minor: number; patch: number } | null {
  const m = SEMVER_RE.exec(raw);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;
  return 0;
}

// Returns true when `current` is at or above `minimum`.
// null current → false (unknown version, conservatively deny).
// Dev build → true (dev builds pass every gate).
export function satisfies(current: string | null, minimum: string): boolean {
  if (current === null) return false;
  if (isDevelopmentVersion(current)) return true;
  return compareVersions(current, minimum) >= 0;
}
