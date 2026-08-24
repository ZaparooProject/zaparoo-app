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
    expect(androidVersionCode).toBe(29);
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

  it("should use RevenueCat-compatible Android activity launch mode", () => {
    const androidManifest = readProjectFile(
      "android/app/src/main/AndroidManifest.xml",
    );

    const mainActivity = requireMatch(
      androidManifest,
      /(<activity\b(?=[^>]*android:name="\.MainActivity")[^>]*>)/,
      "MainActivity manifest element",
    );

    expect(mainActivity).toContain('android:launchMode="singleTop"');
    expect(mainActivity).not.toContain('android:launchMode="singleTask"');
  });

  it("should enable the iOS In-App Purchase capability", () => {
    const xcodeProject = readProjectFile(
      "ios/App/App.xcodeproj/project.pbxproj",
    );

    expect(xcodeProject).toMatch(
      /com\.apple\.InAppPurchase = \{\s+enabled = 1;/,
    );
  });

  it("should keep purchase previews out of release workflow builds", () => {
    const releaseWorkflow = readProjectFile(".github/workflows/build.yaml");

    expect(releaseWorkflow).toMatch(/^\s*run:\s*npm run build\s*$/m);
    expect(releaseWorkflow).toMatch(/^\s*run:\s*npm run build:core\s*$/m);
    expect(releaseWorkflow).not.toContain("VITE_PURCHASE_PREVIEW");
  });

  it("should have What's New release keys for native and live-update builds", () => {
    const packageJson = readPackageJson();
    const androidGradle = readProjectFile("android/app/build.gradle");
    const androidVersionCode = requireMatch(
      androidGradle,
      /versionCode\s+(\d+)/,
      "Android versionCode",
    );
    const nativeReleaseKey = `native:${packageJson.version}+${androidVersionCode}`;
    const liveReleaseKey = `live:${packageJson.version}-ota.1`;

    expect(
      WHATS_NEW_ANNOUNCEMENTS.some((announcement) =>
        announcement.releaseKeys.includes(nativeReleaseKey),
      ),
    ).toBe(true);
    expect(
      WHATS_NEW_ANNOUNCEMENTS.some((announcement) =>
        announcement.releaseKeys.includes(liveReleaseKey),
      ),
    ).toBe(true);
  });
});
