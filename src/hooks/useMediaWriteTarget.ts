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

function getAvailableWriteMode(media: MediaWriteSource | null): MediaWriteMode {
  if (!media) return sessionWriteMode;
  if (sessionWriteMode === "zapScript" && media.zapScript?.trim()) {
    return "zapScript";
  }
  if (sessionWriteMode === "path" && getMediaWritePath(media)) return "path";
  return media.zapScript?.trim() ? "zapScript" : "path";
}

export function __resetMediaWriteModeForTests() {
  sessionWriteMode = "zapScript";
}

export function useMediaWriteTarget(media: MediaWriteSource | null) {
  const parsedZapScript = useMemo(
    () =>
      media?.zapScript?.trim() ? parseTitleZapScript(media.zapScript) : null,
    [media],
  );
  const [writeMode, setWriteModeState] = useState<MediaWriteMode>(() =>
    getAvailableWriteMode(media),
  );
  const [selectedTagKeys, setSelectedTagKeys] = useState<Set<string>>(
    () => new Set(parsedZapScript?.tags.map(titleTagKey) ?? []),
  );

  useLayoutEffect(() => {
    if (!media) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset before paint when external media selection changes.
    setWriteModeState(getAvailableWriteMode(media));
    setSelectedTagKeys(new Set(parsedZapScript?.tags.map(titleTagKey) ?? []));
  }, [media, parsedZapScript]);

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
  const path = media ? getMediaWritePath(media) : "";
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
