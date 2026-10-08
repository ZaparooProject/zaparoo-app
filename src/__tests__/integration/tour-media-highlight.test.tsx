import { afterEach, describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";
import { render, screen, waitFor } from "@/test-utils";
import { MediaDatabaseCard } from "@/components/MediaDatabaseCard";
import { useStatusStore } from "@/lib/store";
import { createAppTour } from "@/lib/tourService";

let tour: ReturnType<typeof createAppTour> | undefined;

afterEach(() => {
  tour?.cancel();
  tour = undefined;
});

describe("media tutorial highlight", () => {
  it("attaches padded guidance to the real disabled Update control", async () => {
    useStatusStore.setState({ connected: false });
    render(<MediaDatabaseCard />);
    const update = screen.getByRole("button", { name: "settings.updateDb" });
    expect(update).toBeDisabled();

    tour = createAppTour(
      vi.fn().mockResolvedValue(undefined),
      ((key: string) => key) as TFunction,
      false,
    );
    tour.show("media-database");

    await screen.findByText("tour.mediaDatabase.title");
    await waitFor(() =>
      expect(tour?.getCurrentStep()?.getTarget()).toContainElement(update),
    );
    expect(tour.getCurrentStep()?.options.modalOverlayOpeningPadding).toBe(8);
    expect(tour.getCurrentStep()?.options.modalOverlayOpeningRadius).toBe(4);
    expect(update).toBeDisabled();
  });
});
