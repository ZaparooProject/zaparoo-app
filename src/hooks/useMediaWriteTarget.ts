import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import type { TagInfo } from "@/lib/models";
import {
  getMediaWritePath,
  type MediaWriteSource,
} from "@/lib/mediaWriteTarget";
import {
  buildTitleZapScript,
  parseTitleZapScript,
  titleTagKey,
} from "@/lib/titleZapScript";

export type MediaWriteMode = "path" | "zapScript";

let sessionWriteMode: MediaWriteMode = "zapScript";

function getAvailableWriteModeFromValues(
  zapScript: string | undefined,
  path: string,
): MediaWriteMode {
  if (sessionWriteMode === "zapScript" && zapScript?.trim()) {
    return "zapScript";
  }
  if (sessionWriteMode === "path" && path) return "path";
  return zapScript?.trim() ? "zapScript" : "path";
}

function getAvailableWriteMode(media: MediaWriteSource | null): MediaWriteMode {
  if (!media) return sessionWriteMode;
  return getAvailableWriteModeFromValues(
    media.zapScript,
    getMediaWritePath(media),
  );
}

export function __resetMediaWriteModeForTests() {
  sessionWriteMode = "zapScript";
}

export function useMediaWriteTarget(media: MediaWriteSource | null) {
  const hasMedia = media !== null;
  const zapScript = media?.zapScript;
  const path = media ? getMediaWritePath(media) : "";
  const parsedZapScript = useMemo(
    () => (zapScript?.trim() ? parseTitleZapScript(zapScript) : null),
    [zapScript],
  );
  const [writeMode, setWriteModeState] = useState<MediaWriteMode>(() =>
    getAvailableWriteMode(media),
  );
  const [selectedTagKeys, setSelectedTagKeys] = useState<Set<string>>(
    () => new Set(parsedZapScript?.tags.map(titleTagKey) ?? []),
  );

  useLayoutEffect(() => {
    if (!hasMedia) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset before paint when external media content changes.
    setWriteModeState(getAvailableWriteModeFromValues(zapScript, path));
    setSelectedTagKeys(new Set(parsedZapScript?.tags.map(titleTagKey) ?? []));
  }, [hasMedia, parsedZapScript, path, zapScript]);

  const setWriteMode = useCallback((mode: MediaWriteMode) => {
    sessionWriteMode = mode;
    setWriteModeState(mode);
  }, []);

  const selectedZapScriptTags = useMemo(() => {
    if (!media || !parsedZapScript) return [];

    const orderedTags = [...parsedZapScript.tags, ...media.tags];
    const seenTags = new Set<string>();
    return orderedTags.filter((tag) => {
      const key = titleTagKey(tag);
      if (!selectedTagKeys.has(key) || seenTags.has(key)) return false;
      seenTags.add(key);
      return true;
    });
  }, [media, parsedZapScript, selectedTagKeys]);
  const customizedZapScript = parsedZapScript
    ? buildTitleZapScript(parsedZapScript, selectedZapScriptTags)
    : media?.zapScript?.trim()
      ? media.zapScript
      : undefined;
  const selectedValue =
    writeMode === "zapScript" && customizedZapScript
      ? customizedZapScript
      : path;

  const toggleTag = (tag: TagInfo) => {
    const key = titleTagKey(tag);
    setSelectedTagKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    setWriteMode("zapScript");
  };

  return {
    customizedZapScript,
    parsedZapScript,
    path,
    selectedTagKeys,
    selectedValue,
    setWriteMode,
    toggleTag,
    writeMode,
  };
}

export type MediaWriteTargetState = ReturnType<typeof useMediaWriteTarget>;
