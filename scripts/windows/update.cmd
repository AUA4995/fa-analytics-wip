@echo off
rem FA Analytics: get the newest released version from GitHub (main), back up, update the database, rebuild.
rem Stop the app first (close the "FA Analytics" window), then run this, then start.cmd again.
setlocal
cd /d "%~dp0\..\.."
netstat -ano | findstr /r /c:":3002 .*LISTENING" >nul && (echo The app is still running - close the "FA Analytics" window first, then run this again. & exit /b 1)
echo Taking a backup before updating...
call "%~dp0backup.cmd" || (echo The backup failed, so nothing was updated. & exit /b 1)
git checkout main || goto :fail
git pull --ff-only || goto :fail
call npm.cmd ci || goto :fail
call npm.cmd run db:deploy || goto :fail
call npm.cmd run build || (echo Build stopped once - trying again... & call npm.cmd run build) || goto :fail
echo.
echo Updated. Start the app again with scripts\windows\start.cmd
exit /b 0
:fail
echo.
echo Update stopped because a step failed (see above). Nothing was started. The backup taken before the update is in your backup folder. Send the message above to Claude.
exit /b 1
