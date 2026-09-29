@echo off
setlocal
title KanVibe - Ubuntu WSL
:launch
echo Starting KanVibe in Ubuntu...
wsl.exe -d Ubuntu --cd "%~dp0." -- bash scripts/start-wsl.sh
set "KANVIBE_EXIT_CODE=%ERRORLEVEL%"
if "%KANVIBE_EXIT_CODE%"=="0" exit /b 0
if "%KANVIBE_EXIT_CODE%"=="78" goto graphics
echo.
echo KanVibe could not start. Exit code: %KANVIBE_EXIT_CODE%
echo Read the error above. Diagnostics: Ubuntu ~/.config/kanvibe/logs/kanvibe-desktop.log
pause
exit /b %KANVIBE_EXIT_CODE%
:graphics
echo.
echo WSL graphics needs a restart. This closes ALL running WSL apps and terminals.
echo Save any other WSL work first.
choice /C RN /N /M "Press R to restart WSL and open KanVibe, or N to cancel: "
if errorlevel 2 exit /b 78
wsl.exe --shutdown
if errorlevel 1 exit /b 1
goto launch
