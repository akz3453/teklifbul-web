@echo off
echo ========================================
echo   TEKLIFBUL WEB - SERVER BASLATMA
echo ========================================
echo.

echo [1/2] Vite Frontend Server baslatiliyor (Port 5173)...
start "Vite Frontend" cmd /k "npm run dev"

timeout /t 3 /nobreak >nul

echo [2/2] API Server baslatiliyor (Port 5174)...
start "API Server" cmd /k "npm run dev:api"

timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo   SERVER'LAR BASLATILDI!
echo ========================================
echo.
echo Frontend: http://localhost:5173
echo API:      http://localhost:5174/api/health
echo.
echo Tarayicida acmak icin: http://localhost:5173
echo.
pause

