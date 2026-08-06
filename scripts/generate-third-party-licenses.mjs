/* global console, process */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const indexOutputPath = path.join(
  projectRoot,
  "src/generated/thirdPartyLicenses.json",
);
const noticesOutputPath = path.join(
  projectRoot,
  "public/thirdPartyLicenseNotices.json",
);
const checkOnly = process.argv.includes("--check");
const lockfile = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "package-lock.json"), "utf8"),
);

const licenseFilePattern = /^(licen[cs]e|copying|notice)(\..*)?$/i;
const rootLicense = fs.readFileSync(path.join(projectRoot, "LICENSE"), "utf8");
const apacheEnd = "   END OF TERMS AND CONDITIONS";
const apacheLicense = rootLicense.slice(
  0,
  rootLicense.indexOf(apacheEnd) + apacheEnd.length,
);
const mitLicense = `MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

function normalizeLicense(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeLicense).join(" OR ");
  }
  if (value && typeof value === "object") {
    return value.type ?? value.name ?? "Unknown";
  }
  return value || "Unknown";
}

function formatAuthor(value) {
  if (Array.isArray(value)) {
    return value.map(formatAuthor).filter(Boolean).join(", ");
  }
  if (value && typeof value === "object") {
    const name = value.name ?? "";
    const email = value.email ? ` <${value.email}>` : "";
    return `${name}${email}`.trim();
  }
  return value ?? "";
}

function normalizeRepository(packageJson) {
  const repository =
    typeof packageJson.repository === "string"
      ? packageJson.repository
      : packageJson.repository?.url;
  let url = repository ?? packageJson.homepage ?? "";

  if (/^[\w.-]+\/[\w.-]+$/.test(url)) {
    url = `https://github.com/${url}`;
  }

  return url
    .replace(/^git\+ssh:\/\/git@github\.com\//, "https://github.com/")
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^ssh:\/\/git@github\.com\//, "https://github.com/")
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "");
}

function fallbackLicenseText(packageJson, license) {
  const author = formatAuthor(packageJson.author ?? packageJson.authors);
  const metadata = [
    `Package: ${packageJson.name}`,
    author ? `Author: ${author}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  if (license === "Apache-2.0") {
    return `${metadata}\n\n${apacheLicense}`;
  }
  if (license === "MIT") {
    return `${metadata}\n\n${mitLicense}`;
  }

  throw new Error(
    `${packageJson.name}@${packageJson.version} has no bundled license file and no fallback for ${license}`,
  );
}

const packagesByKey = new Map();
const notices = {};

for (const [packagePath, lockPackage] of Object.entries(lockfile.packages)) {
  if (
    !packagePath ||
    lockPackage.dev === true ||
    lockPackage.optional === true
  ) {
    continue;
  }

  const packageDirectory = path.join(projectRoot, packagePath);
  const packageJsonPath = path.join(packageDirectory, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Production package is not installed: ${packagePath}`);
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const packageKey = `${packageJson.name}@${packageJson.version}`;
  if (packagesByKey.has(packageKey)) {
    continue;
  }

  const license = normalizeLicense(packageJson.license ?? lockPackage.license);
  const licenseFiles = fs
    .readdirSync(packageDirectory)
    .filter((name) => {
      const filePath = path.join(packageDirectory, name);
      return licenseFilePattern.test(name) && fs.statSync(filePath).isFile();
    })
    .sort((left, right) => left.localeCompare(right, "en"));

  let noticeText;
  if (licenseFiles.length === 0) {
    noticeText = fallbackLicenseText(packageJson, license);
  } else {
    noticeText = licenseFiles
      .map((name) => {
        const text = fs
          .readFileSync(path.join(packageDirectory, name), "utf8")
          .trim();
        return licenseFiles.length === 1 ? text : `${name}\n\n${text}`;
      })
      .join("\n\n---\n\n");
  }

  const noticeId = createHash("sha256")
    .update(noticeText)
    .digest("hex")
    .slice(0, 16);
  notices[noticeId] = noticeText;

  packagesByKey.set(packageKey, {
    name: packageJson.name,
    version: packageJson.version,
    license:
      license === "Unknown" && licenseFiles.length > 0
        ? noticeText.split("\n", 1)[0]
        : license,
    repository: normalizeRepository(packageJson),
    noticeId,
  });
}

const packages = [...packagesByKey.values()].sort((left, right) =>
  left.name.localeCompare(right.name, "en"),
);
const sortedNotices = Object.fromEntries(
  Object.entries(notices).sort(([left], [right]) => left.localeCompare(right)),
);
const generatedIndex = `${JSON.stringify({ packages }, null, 2)}\n`;
const generatedNotices = `${JSON.stringify({ notices: sortedNotices }, null, 2)}\n`;

if (checkOnly) {
  const currentIndex = fs.existsSync(indexOutputPath)
    ? fs.readFileSync(indexOutputPath, "utf8")
    : "";
  const currentNotices = fs.existsSync(noticesOutputPath)
    ? fs.readFileSync(noticesOutputPath, "utf8")
    : "";
  if (currentIndex !== generatedIndex || currentNotices !== generatedNotices) {
    console.error(
      "Third-party license data is stale. Run npm run licenses:generate.",
    );
    process.exitCode = 1;
  }
} else {
  fs.mkdirSync(path.dirname(indexOutputPath), { recursive: true });
  fs.mkdirSync(path.dirname(noticesOutputPath), { recursive: true });
  fs.writeFileSync(indexOutputPath, generatedIndex);
  fs.writeFileSync(noticesOutputPath, generatedNotices);
  console.log(
    `Generated ${packages.length} package notices at ${indexOutputPath} and ${noticesOutputPath}`,
  );
}
