@echo off
rem FA Analytics: encrypted backup of the database.
rem Needs (set once, as Windows user environment variables):
rem   FA_BACKUP_DIR        a folder inside OneDrive (off-site copy), e.g. C:\Users\3PL2Staff\OneDrive - Fulfilment Australia\Backups\Analytics
rem   FA_BACKUP_PASSPHRASE a long passphrase, kept in the password manager (Asal + Marcus). Without it a backup can't be opened.
rem   PGPASSWORD           the fa_analytics database password
rem Keeps the last 30 daily backups. Run daily from Task Scheduler.
setlocal
if "%FA_BACKUP_DIR%"=="" (echo FA_BACKUP_DIR is not set & exit /b 1)
if "%FA_BACKUP_PASSPHRASE%"=="" (echo FA_BACKUP_PASSPHRASE is not set & exit /b 1)
set OPENSSL="C:\Program Files\Git\usr\bin\openssl.exe"
if not exist %OPENSSL% (echo openssl not found - it comes with Git for Windows & exit /b 1)
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set STAMP=%%i
if not exist "%FA_BACKUP_DIR%" mkdir "%FA_BACKUP_DIR%"
set TMPFILE=%TEMP%\fa_analytics_%STAMP%.dump
pg_dump -h localhost -U fa_analytics -Fc -f "%TMPFILE%" fa_analytics || goto :fail
%OPENSSL% enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in "%TMPFILE%" -out "%FA_BACKUP_DIR%\fa_analytics_%STAMP%.dump.enc" -pass env:FA_BACKUP_PASSPHRASE || goto :fail
del "%TMPFILE%"
forfiles /p "%FA_BACKUP_DIR%" /m fa_analytics_*.dump.enc /d -30 /c "cmd /c del @path" 2>nul
echo Backup written: %FA_BACKUP_DIR%\fa_analytics_%STAMP%.dump.enc
exit /b 0
:fail
if exist "%TMPFILE%" del "%TMPFILE%"
echo Backup FAILED.
exit /b 1
