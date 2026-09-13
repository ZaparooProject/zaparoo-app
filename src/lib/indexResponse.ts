import type { IndexResponse } from "./models";

// Kept free of app imports so the status store can validate index updates
// without depending on CoreAPI.
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOptionalType(
  value: Record<string, unknown>,
  property: string,
  type: "boolean" | "number" | "string",
): boolean {
  return value[property] === undefined || typeof value[property] === type;
}

export function isIndexResponse(value: unknown): value is IndexResponse {
  if (
    !isRecord(value) ||
    typeof value.exists !== "boolean" ||
    typeof value.indexing !== "boolean"
  ) {
    return false;
  }

  return (
    hasOptionalType(value, "optimizing", "boolean") &&
    hasOptionalType(value, "paused", "boolean") &&
    hasOptionalType(value, "throttled", "boolean") &&
    hasOptionalType(value, "totalSteps", "number") &&
    hasOptionalType(value, "currentStep", "number") &&
    hasOptionalType(value, "currentStepDisplay", "string") &&
    hasOptionalType(value, "totalFiles", "number") &&
    hasOptionalType(value, "totalMedia", "number") &&
    hasOptionalType(value, "missingMedia", "number") &&
    hasOptionalType(value, "systemsCompleted", "number") &&
    hasOptionalType(value, "systemsTotal", "number")
  );
}
