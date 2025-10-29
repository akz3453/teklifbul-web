@echo off
echo ================================================
echo Firebase Rules Deployment Script (Auto)
echo ================================================
echo.

echo This script will automatically deploy Firestore and Storage rules.
echo Make sure you have Firebase CLI installed and are logged in.
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
    echo 1. Clear your browser cache
    echo 2. Hard refresh the dashboard (Ctrl+F5)
    echo 3. Check the console for errors
    echo.
    echo You should no longer see permission errors!
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