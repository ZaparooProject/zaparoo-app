import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("App Component - ConnectionProvider Structure", () => {
  it("should import ConnectionProvider from components", () => {
    // Read App.tsx source code to verify the import
    const appPath = resolve(__dirname, "../../App.tsx");
    const appSource = readFileSync(appPath, "utf-8");

    // Should import ConnectionProvider
    expect(appSource).toMatch(
      /import.*ConnectionProvider.*from.*\.\/components\/ConnectionProvider/,
    );
  });

  it("should import ReconnectingIndicator from components", () => {
    // Read App.tsx source code to verify the import
    const appPath = resolve(__dirname, "../../App.tsx");
    const appSource = readFileSync(appPath, "utf-8");

    // Should import ReconnectingIndicator
    expect(appSource).toMatch(
      /import.*ReconnectingIndicator.*from.*\.\/components\/ReconnectingIndicator/,
    );
  });

  it("should use ConnectionProvider to wrap app content", () => {
    // Read App.tsx source code to verify ConnectionProvider is used
    const appPath = resolve(__dirname, "../../App.tsx");
    const appSource = readFileSync(appPath, "utf-8");

    // Should use ConnectionProvider wrapper
    expect(appSource).toMatch(/<ConnectionProvider>/);
    expect(appSource).toMatch(/<\/ConnectionProvider>/);
  });

  it("should include ReconnectingIndicator component", () => {
    // Read App.tsx source code to verify ReconnectingIndicator is rendered
    const appPath = resolve(__dirname, "../../App.tsx");
    const appSource = readFileSync(appPath, "utf-8");

    // Should render ReconnectingIndicator
    expect(appSource).toMatch(/<ReconnectingIndicator \/>/);
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
