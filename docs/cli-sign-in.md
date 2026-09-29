# CLI sign-in

Install CLIs in the environment running KanVibe. If the Windows launcher starts
Ubuntu/WSL, install them in Ubuntu, even if they are installed on Windows already.

```sh
npm install -g @openai/codex@latest
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

In **Settings → AI Accounts**, use **Google Antigravity → Login** for Google's
current CLI (`agy`). Antigravity manages its own keyring session. Complete any
onboarding prompts in the embedded terminal, then finish Google sign-in in your
browser. Use `/usage` for quotas, `/logout` to switch accounts, and `/exit` to
close the CLI. KanVibe does not report legacy Gemini credentials as Antigravity
authentication. Existing Gemini CLI accounts and history remain under the legacy
Gemini section; those files are not an Antigravity session or quota source.

For ChatGPT, add or select a Codex account and click **Login**. KanVibe runs
`codex login`. In WSL it supplies a browser opener that launches the Windows
default browser. OAuth URLs are encoded before passing them to PowerShell, so
query parameters remain intact. Failed commands remain visible in the terminal.

For project work, run `agy` in a task terminal. Gemini-specific hooks and history
readers continue to apply to the legacy `gemini` CLI.

After pulling changes, run `pnpm build` and restart KanVibe. `pnpm start` reuses
an existing build.

References: [Codex authentication](https://learn.chatgpt.com/docs/auth),
[Antigravity installation and authentication](https://antigravity.google/docs/cli/install/),
[Gemini CLI migration](https://antigravity.google/docs/cli/gcli-migration/).
