import { ReactNode } from "react";
import classNames from "classnames";
import { useStatusStore } from "@/lib/store.ts";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";

export function SlideModal(props: {
  isOpen: boolean;
  close: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const swipeHandlers = useSmartSwipe({
    onSwipeDown: props.close,
    preventScrollOnSwipe: false,
    swipeThreshold: 50,
    velocityThreshold: 0.3
  });

  const safeInsets = useStatusStore((state) => state.safeInsets);

  return (
    <>
      {/* Overlay */}
      {props.isOpen && (
        <div
          className="fixed inset-0 z-40 bg-transparent"
          onClick={props.close}
          onKeyDown={(e) => e.key === 'Escape' && props.close()}
          role="button"
          tabIndex={0}
          aria-label="Close modal"
        />
      )}

      {/* Modal */}
      <div
        className={classNames(
          "z-50",
          "rounded-tl-md",
          "rounded-tr-md",
          "border",
          "border-b-0",
          "border-solid",
          "border-[rgba(255,255,255,0.13)]",
          "bg-[rgba(17,25,40,0.7)]",
          "p-3",
          "pt-0",
          "mix-blend-normal",
          "backdrop-blur-lg",
          props.className
        )}
        style={{
          position: "fixed",
          bottom: props.isOpen ? "0" : "-100vh",
          left: 0,
          width: "100%",
          transition: "bottom 0.2s ease-in-out",
          maxHeight: `calc(100vh - ${safeInsets.top} - 75px)`,
          paddingBottom: `calc(0.75rem + ${safeInsets.bottom})`
        }}
      >
        <div
          className="flex w-full justify-center p-3"
          style={{ overflowY: "initial" }}
          {...swipeHandlers}
        >
          <div
            onClick={props.close}
            onKeyDown={(e) => e.key === 'Enter' && props.close()}
            role="button"
            tabIndex={0}
            aria-label="Drag to close"
            className="h-[5px] w-[80px] rounded-full bg-[#00E0FF]"
          ></div>
        </div>
        <p className="text-center text-lg">{props.title}</p>
        <div
          style={{
            maxHeight: "80vh",
            overflowY: "auto"
          }}
        >
          {props.children}
        </div>
      </div>
    </>
  );
}
