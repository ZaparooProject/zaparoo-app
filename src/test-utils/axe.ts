import axe, { type RunOptions, type Result } from "axe-core";

export async function findA11yViolations(
  container: Element,
  options?: RunOptions,
): Promise<Result[]> {
  const runOptions: RunOptions = {
    ...options,
    rules: {
      // jsdom cannot calculate rendered contrast, and isolated component tests
      // intentionally omit app-level landmarks.
      "color-contrast": { enabled: false },
      region: { enabled: false },
      ...options?.rules,
    },
  };
  const results = await axe.run(container, runOptions);
  return results.violations;
}
