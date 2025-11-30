import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/create/text")({
  beforeLoad: () => {
    throw redirect({
      to: "/create/custom",
    });
  },
});
