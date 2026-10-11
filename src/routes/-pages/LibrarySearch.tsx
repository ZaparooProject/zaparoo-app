import { useRouter, useRouterState, useSearch } from "@tanstack/react-router";
import { LibraryGameSearch } from "@/components/library/LibraryGameSearch";

export function LibrarySearchPage() {
  const { system, tag } = useSearch({ from: "/library/search" });
  const router = useRouter();
  const state = useRouterState({ select: (state) => state.location.state });
  if (!system && !tag) return <LibraryGameSearch />;
  const scope = `metadata:${state.__TSR_key}:${JSON.stringify([system, tag])}`;
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
