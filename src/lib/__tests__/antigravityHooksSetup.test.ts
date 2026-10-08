// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildAntigravityHookFiles } from "../antigravityHooksSetup";
describe("Antigravity hook schema", () => {
  it("preserves user namespaces and installs native lifecycle events", () => {
    const files = buildAntigravityHookFiles("/repo", "task-1", "http://localhost:9736", JSON.stringify({ custom: { enabled: false } }), "remote");
    const config = files.find(file => file.filePath.endsWith(".agents/hooks.json"));
    const parsed = JSON.parse(config!.content);
    expect(parsed.custom).toEqual({ enabled: false });
    expect(parsed.kanvibe.PreInvocation[0]).toMatchObject({ type: "command", timeout: 10 });
    expect(parsed.kanvibe.Stop[0].command).toContain(".agents/hooks/kanvibe-stop-hook.sh");
    expect(parsed.hooks).toBeUndefined();
    expect(files).toHaveLength(3);
  });
  it("rejects invalid user configuration instead of overwriting it", () => {
    expect(() => buildAntigravityHookFiles("/repo", "id", "http://localhost:9736", "broken", "remote")).toThrow();
  });
});
