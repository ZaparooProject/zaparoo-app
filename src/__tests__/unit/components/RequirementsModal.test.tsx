import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RequirementsModal } from "@/components/RequirementsModal";
import { useRequirementsStore } from "@/hooks/useRequirementsModal";
import type { PendingRequirement } from "@/lib/models";

// Mock modules
vi.mock("@capacitor-firebase/authentication", () => ({
  FirebaseAuthentication: {
    signOut: vi.fn().mockResolvedValue(undefined),
    sendEmailVerification: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
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

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
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

// Mock UI components with simpler implementations
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: any) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: any) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: any) => (
    <h2 data-testid="dialog-title">{children}</h2>
  ),
  DialogDescription: ({ children }: any) => (
    <p data-testid="dialog-description">{children}</p>
  ),
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ id, checked, onCheckedChange }: any) => (
    <input
      type="checkbox"
      id={id}
      data-testid={`checkbox-${id}`}
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
    />
  ),
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, htmlFor }: any) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

vi.mock("@/components/wui/Button", () => ({
  Button: ({ label, onClick, disabled }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={`button-${label}`}
    >
      {label}
    </button>
  ),
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
    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
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

    expect(screen.getByTestId("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("dialog-title")).toHaveTextContent(
      "requirements.title",
    );
    expect(screen.getByTestId("checkbox-tos")).toBeInTheDocument();
    expect(screen.getByTestId("checkbox-privacy")).toBeInTheDocument();
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

    expect(screen.getByTestId("checkbox-age")).toBeInTheDocument();
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
      screen.getByTestId("button-requirements.sendVerificationEmail"),
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

    const saveButton = screen.getByTestId("button-requirements.save");
    expect(saveButton).toBeDisabled();

    // Check TOS
    fireEvent.click(screen.getByTestId("checkbox-tos"));
    // Check Privacy
    fireEvent.click(screen.getByTestId("checkbox-privacy"));

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

    const saveButton = screen.getByTestId("button-requirements.save");
    expect(saveButton).toBeDisabled();

    // Check age
    fireEvent.click(screen.getByTestId("checkbox-age"));

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

    // Check required checkboxes
    fireEvent.click(screen.getByTestId("checkbox-tos"));
    fireEvent.click(screen.getByTestId("checkbox-privacy"));

    // Click save
    const saveButton = screen.getByTestId("button-requirements.save");
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

    const logoutButton = screen.getByTestId("button-requirements.logout");
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

    const sendEmailButton = screen.getByTestId(
      "button-requirements.sendVerificationEmail",
    );
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
    const sendEmailButton = screen.getByTestId(
      "button-requirements.sendVerificationEmail",
    );
    fireEvent.click(sendEmailButton);

    // Wait for the UI to update to show the "I've verified" button
    await waitFor(() => {
      expect(
        screen.getByTestId("button-requirements.checkEmailVerified"),
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

    // All sections should be visible
    expect(screen.getByTestId("checkbox-tos")).toBeInTheDocument();
    expect(screen.getByTestId("checkbox-privacy")).toBeInTheDocument();
    expect(screen.getByTestId("checkbox-age")).toBeInTheDocument();
    expect(
      screen.getByTestId("button-requirements.sendVerificationEmail"),
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

    fireEvent.click(screen.getByTestId("checkbox-tos"));
    expect(screen.getByTestId("checkbox-tos")).toBeChecked();

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

    // Checkbox should be unchecked again
    expect(screen.getByTestId("checkbox-tos")).not.toBeChecked();
  });
});
