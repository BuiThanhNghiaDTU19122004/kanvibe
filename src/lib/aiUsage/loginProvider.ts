import type { AiUsageProvider } from "./types";

// Antigravity owns its keyring session; it does not share Gemini CLI account files.
export type AiLoginProvider = AiUsageProvider | "antigravity";
