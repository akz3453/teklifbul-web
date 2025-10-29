@echo off
echo ================================================
echo Firebase Rules Deployment Script
echo ================================================
echo.

echo This script will deploy Firestore and Storage rules.
echo Make sure you have Firebase CLI installed and are logged in.
echo.

set /p confirm="Deploy rules to Firebase? (y/n): "
if /i not "%confirm%"=="y" (
    echo Deployment cancelled.
    exit /b
)

echo.
echo Deploying Firestore and Storage rules...
echo.

firebase deploy --only firestore:rules,storage:rules

if %errorlevel% equ 0 (
    echo.
    echo ================================================
    echo SUCCESS! Rules deployed successfully.
    echo ================================================
    echo.
    echo Next steps:
    echo 1. Create required Firestore indexes
    echo 2. Test the application
    echo 3. Check TESTING_GUIDE.md for test scenarios
    echo.
) else (
    echo.
    echo ================================================
    echo ERROR! Deployment failed.
    echo ================================================
    echo.
    echo Troubleshooting:
    echo 1. Make sure Firebase CLI is installed: npm install -g firebase-tools
    echo 2. Login to Firebase: firebase login
    echo 3. Initialize project: firebase init
    echo.
)

pause
