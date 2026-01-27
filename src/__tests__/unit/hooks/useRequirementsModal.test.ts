import { describe, it, expect, beforeEach } from "vitest";
import { useRequirementsStore } from "../../../hooks/useRequirementsModal";
import type { PendingRequirement } from "../../../lib/models";

describe("useRequirementsStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useRequirementsStore.setState({
      isOpen: false,
      pendingRequirements: [],
    });
  });

  it("should have default initial state", () => {
    const state = useRequirementsStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.pendingRequirements).toEqual([]);
  });

  it("should trigger modal with requirements", () => {
    const { trigger } = useRequirementsStore.getState();

    const requirements: PendingRequirement[] = [
      {
        type: "terms_acceptance",
        description: "Accept terms",
        endpoint: "/account/requirements",
      },
      {
        type: "age_verified",
        description: "Verify age",
        endpoint: "/account/requirements",
      },
    ];

    trigger(requirements);

    const state = useRequirementsStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.pendingRequirements).toEqual(requirements);
  });

  it("should close modal and clear requirements", () => {
    const { trigger, close } = useRequirementsStore.getState();

    // First open the modal
    trigger([
      {
        type: "terms_acceptance",
        description: "Accept terms",
        endpoint: "/account/requirements",
      },
    ]);

    expect(useRequirementsStore.getState().isOpen).toBe(true);

    // Then close it
    close();

    const state = useRequirementsStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.pendingRequirements).toEqual([]);
  });

  it("should replace requirements when triggered multiple times", () => {
    const { trigger } = useRequirementsStore.getState();

    const firstRequirements: PendingRequirement[] = [
      {
        type: "terms_acceptance",
        description: "Accept terms",
        endpoint: "/account/requirements",
      },
    ];

    const secondRequirements: PendingRequirement[] = [
      {
        type: "email_verified",
        description: "Verify email",
        endpoint: "/account/requirements",
      },
    ];

    trigger(firstRequirements);
    expect(useRequirementsStore.getState().pendingRequirements).toEqual(
      firstRequirements,
    );

    trigger(secondRequirements);
    expect(useRequirementsStore.getState().pendingRequirements).toEqual(
      secondRequirements,
    );
  });

  it("should handle empty requirements array", () => {
    const { trigger } = useRequirementsStore.getState();

    trigger([]);

    const state = useRequirementsStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.pendingRequirements).toEqual([]);
  });
});
