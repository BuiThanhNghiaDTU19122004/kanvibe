import type { AiSessionProvider } from "@/lib/aiSessions/types";

// Defined when the embedded shell opens, so launcher internals are not printed
// into the user's interactive terminal on each Start action.
export const WINDOWS_AGENT_BOOTSTRAP = String.raw`function Start-KanVibeAgent {
  param([ValidateSet('claude','codex','opencode','antigravity')][string]$Provider, [string]$EncodedPrompt)
  $kvNames=@{claude='claude';codex='codex';opencode='opencode';antigravity='agy'};
  $kvScripts=@{claude='@anthropic-ai/claude-code/cli.js';codex='@openai/codex/bin/codex.js';opencode='opencode-ai/bin/opencode';antigravity='@google/antigravity/bin/agy.js'};

    $kvExe=(Get-Command $kvNames[$Provider] -CommandType Application,ExternalScript -ErrorAction Stop | Select-Object -First 1).Source;
    $kvArgs=@(); if ($EncodedPrompt) { $kvArgs=@('--', [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($EncodedPrompt))) };
    if ([IO.Path]::GetExtension($kvExe) -in @('.cmd','.bat','.ps1')) {
      $kvBase=Split-Path -Parent $kvExe;
      $kvScript=@((Join-Path $kvBase "node_modules/$($kvScripts[$Provider])"),(Join-Path (Split-Path -Parent $kvBase) "node_modules/$($kvScripts[$Provider])")) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1;
      if (!$kvScript) { throw 'Cannot safely launch this CLI shim. Install the native CLI or use the terminal.' };
      $kvExe=(Get-Command 'node' -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source;
      $kvArgs=@($kvScript)+$kvArgs
    };
    $kvInfo=New-Object System.Diagnostics.ProcessStartInfo;
    $kvInfo.FileName=$kvExe; $kvInfo.UseShellExecute=$false;
    $kvInfo.Arguments=($kvArgs | ForEach-Object { '"'+[regex]::Replace([regex]::Replace($_,'(\\*)"','$1$1\"'),'(\\+)$','$1$1')+'"' }) -join ' ';
    $kvProcess=[Diagnostics.Process]::Start($kvInfo);
    try { $kvProcess.WaitForExit() } finally { $kvProcess.Dispose() }
}`;

export function buildWindowsAgentCommand(provider: AiSessionProvider, prompt: string): string {
  const encoded = Buffer.from(prompt, "utf8").toString("base64");
  return `Start-KanVibeAgent '${provider}' '${encoded}'\r`;
}
