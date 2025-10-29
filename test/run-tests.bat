@echo off
REM Test Runner Script for Teklifbul (Windows)
REM Starts Firebase emulators and runs tests

echo 🚀 Starting Teklifbul Test Suite

REM Check if Firebase CLI is installed
where firebase >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Firebase CLI not found. Please install it first:
    echo    npm install -g firebase-tools
    exit /b 1
)

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js not found. Please install Node.js first.
    exit /b 1
)

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    npm install
)

REM Start Firebase emulators in background
echo 🔥 Starting Firebase emulators...
start /b firebase emulators:start --only firestore,auth

REM Wait for emulators to start
echo ⏳ Waiting for emulators to start...
timeout /t 10 /nobreak >nul

REM Check if emulators are running
curl -s http://localhost:8080 >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Firestore emulator failed to start
    exit /b 1
)

echo ✅ Emulators started successfully

REM Run tests
echo 🧪 Running tests...
npm test

REM Capture test exit code
set TEST_EXIT_CODE=%errorlevel%

REM Stop emulators (find and kill firebase processes)
taskkill /f /im firebase.exe >nul 2>nul

REM Exit with test result
if %TEST_EXIT_CODE% equ 0 (
    echo ✅ All tests passed!
) else (
    echo ❌ Some tests failed!
)

exit /b %TEST_EXIT_CODE%
