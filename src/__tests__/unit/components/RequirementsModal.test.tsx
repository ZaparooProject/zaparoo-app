import { render, screen, fireEvent, waitFor } from "../../../test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { RequirementsModal } from "@/components/RequirementsModal";
import { useRequirementsStore } from "@/hooks/useRequirementsModal";
import type { PendingRequirement } from "@/lib/models";

// Mock external dependencies only
vi.mock("@capacitor-firebase/authentication", () => ({
  FirebaseAuthentication: {
    signOut: vi.fn().mockResolvedValue(undefined),
    sendEmailVerification: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
    getIdToken: vi.fn().mockResolvedValue({ token: "mock-token" }),
    getCurrentUser: vi.fn().mockResolvedValue({ user: null }),
  },
}));

vi.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases: {
    logOut: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: vi.fn().mockReturnValue("ios"),
    isNativePlatform: vi.fn().mockReturnValue(true),
  },
}));

vi.mock("@/lib/onlineApi", () => ({
  updateRequirements: vi.fn().mockResolvedValue({
    requirements: {
      email_verified: true,
      tos_accepted: true,
      privacy_accepted: true,
      age_verified: true,
    },
  }),
  getRequirements: vi.fn().mockResolvedValue({
    requirements: {
      email_verified: true,
      tos_accepted: true,
      privacy_accepted: true,
      age_verified: true,
    },
  }),
}));

vi.mock("@/lib/store", () => ({
  useStatusStore: vi.fn((selector) => {
    const state = {
      setLoggedInUser: vi.fn(),
    };
    return selector(state);
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    log: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("RequirementsModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the store state
    useRequirementsStore.setState({
      isOpen: false,
      pendingRequirements: [],
    });
  });

  it("should not render when closed", () => {
    render(<RequirementsModal />);
    expect(
      screen.queryByRole("dialog", { name: /requirements\.title/i }),
    ).not.toBeInTheDocument();
  });

  it("should render when open with TOS requirement", () => {
    const requirements: PendingRequirement[] = [
      {
        type: "terms_acceptance",
        description: "Accept terms",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Title may appear multiple times due to test-utils wrapper
    const titles = screen.getAllByText("requirements.title");
    expect(titles.length).toBeGreaterThan(0);
    // Checkboxes have their labels - may have multiple due to wrapper
    const tosLabels = screen.getAllByLabelText(/requirements\.tosLabel/);
    expect(tosLabels.length).toBeGreaterThan(0);
    const privacyLabels = screen.getAllByLabelText(
      /requirements\.privacyLabel/,
    );
    expect(privacyLabels.length).toBeGreaterThan(0);
  });

  it("should render age verification checkbox when required", () => {
    const requirements: PendingRequirement[] = [
      {
        type: "age_verified",
        description: "Verify age",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    expect(screen.getByLabelText(/requirements\.ageLabel/)).toBeInTheDocument();
  });

  it("should render email verification section when required", () => {
    const requirements: PendingRequirement[] = [
      {
        type: "email_verified",
        description: "Verify email",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    expect(
      screen.getByRole("button", {
        name: /requirements\.sendVerificationEmail/i,
      }),
    ).toBeInTheDocument();
  });

  it("should enable save button when TOS and privacy are checked", async () => {
    const requirements: PendingRequirement[] = [
      {
        type: "terms_acceptance",
        description: "Accept terms",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    const saveButton = screen.getByRole("button", {
      name: /requirements\.save/i,
    });
    expect(saveButton).toBeDisabled();

    // Check TOS - get first matching element
    const tosCheckboxes = screen.getAllByLabelText(/requirements\.tosLabel/);
    fireEvent.click(tosCheckboxes[0]!);
    // Check Privacy - get first matching element
    const privacyCheckboxes = screen.getAllByLabelText(
      /requirements\.privacyLabel/,
    );
    fireEvent.click(privacyCheckboxes[0]!);

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });
  });

  it("should enable save button when age is checked", async () => {
    const requirements: PendingRequirement[] = [
      {
        type: "age_verified",
        description: "Verify age",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    const saveButton = screen.getByRole("button", {
      name: /requirements\.save/i,
    });
    expect(saveButton).toBeDisabled();

    // Check age
    fireEvent.click(screen.getByLabelText(/requirements\.ageLabel/));

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });
  });

  it("should call updateRequirements when save is clicked", async () => {
    const requirements: PendingRequirement[] = [
      {
        type: "terms_acceptance",
        description: "Accept terms",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    // Check required checkboxes - get first matching elements
    const tosCheckboxes = screen.getAllByLabelText(/requirements\.tosLabel/);
    fireEvent.click(tosCheckboxes[0]!);
    const privacyCheckboxes = screen.getAllByLabelText(
      /requirements\.privacyLabel/,
    );
    fireEvent.click(privacyCheckboxes[0]!);

    // Click save
    const saveButton = screen.getByRole("button", {
      name: /requirements\.save/i,
    });
    fireEvent.click(saveButton);

    const { updateRequirements } = await import("@/lib/onlineApi");
    await waitFor(() => {
      expect(updateRequirements).toHaveBeenCalledWith({
        accept_tos: true,
        accept_privacy: true,
        age_verified: false,
      });
    });
  });

  it("should call signOut when logout is clicked", async () => {
    const requirements: PendingRequirement[] = [
      {
        type: "terms_acceptance",
        description: "Accept terms",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    const logoutButton = screen.getByRole("button", {
      name: /requirements\.logout/i,
    });
    fireEvent.click(logoutButton);

    const { FirebaseAuthentication } =
      await import("@capacitor-firebase/authentication");
    await waitFor(() => {
      expect(FirebaseAuthentication.signOut).toHaveBeenCalled();
    });
  });

  it("should send verification email when button clicked", async () => {
    const requirements: PendingRequirement[] = [
      {
        type: "email_verified",
        description: "Verify email",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    const sendEmailButton = screen.getByRole("button", {
      name: /requirements\.sendVerificationEmail/i,
    });
    fireEvent.click(sendEmailButton);

    const { FirebaseAuthentication } =
      await import("@capacitor-firebase/authentication");
    await waitFor(() => {
      expect(FirebaseAuthentication.sendEmailVerification).toHaveBeenCalled();
    });
  });

  it("should show check email verified button after sending email", async () => {
    const requirements: PendingRequirement[] = [
      {
        type: "email_verified",
        description: "Verify email",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    // Click send email
    const sendEmailButton = screen.getByRole("button", {
      name: /requirements\.sendVerificationEmail/i,
    });
    fireEvent.click(sendEmailButton);

    // Wait for the UI to update to show the "I've verified" button
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /requirements\.checkEmailVerified/i,
        }),
      ).toBeInTheDocument();
    });
  });

  it("should handle multiple requirement types", () => {
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
      {
        type: "email_verified",
        description: "Verify email",
        endpoint: "/account/requirements",
      },
    ];

    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    render(<RequirementsModal />);

    // All sections should be visible - use getAllBy since multiple may exist
    const tosLabels = screen.getAllByLabelText(/requirements\.tosLabel/);
    expect(tosLabels.length).toBeGreaterThan(0);
    const privacyLabels = screen.getAllByLabelText(
      /requirements\.privacyLabel/,
    );
    expect(privacyLabels.length).toBeGreaterThan(0);
    const ageLabels = screen.getAllByLabelText(/requirements\.ageLabel/);
    expect(ageLabels.length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", {
        name: /requirements\.sendVerificationEmail/i,
      }),
    ).toBeInTheDocument();
  });

  it("should reset checkbox state when modal reopens", async () => {
    const requirements: PendingRequirement[] = [
      {
        type: "terms_acceptance",
        description: "Accept terms",
        endpoint: "/account/requirements",
      },
    ];

    // Open modal and check a box
    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    const { rerender } = render(<RequirementsModal />);

    // Use getByRole to get the checkbox element with role="checkbox"
    const tosCheckbox = screen.getByRole("checkbox", {
      name: /requirements\.tosLabel/,
    });
    fireEvent.click(tosCheckbox);
    expect(tosCheckbox).toBeChecked();

    // Close modal
    useRequirementsStore.setState({
      isOpen: false,
      pendingRequirements: [],
    });

    rerender(<RequirementsModal />);

    // Reopen modal
    useRequirementsStore.setState({
      isOpen: true,
      pendingRequirements: requirements,
    });

    rerender(<RequirementsModal />);

    // Checkbox should be unchecked again - get by role again after rerender
    const reopenedTosCheckbox = screen.getByRole("checkbox", {
      name: /requirements\.tosLabel/,
    });
    expect(reopenedTosCheckbox).not.toBeChecked();
  });

  describe("email verification check flow", () => {
    it("should show check button after sending verification email", async () => {
      const requirements: PendingRequirement[] = [
        {
          type: "email_verified",
          description: "Verify email",
          endpoint: "/account/requirements",
        },
      ];

      useRequirementsStore.setState({
        isOpen: true,
        pendingRequirements: requirements,
      });

      render(<RequirementsModal />);

      // Send email first
      const sendEmailButton = screen.getByRole("button", {
        name: /requirements\.sendVerificationEmail/i,
      });
      fireEvent.click(sendEmailButton);

      // Wait for the "I've verified" button to appear
      await waitFor(() => {
        expect(
          screen.getByRole("button", {
            name: /requirements\.checkEmailVerified/i,
          }),
        ).toBeInTheDocument();
      });
    });

    it("should call Firebase reload when check button is clicked", async () => {
      const requirements: PendingRequirement[] = [
        {
          type: "email_verified",
          description: "Verify email",
          endpoint: "/account/requirements",
        },
      ];

      useRequirementsStore.setState({
        isOpen: true,
        pendingRequirements: requirements,
      });

      const { FirebaseAuthentication } =
        await import("@capacitor-firebase/authentication");

      render(<RequirementsModal />);

      // Send email first
      const sendEmailButton = screen.getByRole("button", {
        name: /requirements\.sendVerificationEmail/i,
      });
      fireEvent.click(sendEmailButton);

      await waitFor(() => {
        expect(
          screen.getByRole("button", {
            name: /requirements\.checkEmailVerified/i,
          }),
        ).toBeInTheDocument();
      });

      // Click check email verified
      const checkButton = screen.getByRole("button", {
        name: /requirements\.checkEmailVerified/i,
      });
      fireEvent.click(checkButton);

      // Wait for Firebase reload to be called
      await waitFor(() => {
        expect(FirebaseAuthentication.reload).toHaveBeenCalled();
      });
    });

    it("should show resend email option after sending", async () => {
      const requirements: PendingRequirement[] = [
        {
          type: "email_verified",
          description: "Verify email",
          endpoint: "/account/requirements",
        },
      ];

      useRequirementsStore.setState({
        isOpen: true,
        pendingRequirements: requirements,
      });

      render(<RequirementsModal />);

      // Send email first
      const sendEmailButton = screen.getByRole("button", {
        name: /requirements\.sendVerificationEmail/i,
      });
      fireEvent.click(sendEmailButton);

      // Should show resend email button
      await waitFor(() => {
        expect(
          screen.getByText("requirements.resendEmail"),
        ).toBeInTheDocument();
      });
    });

    // Regression test: Modal should close when only email verification was pending,
    // even if other requirements (TOS, privacy, age) are false in the API response
    it("should close modal when email is verified and it was the only pending requirement", async () => {
      const user = userEvent.setup();
      const requirements: PendingRequirement[] = [
        {
          type: "email_verified",
          description: "Verify email",
          endpoint: "/account/requirements",
        },
      ];

      useRequirementsStore.setState({
        isOpen: true,
        pendingRequirements: requirements,
      });

      const { FirebaseAuthentication } =
        await import("@capacitor-firebase/authentication");
      const { getRequirements } = await import("@/lib/onlineApi");

      // Mock email as verified
      vi.mocked(FirebaseAuthentication.getCurrentUser).mockResolvedValue({
        user: { emailVerified: true } as never,
      });

      // Mock API response where only email_verified is true,
      // other requirements are false (the bug scenario)
      vi.mocked(getRequirements).mockResolvedValue({
        requirements: {
          email_verified: true,
          tos_accepted: false,
          privacy_accepted: false,
          age_verified: false,
        },
        required_versions: { tos: "1.0", privacy: "1.0" },
        accepted_versions: { tos: null, privacy: null },
      });

      render(<RequirementsModal />);

      // Send email first
      const sendEmailButton = screen.getByRole("button", {
        name: /requirements\.sendVerificationEmail/i,
      });
      await user.click(sendEmailButton);

      // Click check email verified
      const checkButton = await screen.findByRole("button", {
        name: /requirements\.checkEmailVerified/i,
      });
      await user.click(checkButton);

      // Modal should close
      await waitFor(() => {
        expect(useRequirementsStore.getState().isOpen).toBe(false);
      });
    });

    it("should NOT close modal when email is verified but other pending requirements remain", async () => {
      const user = userEvent.setup();
      // This tests the case where both email and TOS are pending
      const requirements: PendingRequirement[] = [
        {
          type: "email_verified",
          description: "Verify email",
          endpoint: "/account/requirements",
        },
        {
          type: "terms_acceptance",
          description: "Accept terms",
          endpoint: "/account/requirements",
        },
      ];

      useRequirementsStore.setState({
        isOpen: true,
        pendingRequirements: requirements,
      });

      const { FirebaseAuthentication } =
        await import("@capacitor-firebase/authentication");
      const { getRequirements } = await import("@/lib/onlineApi");

      // Mock email as verified
      vi.mocked(FirebaseAuthentication.getCurrentUser).mockResolvedValue({
        user: { emailVerified: true } as never,
      });

      // Email is verified but TOS is not accepted
      vi.mocked(getRequirements).mockResolvedValue({
        requirements: {
          email_verified: true,
          tos_accepted: false,
          privacy_accepted: false,
          age_verified: false,
        },
        required_versions: { tos: "1.0", privacy: "1.0" },
        accepted_versions: { tos: null, privacy: null },
      });

      render(<RequirementsModal />);

      // Send email first
      const sendEmailButton = screen.getByRole("button", {
        name: /requirements\.sendVerificationEmail/i,
      });
      await user.click(sendEmailButton);

      // Click check email verified
      const checkButton = await screen.findByRole("button", {
        name: /requirements\.checkEmailVerified/i,
      });
      await user.click(checkButton);

      // Should show email verified message but NOT close modal
      await waitFor(() => {
        expect(
          screen.getByText("requirements.emailVerified"),
        ).toBeInTheDocument();
      });

      // Modal should still be open (other requirements still pending)
      expect(useRequirementsStore.getState().isOpen).toBe(true);
    });
  });
});
