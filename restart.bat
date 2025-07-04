@echo off
chcp 65001 > nul
title Aimdot.dev Quick Restart

echo ╔════════════════════════════════════════════════════════════════════╗
echo ║                    Aimdot.dev 빠른 재시작                          ║
echo ╚════════════════════════════════════════════════════════════════════╝
echo.

echo [1/3] 기존 프로세스 종료 중...

REM Node.js 프로세스 종료 (Discord 봇)
taskkill /F /IM node.exe >nul 2>&1

REM Cloudflared 프로세스 종료
taskkill /F /IM cloudflared.exe >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Cloudflared Tunnel*" >nul 2>&1

echo [2/3] 프로세스 정리 완료. 3초 대기 중...
timeout /t 3 /nobreak > nul

echo [3/3] 새로운 인스턴스 시작 중...
echo.

REM start-aimdot.bat 실행
call start-aimdot.bat