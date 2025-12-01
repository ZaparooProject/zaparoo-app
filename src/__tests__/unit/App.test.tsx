import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("App", () => {
  it("should import and use useDataCache hook", () => {
    // Read App.tsx source code directly to verify useDataCache integration
    const appPath = resolve(__dirname, "../../App.tsx");
    const appSource = readFileSync(appPath, "utf-8");

    // Check that useDataCache is imported
    expect(appSource).toMatch(
      /import.*useDataCache.*from.*hooks\/useDataCache/,
    );

    // Check that useDataCache is called in the component
    expect(appSource).toMatch(/useDataCache\(\)/);
  });

  it("should only show completion toast for media indexing", () => {
    // Read App.tsx source code to verify toast behavior changes
    const appPath = resolve(__dirname, "../../App.tsx");
    const appSource = readFileSync(appPath, "utf-8");

    // Check that MediaIndexingToast is no longer imported
    expect(appSource).not.toMatch(/import.*MediaIndexingToast/);

    // Check that MediaFinishedToast is still imported and used
    expect(appSource).toMatch(
      /import.*MediaFinishedToast.*from.*components\/MediaFinishedToast/,
    );
    expect(appSource).toMatch(/MediaFinishedToast/);

    // Check that only completion toast logic exists (shows toast when indexing completes)
    expect(appSource).toMatch(
      /Only show completion toast when indexing finishes with results/,
    );

    // Verify indexing toast logic is removed
    expect(appSource).not.toMatch(
      /if \(gamesIndex\.indexing && !hideGamesIndex\)/,
    );
    expect(appSource).not.toMatch(/toast\.loading/);
  });

  it("should not use hideGamesIndex state anymore", () => {
    // Read App.tsx source code to verify hideGamesIndex removal
    const appPath = resolve(__dirname, "../../App.tsx");
    const appSource = readFileSync(appPath, "utf-8");

    // Check that hideGamesIndex state is no longer used
    expect(appSource).not.toMatch(/hideGamesIndex/);
    expect(appSource).not.toMatch(/setHideGamesIndex/);
    expect(appSource).not.toMatch(/useState.*false/);
  });

  it("should have proper useEffect dependencies after changes", () => {
    // Read App.tsx source code to verify useEffect dependencies
    const appPath = resolve(__dirname, "../../App.tsx");
    const appSource = readFileSync(appPath, "utf-8");

    // Check that useEffect for media indexing has correct dependencies (including announce for a11y)
    expect(appSource).toMatch(/}, \[gamesIndex, prevGamesIndex, t, announce\]/);

    // Should not include hideGamesIndex in dependencies anymore
    expect(appSource).not.toMatch(/hideGamesIndex.*\]/);
  });
});
