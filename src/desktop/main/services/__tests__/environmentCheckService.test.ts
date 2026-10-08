import { describe, expect, it, vi } from "vitest";
import { checkEnvironment } from "../environmentCheckService";

describe("environmentCheckService", () => {
  it("runs checks on CLI tools and returns structured results", async () => {
    const results = await checkEnvironment();

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(5);

    const gitResult = results.find((r) => r.tool === "git");
    expect(gitResult).toBeDefined();
    expect(gitResult?.name).toBe("Git");
    expect(gitResult?.category).toBe("vcs");

    const claudeResult = results.find((r) => r.tool === "claude");
    expect(claudeResult).toBeDefined();
    expect(claudeResult?.category).toBe("agent");

    for (const r of results) {
      expect(typeof r.isInstalled).toBe("boolean");
      expect(r.description).toBeDefined();
      if (r.isInstalled) {
        expect(typeof r.version).toBe("string");
      } else {
        expect(r.version).toBeNull();
      }
    }
  });
});
