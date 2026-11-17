@echo off
rem FA Analytics: start the app on this computer (http://localhost:3002).
rem Keep this window open while you use the app; closing it stops the app and its nightly jobs.
cd /d "%~dp0\..\.."
title FA Analytics (keep open)
rem Only this computer can open it (127.0.0.1). The Mac Mini setup later chooses its own private address.
call npm.cmd run start -- -H 127.0.0.1
