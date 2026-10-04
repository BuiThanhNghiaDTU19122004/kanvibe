import { invokeDesktop } from "@/desktop/renderer/ipc";
import type { CliToolCheckResult } from "@/desktop/main/services/environmentCheckService";

export type { CliToolCheckResult };

export function checkEnvironmentAction(): Promise<CliToolCheckResult[]> {
  return invokeDesktop<CliToolCheckResult[]>("environmentCheck", "checkEnvironment");
}
