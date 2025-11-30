/**
 * Path utilities for extracting filenames from paths.
 * Ported from zaparoo-core/pkg/helpers/uris.go
 */

/**
 * Checks if a file extension contains only valid characters.
 * Valid extensions contain only alphanumeric characters (a-z, A-Z, 0-9).
 *
 * @param ext - The extension string (with or without leading dot)
 * @returns true if the extension is valid, false otherwise
 */
export function isValidExtension(ext: string): boolean {
  if (!ext) return false;

  // Skip the leading dot if present
  const chars = ext.startsWith(".") ? ext.slice(1) : ext;

  // Empty after removing dot means just "." which is invalid
  if (!chars) return false;

  // Check each character is alphanumeric
  for (const ch of chars) {
    const code = ch.charCodeAt(0);
    const isLower = code >= 97 && code <= 122; // a-z
    const isUpper = code >= 65 && code <= 90; // A-Z
    const isDigit = code >= 48 && code <= 57; // 0-9

    if (!isLower && !isUpper && !isDigit) {
      return false;
    }
  }

  return true;
}

/**
 * Extracts the filename from a path, removing the extension if valid.
 * Handles both Unix and Windows paths.
 *
 * @param path - The full file path
 * @returns The filename without extension, or the full basename if extension is invalid
 */
export function filenameFromPath(path: string): string {
  if (!path) return "";

  // Normalize: convert backslashes to forward slashes for consistent cross-platform parsing
  const normalizedPath = path.replace(/\\/g, "/");

  // Get basename (last segment after final slash)
  const lastSlashIndex = normalizedPath.lastIndexOf("/");
  const basename =
    lastSlashIndex >= 0 ? normalizedPath.slice(lastSlashIndex + 1) : normalizedPath;

  if (!basename) return "";

  // Find extension (last dot in basename)
  const lastDotIndex = basename.lastIndexOf(".");

  // No dot found, or dot is at the start (hidden file like .gitignore)
  if (lastDotIndex <= 0) {
    return basename;
  }

  const ext = basename.slice(lastDotIndex);

  // Only strip extension if it's valid
  if (isValidExtension(ext)) {
    return basename.slice(0, lastDotIndex);
  }

  // Invalid extension - return full basename
  return basename;
}
