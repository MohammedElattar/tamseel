@echo off
setlocal
cd /d "%~dp0server"
echo ================================================
echo    Edara - Officer Evaluation Committee System
echo ================================================
echo.
echo Starting the server...
echo.
echo   On this computer:  http://localhost:3000
echo   From the network:  http://THIS-PC-IP:3000
echo.
echo Keep this window open while using the app.
echo Press Ctrl+C (or close this window) to stop.
echo.
"%~dp0node\node.exe" dist\index.js
echo.
echo The server has stopped.
pause
