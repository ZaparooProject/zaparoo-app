import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("App Component - CoreApiWebSocket Key Prop", () => {
  it("should import getDeviceAddress from coreApi", () => {
    // Read App.tsx source code to verify the import
    const appPath = resolve(__dirname, "../../App.tsx");
    const appSource = readFileSync(appPath, "utf-8");

    // Should import getDeviceAddress
    expect(appSource).toMatch(/import.*getDeviceAddress.*from.*lib\/coreApi/);
  });

  it("should use getDeviceAddress as key prop for CoreApiWebSocket", () => {
    // Read App.tsx source code to verify the key prop usage
    const appPath = resolve(__dirname, "../../App.tsx");
    const appSource = readFileSync(appPath, "utf-8");

    // Should use getDeviceAddress() as key prop
    expect(appSource).toMatch(/<CoreApiWebSocket key={getDeviceAddress\(\)}/);
  });

  it("should ensure CoreApiWebSocket will remount when device address changes", () => {
    // This test verifies that the implementation will force remount
    const appPath = resolve(__dirname, "../../App.tsx");
    const appSource = readFileSync(appPath, "utf-8");

    // The key prop should be dynamic based on device address
    // This ensures React will unmount and remount the component when the key changes
    expect(appSource).toMatch(/<CoreApiWebSocket key={getDeviceAddress\(\)} \/>/);
  });

  it("should maintain other App component structure", () => {
    const appPath = resolve(__dirname, "../../App.tsx");
    const appSource = readFileSync(appPath, "utf-8");

    // Should still have the other components
    expect(appSource).toMatch(/<AppUrlListener \/>/);
    expect(appSource).toMatch(/<Toaster/);
    expect(appSource).toMatch(/<RouterProvider/);
  });
});