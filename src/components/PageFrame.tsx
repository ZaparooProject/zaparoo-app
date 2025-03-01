import {
  safeAreaBottomPx,
  safeAreaLeftPx,
  safeAreaRightPx,
  safeAreaTopPx
} from "@/lib/safeArea";
import { BackIcon } from "../lib/images";

interface PageFrameProps {
  children: React.ReactNode;
  title?: string;
  back?: () => void;
}

export function PageFrame(props: PageFrameProps) {
  return (
    <div
      className="w-dvh h-dvh overflow-y-auto"
      style={{
        paddingBottom: `calc(1rem + 80px + ${safeAreaTopPx} + ${safeAreaBottomPx})`,
        marginTop: safeAreaTopPx,
        marginBottom: safeAreaBottomPx,
        paddingTop: "1rem",
        paddingRight: `calc(1rem + ${safeAreaRightPx})`,
        paddingLeft: `calc(1rem + ${safeAreaLeftPx})`
      }}
    >
      {props.title || props.back ? (
        <div className="mb-3 grid min-h-8 grid-cols-5 items-center justify-center gap-4">
          <div className="col-span-1 flex">
            {props.back && (
              <div onClick={props.back} className="cursor-pointer">
                <BackIcon size="24" />
              </div>
            )}
          </div>
          <div className="col-span-3 flex items-center justify-center text-center">
            {props.title && (
              <h1 className="text-xl text-foreground">{props.title}</h1>
            )}
          </div>
          <div className="col-span-1" />
        </div>
      ) : null}
      {props.children}
    </div>
  );
}
