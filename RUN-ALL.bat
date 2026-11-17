@echo off
chcp 65001 >nul
title CET4 Full Regression
cd /d "D:\CET4\scripts"
echo.
echo ============================================
echo   CET4 full regression - all 46 tests
echo   Takes 20-40 minutes. DO NOT close window.
echo   Browser windows may open/close automatically - that is normal.
echo ============================================
echo.
where node >nul 2>nul
if errorlevel 1 goto NONODE
node run_all.js
echo.
echo ============================================
echo   DONE. Look above for:
echo   - "GATE PASS" = all required tests passed
echo   - "GATE FAIL: ..." = list of failed tests
echo   Results saved to: D:\CET4\docs\run-all-result.json
echo   Just tell WorkBuddy "run finished" - no screenshot needed.
echo ============================================
echo.
pause
exit /b
:NONODE
echo.
echo [X] Node.js not found. Screenshot this window and send to WorkBuddy.
echo.
pause
