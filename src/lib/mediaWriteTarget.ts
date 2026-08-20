import type { TagInfo } from "@/lib/models";
import { parseTitleZapScript } from "@/lib/titleZapScript";

export interface MediaWriteSource {
  path: string;
  relativePath?: string;
  zapScript?: string;
  tags: readonly TagInfo[];
}

function nonEmptyWriteValue(value: string | undefined): string | null {
  return value?.trim() ? value : null;
}

export function getMediaWritePath(media: MediaWriteSource): string {
  return (
    nonEmptyWriteValue(media.relativePath) ??
    nonEmptyWriteValue(media.path) ??
    ""
  );
}

export function getDefaultMediaWriteValue(
  media: MediaWriteSource,
): string | null {
  return (
    nonEmptyWriteValue(media.zapScript) ??
    nonEmptyWriteValue(media.relativePath) ??
    nonEmptyWriteValue(media.path)
  );
}

export function hasMultipleMediaWriteTargets(media: MediaWriteSource): boolean {
  const zapScript = nonEmptyWriteValue(media.zapScript);
  const path = getMediaWritePath(media);
  return Boolean(zapScript && path && zapScript !== path);
}

export function shouldSelectMediaWriteTarget(media: MediaWriteSource): boolean {
  const zapScript = nonEmptyWriteValue(media.zapScript);
  return Boolean(
    hasMultipleMediaWriteTargets(media) ||
    (zapScript && parseTitleZapScript(zapScript)),
  );
}
