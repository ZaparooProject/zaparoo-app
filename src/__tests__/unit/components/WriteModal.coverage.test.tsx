import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// Mock dependencies
vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: vi.fn(() => "web"),
  },
}));

describe("WriteModal Coverage", () => {
  it("should import WriteModal without errors", async () => {
    // This test just ensures the component can be imported
    const { WriteModal } = await import("../../../components/WriteModal");
    expect(WriteModal).toBeDefined();
  });

  it("should render basic WriteModal structure", async () => {
    const { WriteModal } = await import("../../../components/WriteModal");

    // Mock the store hook
    vi.doMock("../../../lib/store", () => ({
      useStore: vi.fn(() => ({
        connected: false,
        currentWriteMethod: null,
        setCurrentWriteMethod: vi.fn(),
      }))
    }));

    // Basic render test
    const { container } = render(<WriteModal isOpen={false} close={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});