import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/wui/Button";
import { ProgressBar } from "@/components/ProgressBar";
import {
  LibraryArtworkFrame,
  LibraryArtworkPlate,
} from "@/components/library/LibraryArtworkFrame";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useFavourites, useRecentlyPlayed } from "@/hooks/useHomeCoverRows";
import { useSystemName } from "@/hooks/useSystemName";
import { launchFeedback } from "@/lib/launchFeedback";
import { useShakeSheetStore } from "@/lib/shakeSheetStore";
import { useStatusStore } from "@/lib/store";
import type { MediaBrowseEntry } from "@/lib/models";

/** How long a landed launch stays on screen. */
export const SHAKE_SHEET_DISMISS_MS = 4000;
/** Plain tiles spun when Core has no recent media to show. */
const PLAIN_TILE_COUNT = 6;
/** Time for one tile to pass the window. */
const REEL_TILE_MS = 90;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
// Matches SlideModal's sheet slide.
const SHEET_TRANSITION = "transform 0.2s ease-in-out";

const REEL_TILE_CLASS = "h-32 w-24";

function ReelTile({
  entry,
  deviceKey,
}: {
  entry: MediaBrowseEntry | null;
  deviceKey: string;
}) {
  if (!entry) {
    return (
      <LibraryArtworkPlate className={REEL_TILE_CLASS}>
        <span className="block size-full" />
      </LibraryArtworkPlate>
    );
  }
  return (
    <LibraryArtworkFrame
      entry={entry}
      systemId={entry.systemId ?? ""}
      deviceKey={deviceKey}
      maxSize={256}
      priority="thumbnail"
      className={REEL_TILE_CLASS}
    />
  );
}

/** A column of covers that spins until the launch lands. */
function CoverReel({ spinning }: { spinning: boolean }) {
  const deviceKey = useActiveDeviceKey();
  const favourites = useFavourites();
  const recent = useRecentlyPlayed();
  const trackRef = useRef<HTMLDivElement>(null);
  // Favourites first: they are the games people chose, so they most often
  // have cover art. Recently played fills in, without repeats.
  const seen = new Set<string>();
  const media = [...favourites, ...recent].filter((entry) => {
    const key = `${entry.systemId ?? ""}:${entry.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const tiles: (MediaBrowseEntry | null)[] =
    media.length > 0 ? media : Array(PLAIN_TILE_COUNT).fill(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!spinning || !track || typeof track.animate !== "function") return;
    // The track holds the tiles twice, so moving it by half loops seamlessly.
    const animation = track.animate(
      [
        { transform: "translate3d(0, 0, 0)" },
        { transform: "translate3d(0, -50%, 0)" },
      ],
      { duration: tiles.length * REEL_TILE_MS, iterations: Infinity },
    );
    return () => animation.cancel();
  }, [spinning, tiles.length]);

  return (
    <div className={`${REEL_TILE_CLASS} overflow-hidden`} aria-hidden="true">
      <div ref={trackRef} className="flex flex-col">
        {(spinning ? [...tiles, ...tiles] : tiles.slice(0, 1)).map(
          (entry, index) => (
            <ReelTile
              key={`${index}:${entry?.systemId ?? ""}:${entry?.path ?? ""}`}
              entry={entry}
              deviceKey={deviceKey}
            />
          ),
        )}
      </div>
    </div>
  );
}

function LandedCover({
  name,
  systemId,
  path,
}: {
  name: string;
  systemId: string;
  path: string;
}) {
  const deviceKey = useActiveDeviceKey();
  return (
    <LibraryArtworkFrame
      entry={{ name, path, systemId, type: "media" }}
      systemId={systemId}
      deviceKey={deviceKey}
      maxSize={256}
      priority="detail"
      className={REEL_TILE_CLASS}
    />
  );
}

/**
 * Non-modal bottom sheet for shake to launch. It shows the charge while the
 * user shakes, then follows the launch until Core reports the result. Random
 * commands spin a cover reel that only stops on the launched media.
 */
export function ShakeSheet() {
  const { t } = useTranslation();
  const titleId = useId();
  const phase = useShakeSheetStore((state) => state.phase);
  const progress = useShakeSheetStore((state) => state.progress);
  const random = useShakeSheetStore((state) => state.random);
  const media = useShakeSheetStore((state) => state.media);
  const error = useShakeSheetStore((state) => state.error);
  const dismiss = useShakeSheetStore((state) => state.dismiss);
  const safeBottom = useStatusStore((state) => state.safeInsets.bottom);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const systemName = useSystemName(
    media?.systemId ?? "",
    media?.systemName ?? "",
  );

  // Follow the shake's own launch through Core.
  useEffect(
    () =>
      launchFeedback.subscribe((event) => {
        const sheet = useShakeSheetStore.getState();
        if (sheet.phase !== "launching") return;
        if (event.kind === "started") {
          if (event.source === "shake") {
            sheet.started(event.id);
          } else if (sheet.launchId !== null) {
            // Another launch replaced this one; its result will never land.
            sheet.abandon();
          }
        } else if (event.kind === "launched" && event.id === sheet.launchId) {
          sheet.land(event.media);
        }
      }),
    [],
  );

  useEffect(() => {
    if (phase !== "launched") return;
    const timer = setTimeout(dismiss, SHAKE_SHEET_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [phase, dismiss]);

  const open = phase !== "idle";
  const mediaName = media?.name ?? "";

  let title = "";
  let status = "";
  switch (phase) {
    case "charging":
      title = t("shakeSheet.charging");
      break;
    case "launching":
      title = t("shakeSheet.launching");
      status = title;
      break;
    case "launched":
      title = mediaName || t("shakeSheet.launched");
      status = mediaName
        ? t("shakeSheet.launchedMedia", { media: mediaName })
        : t("shakeSheet.launched");
      break;
    case "failed":
      title = t("shakeSheet.failed");
      status = error ? `${title}: ${error}` : title;
      break;
  }

  const showReel = random && (phase === "charging" || phase === "launching");
  const showLandedCover = random && phase === "launched" && media !== null;

  return (
    <>
      {/* Always mounted so state changes are announced without moving focus. */}
      <div role="status" aria-live="polite" className="sr-only">
        {status}
      </div>
      <section
        aria-labelledby={titleId}
        aria-hidden={!open}
        inert={!open}
        data-testid="shake-sheet"
        className="border-border bg-surface-raised fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-2xl flex-col rounded-t-lg border border-b-0 border-solid px-4 pt-3 shadow-[0_-8px_32px_var(--material-shadow),inset_0_1px_0_var(--material-highlight)]"
        style={{
          paddingBottom: `calc(${safeBottom} + 1rem)`,
          transform: open ? "translate3d(0, 0, 0)" : "translate3d(0, 100%, 0)",
          transition: SHEET_TRANSITION,
          pointerEvents: open ? "auto" : "none",
          boxShadow: open ? undefined : "none",
        }}
      >
        {open && (
          <div className="flex flex-col items-center gap-3">
            {showReel && <CoverReel spinning={!reducedMotion} />}
            {showLandedCover && (
              <LandedCover
                name={media.name}
                systemId={media.systemId}
                path={media.path}
              />
            )}
            <div className="flex w-full flex-col items-center gap-1">
              <h2
                id={titleId}
                className="text-center text-lg leading-snug font-semibold tracking-tight wrap-anywhere"
              >
                {title}
              </h2>
              {phase === "launched" && mediaName && systemName && (
                <p className="text-muted-foreground text-sm">{systemName}</p>
              )}
              {phase === "failed" && error && (
                <p className="text-error text-center text-sm wrap-anywhere">
                  {error}
                </p>
              )}
            </div>
            {(phase === "charging" || phase === "launching") && (
              <ProgressBar
                label={t("shakeSheet.charge")}
                percent={progress * 100}
                valueNow={Math.round(progress * 100)}
              />
            )}
            {phase === "failed" && (
              <Button
                label={t("nav.close")}
                variant="outline"
                className="w-full"
                onClick={dismiss}
              />
            )}
          </div>
        )}
      </section>
    </>
  );
}
