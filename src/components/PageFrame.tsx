import { useStatusStore } from "@/lib/store";
import { BackIcon } from "../lib/images";
import { RefObject } from "react";

interface PageFrameProps {
  children: React.ReactNode;
  title?: string;
  back?: () => void;
  scrollRef?: RefObject<HTMLDivElement | null>;
}

export function PageFrame(props: PageFrameProps) {
  const safeInsets = useStatusStore((state) => state.safeInsets);

  return (
    <div className="flex h-full w-full flex-col">
      <div
        className="bg-background sticky top-0 z-10"
        style={{
          paddingTop: `calc(1rem + ${safeInsets.top})`,
          paddingRight: `calc(1rem + ${safeInsets.right})`,
          paddingLeft: `calc(1rem + ${safeInsets.left})`,
          paddingBottom: props.title || props.back ? "1rem" : 0
        }}
      >
        {(props.title || props.back) && (
          <div className="grid min-h-8 grid-cols-5 items-center justify-center gap-4">
            <div className="col-span-1 flex">
              {props.back && (
                <div onClick={props.back} className="cursor-pointer">
                  <BackIcon size="24" />
                </div>
              )}
            </div>
            <div className="col-span-3 flex items-center justify-center text-center">
              {props.title && (
                <h1 className="text-foreground text-xl">{props.title}</h1>
              )}
            </div>
            <div className="col-span-1" />
          </div>
        )}
      </div>
      <div
        ref={props.scrollRef}
        className="flex-1 overflow-y-auto"
        style={{
          paddingRight: `calc(1rem + ${safeInsets.right})`,
          paddingLeft: `calc(1rem + ${safeInsets.left})`,
          paddingBottom: `calc(1rem + 80px + ${safeInsets.bottom})`
        }}
      >
        {props.children}
      </div>
    </div>
  );
}
