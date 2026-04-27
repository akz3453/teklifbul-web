@echo off
echo Deploying simple Firestore rules...

firebase deploy --only firestore:rules

echo.
echo Rules deployed! Check Firebase Console for status.
pause
