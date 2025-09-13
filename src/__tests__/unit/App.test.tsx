import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("App", () => {
  it("should import and use useDataCache hook", () => {
    // Read App.tsx source code directly to verify useDataCache integration
    const appPath = resolve(__dirname, "../../App.tsx");
    const appSource = readFileSync(appPath, "utf-8");
    
    // Check that useDataCache is imported
    expect(appSource).toMatch(/import.*useDataCache.*from.*hooks\/useDataCache/);
    
    // Check that useDataCache is called in the component
    expect(appSource).toMatch(/useDataCache\(\)/);
  });
});