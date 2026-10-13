import { useCallback } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Index } from "./Index";

/** The Zap route's page, opening the layout editor when the URL asks for it. */
export function IndexRoute() {
  const { customise } = useSearch({ from: "/" });
  const navigate = useNavigate();
  const handled = useCallback(() => {
    void navigate({ to: "/", search: {}, replace: true });
  }, [navigate]);

  return (
    <Index
      customiseOnArrival={customise === true}
      onCustomiseHandled={handled}
    />
  );
}
