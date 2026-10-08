// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ exec: vi.fn(), terminals: vi.fn(), write: vi.fn() }));
vi.mock("node:util", () => ({ promisify: () => mocks.exec }));
vi.mock("@/lib/terminal", () => ({ getNativeTerminalSnapshots: mocks.terminals, writeNativeTerminal: mocks.write }));
vi.mock("@/lib/shellEnvironment", () => ({ createLocalShellEnvironment: () => ({}) }));
async function runtime() { return import("../nativeAgentRuntime"); }
describe("Windows native agent launch", () => {
  it("falls back to Toolhelp when WMI is denied", async () => {
    mocks.exec.mockRejectedValueOnce(new Error("WMI access denied")).mockResolvedValue({stdout:"[]"});
    const api=await runtime(); await expect(api.readNativeAgentMonitor()).resolves.toMatchObject({panes:[]});
    expect(mocks.exec.mock.calls[1][1][3]).toContain("CreateToolhelp32Snapshot");
  });
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.useRealTimers(); mocks.terminals.mockReturnValue([{ taskId:"t1",tabId:"tab",pid:100,worktreePath:"D:/project",sessionName:"s",windowName:"tab" }]); mocks.write.mockReturnValue(true); });
  it("detects descendants without confusing words in arbitrary command arguments with agents", async () => {
    const { findDescendantProcesses, identifyAgentProcess } = await runtime();
    const processes=[{ProcessId:101,ParentProcessId:100,Name:"cmd.exe"},{ProcessId:102,ParentProcessId:101,Name:"node.exe",CommandLine:'node "D:/node_modules/@anthropic-ai/claude-code/cli.js"'},{ProcessId:103,ParentProcessId:0,Name:"claude.exe"}];
    expect(findDescendantProcesses(processes,100).map(p=>p.ProcessId)).toEqual([101,102]); expect(identifyAgentProcess(processes[1])).toBe("claude");
    expect(identifyAgentProcess({ProcessId:1,ParentProcessId:0,Name:"node.exe",CommandLine:'node app.js --prompt "claude codex"'})).toBeNull();
  });
  it("transports Unicode, quotes, shell metacharacters and multiline requests as literal data", async () => {
    const { buildWindowsAgentCommand } = await runtime(); const prompt="Sửa lỗi \"quote\" 'literal' $(Write-Output BAD) `tick` & | %\nLine 2";
    const command=buildWindowsAgentCommand("claude",prompt); const encoded=command.match(/'claude' '([^']+)'/)![1]; expect(Buffer.from(encoded,"base64").toString("utf8")).toBe(prompt); expect(command).not.toContain("Write-Output");
  });
  it("acknowledges launch only as starting, then confirms an observed process and preserves that observation after exit", async () => {
    const api=await runtime(); mocks.exec.mockResolvedValueOnce({stdout:"[]"}).mockResolvedValueOnce({stdout:"ready"});
    expect(await api.launchNativeAgent("t1","tab","claude","request")).toEqual({ok:true});
    mocks.exec.mockResolvedValue({stdout:"[]"}); expect((await api.readNativeAgentMonitor()).runtimes[0].state).toBe("starting");
    mocks.exec.mockResolvedValue({stdout:JSON.stringify([{ProcessId:101,ParentProcessId:100,Name:"claude.exe"}])}); const monitor=await api.readNativeAgentMonitor(); expect(monitor.panes).toHaveLength(1); expect(monitor.runtimes[0].observedAt).toBeTruthy();
    mocks.exec.mockResolvedValue({stdout:"[]"}); const idle=await api.readNativeAgentMonitor(); expect(idle.runtimes[0].state).toBe("idle"); expect(idle.runtimes[0].observedAt).toBe(monitor.runtimes[0].observedAt);
  });
  it("blocks duplicate clicks while the first launch is checking processes", async () => {
    let resolve!: (value: {stdout:string})=>void; mocks.exec.mockReturnValueOnce(new Promise(r=>{resolve=r})).mockResolvedValue({stdout:"ready"}); const api=await runtime(); const first=api.launchNativeAgent("t1","tab","claude","request");
    expect(await api.launchNativeAgent("t1","tab","claude","request")).toEqual({ok:false,code:"already-running"}); resolve({stdout:"[]"}); await first; expect(mocks.write).toHaveBeenCalledTimes(1);
  });
  it("retains an explicit missing CLI error without writing commands", async () => {
    mocks.exec.mockResolvedValue({stdout:"[]"}); const api=await runtime(); expect(await api.launchNativeAgent("t1","tab","claude","request")).toEqual({ok:false,code:"missing-cli"}); expect(mocks.write).not.toHaveBeenCalled(); expect((await api.readNativeAgentMonitor()).runtimes[0].errorCode).toBe("missing-cli");
  });
  it("never sends a command into a terminal hosting another process", async () => {
    mocks.exec.mockResolvedValue({stdout:JSON.stringify([{ProcessId:101,ParentProcessId:100,Name:"python.exe"}])}); const api=await runtime(); expect(await api.launchNativeAgent("t1","tab","claude","request")).toEqual({ok:false,code:"terminal-busy"}); expect(mocks.write).not.toHaveBeenCalled();
  });
  it("reports unknown after the start deadline instead of claiming success or retrying execution", async () => {
    vi.useFakeTimers(); mocks.exec.mockResolvedValueOnce({stdout:"[]"}).mockResolvedValueOnce({stdout:"ready"}).mockResolvedValue({stdout:"[]"}); const api=await runtime(); await api.launchNativeAgent("t1","tab","claude","request"); vi.advanceTimersByTime(21000); const monitor=await api.readNativeAgentMonitor(); expect(monitor.runtimes[0].state).toBe("unknown"); expect(monitor.runtimes[0].errorCode).toBe("launch-unconfirmed"); expect(mocks.write).toHaveBeenCalledTimes(1);
  });
});
