import i18n from "@/i18n";
import {
  launchFeedback,
  type LaunchError,
  type LaunchSource,
} from "@/lib/launchFeedback";
import { CoreAPI } from "@/lib/coreApi";
import { logger } from "@/lib/logger";
import { usePreferencesStore } from "@/lib/preferencesStore";
import type { CatalogEntry, LocalPlatform } from "./catalog";
import { initLocalMedia, localPlatform, playLocal } from "./player";
import { findLocalMatch, parseToken, type LocalMatch } from "./resolve";
import { useLocalPlaybackStore } from "./store";

/**
 * Decides where a token plays.
 *
 * `#device` always sends it to the connected Core. `#app` plays it here, and
 * fails here when nothing matches rather than sending it on. Without a trait
 * the "Play on" setting picks: set to the device, the token goes there as
 * before, connected or not, so a short drop still queues it for Core; set to
 * this app, the app plays what it can match and sends everything else on.
 */

export type RouteDecision =
  | { kind: "device" }
  | { kind: "local"; match: LocalMatch }
  | { kind: "unavailable"; reason: "notPlayable" | "notFound" };

export interface RouteContext {
  playOn: "device" | "app";
  catalog: CatalogEntry[];
  platform: LocalPlatform;
}

export function decideRoute(text: string, ctx: RouteContext): RouteDecision {
  const { target, request } = parseToken(text, ctx.platform);
  if (target === "device") return { kind: "device" };
  const wantsApp = target === "app";
  if (!wantsApp && ctx.playOn === "device") {
    return { kind: "device" };
  }
  if (!request) {
    return wantsApp
      ? { kind: "unavailable", reason: "notPlayable" }
      : { kind: "device" };
  }
  const match = findLocalMatch(request, ctx.catalog);
  if (match) return { kind: "local", match };
  return wantsApp
    ? { kind: "unavailable", reason: "notFound" }
    : { kind: "device" };
}

export interface LocalRunOptions {
  /** Runs launch feedback for this source; without one there is none. */
  source?: LaunchSource;
  /** Show a failure on the caller's own surface instead of returning it. */
  onError?: (error: LaunchError) => void;
}

/**
 * The outcome of trying a token in the app: "device" means send it to Core
 * as usual; true and false are a finished local launch, played or failed.
 */
export type LocalRunResult = "device" | boolean;

function localError(message: string): LaunchError {
  return { message, category: null, cancelled: false };
}

/**
 * Plays a token in the app when routing says so. Launch feedback runs the
 * same beats as a Core launch, and a failure goes to `onError` or, without
 * one, to the returned error for the caller to show.
 */
export async function runLocally(
  text: string,
  options: LocalRunOptions,
): Promise<{ result: LocalRunResult; error?: LaunchError }> {
  const { source, onError } = options;
  // Nothing to match a bare UID against: Core owns UID mappings.
  if (text.trim() === "") return { result: "device" };

  await initLocalMedia();
  const { playOn } = usePreferencesStore.getState();
  const decision = decideRoute(text, {
    playOn,
    catalog: useLocalPlaybackStore.getState().catalog,
    platform: localPlatform(),
  });
  if (decision.kind === "device") return { result: "device" };

  const launchId = source ? launchFeedback.begin(source) : null;
  const fail = (error: LaunchError) => {
    if (launchId !== null) launchFeedback.failed(launchId, error);
    onError?.(error);
    return { result: false as const, error };
  };

  if (decision.kind === "unavailable") {
    return fail(
      localError(
        i18n.t(
          decision.reason === "notFound"
            ? "localMedia.notFound"
            : "localMedia.notPlayable",
        ),
      ),
    );
  }

  const { match } = decision;
  try {
    await playLocal(match);
  } catch (e) {
    logger.error("local playback failed", e, {
      category: "general",
      action: "playLocal",
      system: match.system,
    });
    return fail(localError(i18n.t("localMedia.playFailed")));
  }
  if (launchId !== null) {
    launchFeedback.mediaStarted({
      name: match.title,
      systemId: match.system,
      systemName: match.system,
      path: "",
    });
  }
  return { result: true };
}

/** A token the app took on but could not play; its message is for people. */
export class LocalPlaybackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalPlaybackError";
  }
}

/**
 * Runs a script from an on-screen control: in the app when routing says so,
 * otherwise on Core. Rejects with `LocalPlaybackError` for a local failure
 * and with Core's error for a device one.
 */
export async function runScript(text: string) {
  const { result, error } = await runLocally(text, {});
  if (result === "device") {
    await CoreAPI.run({ uid: "", text });
    return;
  }
  if (!result) {
    throw new LocalPlaybackError(
      error?.message ?? i18n.t("localMedia.playFailed"),
    );
  }
}
