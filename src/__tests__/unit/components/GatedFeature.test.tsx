import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../test-utils";
import { GatedFeature } from "@/components/GatedFeature";
import type { FeatureId } from "@/lib/featureGates";

vi.mock("@/hooks/useCoreFeature", () => ({
  useCoreFeature: vi.fn(),
}));

import { useCoreFeature } from "@/hooks/useCoreFeature";

const mockFeatureId = "testFeature" as FeatureId;

describe("GatedFeature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render children when feature is available", () => {
    vi.mocked(useCoreFeature).mockReturnValue({
      available: true,
      requiredVersion: "2.5.0",
      currentVersion: "2.6.0",
      marquee: false,
    });

    render(
      <GatedFeature featureId={mockFeatureId}>
        <span>Feature content</span>
      </GatedFeature>,
    );

    expect(screen.getByText("Feature content")).toBeInTheDocument();
  });

  it("should render nothing when feature is unavailable and not marquee", () => {
    vi.mocked(useCoreFeature).mockReturnValue({
      available: false,
      requiredVersion: "2.5.0",
      currentVersion: "2.4.0",
      marquee: false,
    });

    render(
      <GatedFeature featureId={mockFeatureId}>
        <span>Feature content</span>
      </GatedFeature>,
    );

    expect(screen.queryByText("Feature content")).not.toBeInTheDocument();
  });

  it("should render disabled wrapper with tooltip when feature is unavailable and marquee", () => {
    vi.mocked(useCoreFeature).mockReturnValue({
      available: false,
      requiredVersion: "2.5.0",
      currentVersion: "2.4.0",
      marquee: true,
    });

    render(
      <GatedFeature featureId={mockFeatureId}>
        <span>Feature content</span>
      </GatedFeature>,
    );

    expect(screen.getByText("Feature content")).toBeInTheDocument();
    const wrapper = screen
      .getByText("Feature content")
      .closest('[title="features.requiresCoreVersion"]');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveAttribute(
      "aria-label",
      "features.requiresCoreVersion",
    );
  });
});
