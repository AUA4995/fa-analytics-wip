@echo off
rem FA Analytics: get the newest released version from GitHub (main), update the database, rebuild.
rem Stop the app first (close the "FA Analytics" window), then run this, then start.cmd again.
cd /d "%~dp0\..\.."
git checkout main || goto :fail
git pull --ff-only || goto :fail
call npm.cmd ci || goto :fail
call npm.cmd run db:deploy || goto :fail
call npm.cmd run build || goto :fail
echo.
echo Updated. Start the app again with scripts\windows\start.cmd
exit /b 0
:fail
echo.
echo Update stopped because a step failed (see above). Nothing was started. Send the message above to Claude.
exit /b 1
