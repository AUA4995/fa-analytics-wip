@echo off
rem FA Analytics: encrypted backup of the database - one copy to OneDrive (off-site), one to the NAS (on-site).
rem Needs (set once, as Windows user environment variables):
rem   FA_BACKUP_DIR        a folder inside OneDrive (off-site copy), e.g. C:\Users\3PL2Staff\OneDrive - Fulfilment Australia\Backups\Analytics
rem   FA_BACKUP_NAS_DIR    a folder on the office NAS (on-site copy), e.g. \\SMITHFIELD-NAS\Backups\Analytics  (optional, but agreed)
rem   FA_BACKUP_PASSPHRASE a long passphrase, kept in the password manager (Asal + Marcus). Without it a backup can't be opened.
rem The database password is read from %APPDATA%\postgresql\pgpass.conf (see docs\INSTALL-LOCAL.md section 6).
rem Deletes backups older than 30 days. Run daily from Task Scheduler.
setlocal
if "%FA_BACKUP_DIR%"=="" (echo FA_BACKUP_DIR is not set & exit /b 1)
if "%FA_BACKUP_PASSPHRASE%"=="" (echo FA_BACKUP_PASSPHRASE is not set & exit /b 1)
set "DEST=%FA_BACKUP_DIR%"
if "%DEST:~-1%"=="\" set "DEST=%DEST:~0,-1%"
set "PGBIN=C:\Program Files\PostgreSQL\16\bin"
if not exist "%PGBIN%\pg_dump.exe" (echo pg_dump not found in %PGBIN% - is PostgreSQL 16 installed there? & exit /b 1)
set "OPENSSL=C:\Program Files\Git\usr\bin\openssl.exe"
if not exist "%OPENSSL%" (echo openssl not found - it comes with Git for Windows & exit /b 1)
set "STAMP="
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmmss"') do set "STAMP=%%i"
if "%STAMP%"=="" (echo Could not read the date and time - backup not taken & exit /b 1)
if not exist "%DEST%" mkdir "%DEST%"
set "TMPFILE=%TEMP%\fa_analytics_%STAMP%.dump"
set "OUT=%DEST%\fa_analytics_%STAMP%.dump.enc"
"%PGBIN%\pg_dump.exe" -h localhost -U fa_analytics -w -Fc -f "%TMPFILE%" fa_analytics || goto :fail
"%OPENSSL%" enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in "%TMPFILE%" -out "%OUT%" -pass env:FA_BACKUP_PASSPHRASE || goto :fail
del "%TMPFILE%"
echo Backup written: %OUT%
if not "%FA_BACKUP_NAS_DIR%"=="" (
  if not exist "%FA_BACKUP_NAS_DIR%" mkdir "%FA_BACKUP_NAS_DIR%"
  copy /y "%OUT%" "%FA_BACKUP_NAS_DIR%\" >nul && (echo NAS copy written to %FA_BACKUP_NAS_DIR%) || (echo WARNING: the NAS copy failed - the OneDrive copy is fine.)
  forfiles /p "%FA_BACKUP_NAS_DIR%" /m fa_analytics_*.dump.enc /d -30 /c "cmd /c del @path" 2>nul
) else (
  echo Note: FA_BACKUP_NAS_DIR is not set, so there is no NAS copy.
)
forfiles /p "%DEST%" /m fa_analytics_*.dump.enc /d -30 /c "cmd /c del @path" 2>nul
exit /b 0
:fail
if exist "%TMPFILE%" del "%TMPFILE%"
echo Backup FAILED.
exit /b 1
