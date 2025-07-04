@echo off
chcp 65001 > nul
title Aimdot.dev Discord Bot + Cloudflared Server

echo ╔════════════════════════════════════════════════════════════════════╗
echo ║                    Aimdot.dev 통합 실행 스크립트                    ║
echo ║                                                                    ║
echo ║  이 스크립트는 다음을 실행합니다:                                  ║
echo ║  1. Cloudflared 터널 서버                                          ║
echo ║  2. Aimdot.dev Discord 봇                                          ║
echo ╚════════════════════════════════════════════════════════════════════╝
echo.

REM 현재 디렉토리 저장
set CURRENT_DIR=%cd%

REM Cloudflared 설정 경로
set CLOUDFLARED_CONFIG=C:\Users\AD\.cloudflared\config.yml

REM Cloudflared 실행 확인
echo [1/4] Cloudflared 실행 준비 중...
where cloudflared >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [오류] Cloudflared가 설치되어 있지 않습니다.
    echo Cloudflared를 먼저 설치해주세요: https://github.com/cloudflare/cloudflared
    echo.
    pause
    exit /b
)

REM 설정 파일 확인
if not exist "%CLOUDFLARED_CONFIG%" (
    echo.
    echo [오류] Cloudflared 설정 파일을 찾을 수 없습니다.
    echo 경로: %CLOUDFLARED_CONFIG%
    echo.
    pause
    exit /b
)

REM Cloudflared 실행
echo [2/4] Cloudflared 터널 시작 중...
echo       설정 파일: %CLOUDFLARED_CONFIG%
start "Cloudflared Tunnel" /min cmd /c "cloudflared tunnel --config %CLOUDFLARED_CONFIG% run"

REM 3초 대기 (Cloudflared가 시작되도록)
timeout /t 3 /nobreak > nul

REM Node.js 설치 확인
echo.
echo [3/4] Node.js 환경 확인 중...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [오류] Node.js가 설치되어 있지 않습니다.
    echo Node.js를 먼저 설치해주세요: https://nodejs.org/
    echo.
    pause
    exit /b
)

REM package.json 파일 확인
if not exist "package.json" (
    echo.
    echo [오류] package.json 파일을 찾을 수 없습니다.
    echo 현재 위치: %cd%
    echo Discord 봇 프로젝트 루트 디렉토리에서 실행해주세요.
    echo.
    pause
    exit /b
)

REM npm 패키지 설치 확인
echo [4/4] 의존성 패키지 확인 중...
if not exist "node_modules" (
    echo.
    echo node_modules 폴더가 없습니다. npm install을 실행합니다...
    echo.
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo [오류] npm install 실행 중 오류가 발생했습니다.
        echo.
        pause
        exit /b
    )
)

REM 환경 변수 파일 확인
if not exist ".env" (
    echo.
    echo [경고] .env 파일이 없습니다.
    echo 봇이 정상적으로 작동하려면 .env 파일이 필요합니다.
    echo.
)

REM Discord 봇 실행
echo.
echo ════════════════════════════════════════════════════════════════════
echo.
echo [성공] 모든 준비가 완료되었습니다!
echo.
echo - Cloudflared 터널: https://aimdot.dev
echo - Discord 봇: 실행 중...
echo.
echo ════════════════════════════════════════════════════════════════════
echo.
echo Discord 봇을 시작합니다...
echo.

REM 봇 실행 (현재 창에서)
call npm start

REM 봇이 종료되면
echo.
echo ════════════════════════════════════════════════════════════════════
echo.
echo Discord 봇이 종료되었습니다.
echo Cloudflared 터널도 종료합니다...
echo.

REM Cloudflared 프로세스 종료
taskkill /F /FI "WINDOWTITLE eq Cloudflared Tunnel*" >nul 2>&1

echo 모든 프로세스가 종료되었습니다.
echo.
pause