import { useEffect } from "react";
import { useHaptics } from "@/hooks/useHaptics";
import { launchFeedback } from "@/lib/launchFeedback";

/**
 * Plays the two launch beats: a light tap when a token is read, then a
 * success or error notification when Core answers. Mounted once in the root
 * layout.
 */
export function useLaunchFeedbackHaptics() {
  const { impact, notification } = useHaptics();

  useEffect(
    () =>
      launchFeedback.subscribe((event) => {
        switch (event.kind) {
          case "read":
            if (!event.systemFeedback) {
              void impact("light");
            }
            break;
          case "launched":
            void notification("success");
            break;
          case "failed":
            void notification("error");
            break;
        }
      }),
    [impact, notification],
  );
}
