import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createLocalShellEnvironment } from "@/lib/shellEnvironment";
import { resolveGitBash } from "@/lib/windowsRuntime";

const execFileAsync = promisify(execFile);

export interface CliToolCheckResult {
  tool: string;
  name: string;
  isInstalled: boolean;
  version: string | null;
  description: string;
  category: "vcs" | "agent" | "multiplexer";
  installCommand?: string;
}

const TOOLS_TO_CHECK: Array<{
  tool: string;
  name: string;
  command: string;
  args: string[];
  description: string;
  category: "vcs" | "agent" | "multiplexer";
  installCommand?: string;
  parseVersion: (stdout: string) => string | null;
}> = [
  {
    tool: "git",
    name: "Git",
    command: "git",
    args: ["--version"],
    description: "Version control for project branches and worktrees",
    category: "vcs",
    installCommand: "winget install Git.Git / brew install git",
    parseVersion: (out) => out.trim().split("\n")[0] || null,
  },
  {
    tool: "claude",
    name: "Claude Code",
    command: "claude",
    args: ["--version"],
    description: "Anthropic Claude coding agent CLI",
    category: "agent",
    installCommand: "npm install -g @anthropic-ai/claude-code",
    parseVersion: (out) => out.trim().split("\n")[0] || null,
  },
  {
    tool: "codex",
    name: "OpenAI Codex",
    command: "codex",
    args: ["--version"],
    description: "OpenAI Codex CLI coding assistant",
    category: "agent",
    installCommand: "npm install -g @openai/codex",
    parseVersion: (out) => out.trim().split("\n")[0] || null,
  },
  {
    tool: "antigravity",
    name: "Antigravity (agy)",
    command: "agy",
    args: ["--version"],
    description: "Google DeepMind Antigravity CLI",
    category: "agent",
    installCommand: "npm install -g @google/antigravity",
    parseVersion: (out) => out.trim().split("\n")[0] || null,
  },
  {
    tool: "tmux",
    name: "tmux",
    command: "tmux",
    args: ["-V"],
    description: "Terminal multiplexer for background agent sessions",
    category: "multiplexer",
    installCommand: "brew install tmux / apt install tmux",
    parseVersion: (out) => out.trim().split("\n")[0] || null,
  },
  {
    tool: "gh",
    name: "GitHub CLI",
    command: "gh",
    args: ["--version"],
    description: "GitHub CLI for pull request sync and review",
    category: "vcs",
    installCommand: "winget install GitHub.cli / brew install gh",
    parseVersion: (out) => out.trim().split("\n")[0] || null,
  },
];

export async function checkEnvironment(): Promise<CliToolCheckResult[]> {
  const env = createLocalShellEnvironment();

  const results = await Promise.all(
    TOOLS_TO_CHECK.map(async (item) => {
      try {
        const { stdout } = await execFileAsync(item.command, item.args, {
          timeout: 4_000,
          shell: true,
          env,
        });
        const version = item.parseVersion(stdout);
        return {
          tool: item.tool,
          name: item.name,
          isInstalled: Boolean(version),
          version,
          description: item.description,
          category: item.category,
          installCommand: item.installCommand,
        };
      } catch {
        return {
          tool: item.tool,
          name: item.name,
          isInstalled: false,
          version: null,
          description: item.description,
          category: item.category,
          installCommand: item.installCommand,
        };
      }
    }),
  );

  if (process.platform === "win32") {
    let version: string | null = null;
    try {
      const { stdout } = await execFileAsync(resolveGitBash(), ["--version"], { timeout: 4_000, windowsHide: true, env });
      version = stdout.trim().split("\n")[0] || null;
    } catch { /* Required for the existing local Git operations. */ }
    results.push({ tool: "git-bash", name: "Git Bash", isInstalled: !!version, version,
      description: "Git for Windows shell", category: "vcs", installCommand: "winget install Git.Git" });
  }
  return results;
}
