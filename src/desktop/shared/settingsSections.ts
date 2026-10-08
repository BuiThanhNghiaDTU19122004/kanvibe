export const SETTINGS_SECTIONS = ["appearance", "detail", "creation", "notifications", "background-sync", "keyboard"] as const;
export type SettingsSection = typeof SETTINGS_SECTIONS[number];

export const SETTINGS_SECTION_LABELS: Record<SettingsSection, string> = {
  appearance: "appearanceSection",
  detail: "detailPageSection",
  creation: "taskCreationSection",
  notifications: "notificationSection",
  "background-sync": "backgroundSyncSection",
  keyboard: "keyboardSection",
};
