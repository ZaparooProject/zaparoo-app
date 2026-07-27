export function getTabBarTabId(value: string, prefix = "tab"): string {
  const safeValue = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  return `${prefix}-${safeValue}`;
}

export function getTabBarPanelId(tabId: string): string {
  return `tabpanel-${tabId}`;
}
