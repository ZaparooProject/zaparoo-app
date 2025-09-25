import { describe, it, expect } from "vitest";

describe("Create Text Route", () => {
  it("should redirect to /create/custom when beforeLoad is triggered", async () => {
    // Import the route dynamically to test its beforeLoad behavior
    const { Route } = await import("../../../routes/create.text");

    try {
      Route.options.beforeLoad!({} as any);
      // If we get here, the redirect didn't happen
      expect.fail("Expected redirect to be thrown");
    } catch (redirectResult: any) {
      // Verify that redirect was called with the correct parameters
      expect(redirectResult.options).toEqual(
        expect.objectContaining({
          to: "/create/custom"
        })
      );
    }
  });

  it("should be a file route for /create/text", async () => {
    const { Route } = await import("../../../routes/create.text");

    expect(Route).toBeDefined();
    expect(Route.options.beforeLoad).toBeTypeOf("function");
  });
});