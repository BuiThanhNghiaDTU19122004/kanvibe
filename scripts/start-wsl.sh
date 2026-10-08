#!/usr/bin/env bash
set -eo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

# Do not shut down WSL automatically: it may host other work.
if [[ -r /mnt/wslg/weston.log ]] &&
   [[ $(sed -n 's/.*RDP backend: use_gfxredir = //p' /mnt/wslg/weston.log | tail -1) == 0 ]] &&
   grep -q 'rdp_allocate_shared_memory: Failed to open' /mnt/wslg/weston.log; then
  echo "[KanVibe] WSL graphics is in COPY MODE. The app would run with an invisible window."
  echo "[KanVibe] Save other WSL work, then restart WSL from the launcher to repair graphics."
  exit 78
fi

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  source "$HOME/.nvm/nvm.sh"
  nvm use 24
fi
if ! command -v node >/dev/null || ! command -v pnpm >/dev/null; then
  echo "[KanVibe] Node 24 and pnpm must be installed in Ubuntu."
  exit 1
fi
echo "[KanVibe] Starting the desktop app. First startup can take a little longer."
echo "[KanVibe] Startup errors are shown here; keep this window open."
exec pnpm start
