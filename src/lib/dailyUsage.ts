import { Preferences } from "@capacitor/preferences";

const DAILY_LIMIT = 3;
const USAGE_KEY = "dailyRunTokenUsage";

interface DailyUsage {
  date: string;
  count: number;
}

function getCurrentDate(): string {
  return new Date().toISOString().split("T")[0];
}

async function getTodaysUsage(): Promise<DailyUsage> {
  const today = getCurrentDate();

  try {
    const result = await Preferences.get({ key: USAGE_KEY });
    if (result.value) {
      const usage: DailyUsage = JSON.parse(result.value);

      if (usage.date === today) {
        return usage;
      }
    }
  } catch (error) {
    console.error("Error reading daily usage:", error);
  }

  return { date: today, count: 0 };
}

async function saveTodaysUsage(usage: DailyUsage): Promise<void> {
  try {
    await Preferences.set({
      key: USAGE_KEY,
      value: JSON.stringify(usage)
    });
  } catch (error) {
    console.error("Error saving daily usage:", error);
  }
}

export async function canUseRunToken(launcherAccess: boolean): Promise<{
  canUse: boolean;
  remaining: number;
  used: number;
  limit: number;
}> {
  // Pro users can always use it
  if (launcherAccess) {
    return {
      canUse: true,
      remaining: Infinity,
      used: 0,
      limit: Infinity
    };
  }

  const usage = await getTodaysUsage();
  const remaining = Math.max(0, DAILY_LIMIT - usage.count);

  return {
    canUse: usage.count < DAILY_LIMIT,
    remaining,
    used: usage.count,
    limit: DAILY_LIMIT
  };
}

export async function incrementRunTokenUsage(
  launcherAccess: boolean
): Promise<void> {
  if (launcherAccess) {
    return;
  }

  const usage = await getTodaysUsage();
  usage.count += 1;

  await saveTodaysUsage(usage);
}

export async function getUsageStats(launcherAccess: boolean): Promise<{
  used: number;
  remaining: number;
  limit: number;
}> {
  if (launcherAccess) {
    return {
      used: 0,
      remaining: Infinity,
      limit: Infinity
    };
  }

  const usage = await getTodaysUsage();
  const remaining = Math.max(0, DAILY_LIMIT - usage.count);

  return {
    used: usage.count,
    remaining,
    limit: DAILY_LIMIT
  };
}

export async function resetDailyUsage(): Promise<void> {
  try {
    await Preferences.remove({ key: USAGE_KEY });
  } catch (error) {
    console.error("Error resetting daily usage:", error);
  }
}
