import type { TagInfo } from "@/lib/models";
import { parseTitleZapScript } from "@/lib/titleZapScript";

export interface MediaWriteSource {
  path: string;
  relativePath?: string;
  zapScript?: string;
  tags: readonly TagInfo[];
}

function nonEmptyPath(value: string | undefined): string | null {
  return value?.trim() ? value : null;
}

function nonEmptyZapScript(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export function getMediaWritePath(media: MediaWriteSource): string {
  return nonEmptyPath(media.relativePath) ?? nonEmptyPath(media.path) ?? "";
}

export function getDefaultMediaWriteValue(
  media: MediaWriteSource,
): string | null {
  return (
    nonEmptyZapScript(media.zapScript) ??
    nonEmptyPath(media.relativePath) ??
    nonEmptyPath(media.path)
  );
}

export function hasMultipleMediaWriteTargets(media: MediaWriteSource): boolean {
  const zapScript = nonEmptyZapScript(media.zapScript);
  const path = getMediaWritePath(media);
  return Boolean(zapScript && path && zapScript !== path);
}

export function shouldSelectMediaWriteTarget(media: MediaWriteSource): boolean {
  const zapScript = nonEmptyZapScript(media.zapScript);
  return Boolean(
    hasMultipleMediaWriteTargets(media) ||
    (zapScript && parseTitleZapScript(zapScript)),
  );
}
