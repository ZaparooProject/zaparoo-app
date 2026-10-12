import { useLayoutEffect } from "react";
import { useRouter, useRouterState, useSearch } from "@tanstack/react-router";
import { LibraryGameSearch } from "@/components/library/LibraryGameSearch";
import {
  libraryMetadataScope,
  useLibrarySessionStore,
} from "@/lib/librarySessionStore";

export function LibrarySearchPage() {
  const { system, tag } = useSearch({ from: "/library/search" });
  const router = useRouter();
  const state = useRouterState({ select: (state) => state.location.state });
  const scope =
    system || tag
      ? libraryMetadataScope(state.__TSR_key ?? "", system, tag)
      : null;
  // Runs after the page below has activated the device, so visiting an
  // exploration entry keeps it and forgets only the least recently used ones.
  useLayoutEffect(() => {
    if (scope) useLibrarySessionStore.getState().touchMetadataScope(scope);
  }, [scope]);
  if (!scope) return <LibraryGameSearch />;
  return (
    <LibraryGameSearch
      key={scope}
      sessionScope={scope}
      historyBack={
        state.appMetadataOrigin && router.history.canGoBack()
          ? () => router.history.back()
          : undefined
      }
      initialSearch={{
        query: "",
        system: system || "all",
        tags: tag ? [tag] : [],
      }}
    />
  );
}
