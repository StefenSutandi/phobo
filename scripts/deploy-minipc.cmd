@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo PHOBO PRODUCTION MINI PC DEPLOYMENT / START HELPER
echo ===================================================

cd /d "C:\Users\DELL\Downloads\Phobo_live" 2>nul
if errorlevel 1 (
    echo [INFO] Running in current directory: %CD%
) else (
    echo [INFO] Working directory set to C:\Users\DELL\Downloads\Phobo_live
)

echo.
echo [1/5] Pulling latest updates from git main...
git pull origin main
if errorlevel 1 (
    echo [ERROR] Git pull failed. Please check network / git status.
    exit /b 1
)

echo.
echo [2/5] Validating native Node dependencies...
node -e "require('lightningcss'); console.log('✓ LIGHTNINGCSS OK')"
if errorlevel 1 (
    echo [WARN] Native lightningcss missing or mismatch, running npm.cmd ci --include=optional...
    call npm.cmd ci --include=optional
)

node -e "const sharp=require('sharp'); console.log('✓ SHARP OK', sharp.versions.sharp)"
if errorlevel 1 (
    echo [WARN] Native Sharp missing or mismatch, running npm.cmd ci --include=optional...
    call npm.cmd ci --include=optional
)

echo.
echo [3/5] Cleaning stale build cache (.next)...
if exist ".next" (
    rmdir /S /Q .next
    echo ✓ Stale .next directory cleaned.
)

echo.
echo [4/5] Building production Next.js application...
call npm.cmd run build
if errorlevel 1 (
    echo [ERROR] Build failed! Check errors above.
    exit /b 1
)

echo.
echo ===================================================
echo [5/5] Starting Phobo production server on port 3000...
echo ===================================================
call npm.cmd run start
