import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { WHATS_NEW_ANNOUNCEMENTS } from "@/lib/whatsNew";

type PackageJson = {
  version: string;
  scripts: Record<string, string>;
};

const root = resolve(__dirname, "../../..");

function readProjectFile(path: string): string {
  return readFileSync(resolve(root, path), "utf-8");
}

function readPackageJson(): PackageJson {
  return JSON.parse(readProjectFile("package.json")) as PackageJson;
}

function requireMatch(source: string, pattern: RegExp, label: string): string {
  const match = source.match(pattern);
  if (!match?.[1]) {
    throw new Error(`Missing ${label}`);
  }
  return match[1];
}

describe("release configuration", () => {
  it("should keep app version surfaces aligned", () => {
    const packageJson = readPackageJson();
    const androidGradle = readProjectFile("android/app/build.gradle");
    const xcodeProject = readProjectFile(
      "ios/App/App.xcodeproj/project.pbxproj",
    );

    const androidVersionName = requireMatch(
      androidGradle,
      /versionName\s+"([^"]+)"/,
      "Android versionName",
    );
    const androidVersionCode = Number(
      requireMatch(androidGradle, /versionCode\s+(\d+)/, "Android versionCode"),
    );
    const iosMarketingVersions = [
      ...xcodeProject.matchAll(/MARKETING_VERSION = ([^;]+);/g),
    ].map((match) => match[1]);
    const iosBuildNumbers = [
      ...xcodeProject.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g),
    ].map((match) => Number(match[1]));

    expect(androidVersionName).toBe(packageJson.version);
    expect(new Set(iosMarketingVersions)).toEqual(
      new Set([packageJson.version]),
    );
    expect(new Set(iosBuildNumbers)).toEqual(new Set([androidVersionCode]));
    expect(androidVersionCode).toBeGreaterThan(26);
  });

  it("should use versioned Capawesome live update channels", () => {
    const androidGradle = readProjectFile("android/app/build.gradle");
    const iosInfoPlist = readProjectFile("ios/App/App/Info.plist");
    const capacitorConfig = readProjectFile("capacitor.config.ts");
    const packageJson = readPackageJson();
    const liveUpdateScript = packageJson.scripts["live-update"];

    expect(androidGradle).toContain(
      'resValue "string", "capawesome_live_update_default_channel", "production-" + defaultConfig.versionCode',
    );
    expect(iosInfoPlist).toContain("CapawesomeLiveUpdateDefaultChannel");
    expect(iosInfoPlist).toContain("production-$(CURRENT_PROJECT_VERSION)");
    expect(capacitorConfig).not.toContain('defaultChannel: "production"');
    expect(liveUpdateScript).toContain("LIVE_UPDATE_CHANNEL");
    expect(liveUpdateScript).not.toContain("--channel production");
  });

  it("should have a What's New release key for the native build", () => {
    const packageJson = readPackageJson();
    const androidGradle = readProjectFile("android/app/build.gradle");
    const androidVersionCode = requireMatch(
      androidGradle,
      /versionCode\s+(\d+)/,
      "Android versionCode",
    );

    expect(
      WHATS_NEW_ANNOUNCEMENTS.some((announcement) =>
        announcement.releaseKeys.includes(
          `native:${packageJson.version}+${androidVersionCode}`,
        ),
      ),
    ).toBe(true);
  });
});
