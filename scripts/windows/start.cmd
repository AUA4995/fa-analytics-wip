@echo off
rem FA Analytics: start the app on this computer (http://localhost:3002).
rem Keep this window open while you use the app; closing it stops the app and its nightly jobs.
cd /d "%~dp0\..\.."
title FA Analytics (keep open)
call npm.cmd run start
