# KanVibe Windows app

Double-click `D:\kanvibe\dist\windows\Install-KanVibe.cmd` to install for the current Windows user. No administrator account is needed. The installer creates Desktop and Start Menu shortcuts and opens KanVibe. Close KanVibe before updating.

The installed app lives in `%LOCALAPPDATA%\Programs\KanVibe`, independently of the source checkout. Keep the entire installed directory together. Desktop opens the app directly; Start Menu also includes **KanVibe Console** for console launch. User data is stored by Electron separately from the installed program.

To run without installing, open `dist\windows\KanVibe-Console.exe` or `dist\windows\win-unpacked\KanVibe.exe`. Keep the console executable next to `win-unpacked`.

Rebuild from the project root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\build-windows-app.ps1
node qa/electron/windows-package-smoke.cjs
```

The smoke check uses an isolated database under `.tooling/windows-package-smoke` and disables Chromium's sandbox for the restricted automation environment.

Logo: `resources/kanvibe-logo.png`. Windows icon: `resources/kanvibe-windows.ico` (16–256 px). The logo was generated with the built-in image generation tool; its complete prompt is in `resources/kanvibe-logo-prompt.txt`.
