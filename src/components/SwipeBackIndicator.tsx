import { ArrowLeft } from "lucide-react";
import { useStatusStore } from "@/lib/store";

interface SwipeBackIndicatorProps {
  progress: number;
}

export function SwipeBackIndicator({ progress }: SwipeBackIndicatorProps) {
  const safeLeft = useStatusStore((state) => state.safeInsets.left);
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  const active = clampedProgress > 0;
  const opacity = Math.min(clampedProgress * 1.6, 1);
  const translateX = -20 + clampedProgress * 32;
  const scale = 0.85 + clampedProgress * 0.15;

  return (
    <div
      data-swipe-back-indicator=""
      data-ready={clampedProgress === 1 ? "true" : "false"}
      aria-hidden="true"
      className="bg-foreground text-primary-foreground pointer-events-none fixed top-1/2 z-20 flex h-14 w-14 items-center justify-center rounded-full border border-black/10 shadow-lg"
      style={{
        left: `calc(${safeLeft} + 0.25rem)`,
        opacity,
        transform: `translate3d(${translateX}px, -50%, 0) scale(${scale})`,
        transition: active
          ? "none"
          : "opacity 140ms ease-out, transform 140ms ease-out",
        willChange: "opacity, transform",
      }}
    >
      <ArrowLeft size={32} strokeWidth={2.5} />
    </div>
  );
}
