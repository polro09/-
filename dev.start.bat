@echo off
chcp 65001 > nul
title Aimdot.dev Development Environment

echo ╔════════════════════════════════════════════════════════════════════╗
echo ║                 Aimdot.dev 개발 환경 실행 스크립트                  ║
echo ║                                                                    ║
echo ║  개발 모드 기능:                                                   ║
echo ║  - Nodemon을 사용한 자동 재시작                                    ║
echo ║  - 디버그 로그 활성화                                              ║
echo ║  - Cloudflared 터널 실행                                           ║
echo ╚════════════════════════════════════════════════════════════════════╝
echo.

REM 현재 디렉토리 저장
set CURRENT_DIR=%cd%

REM Cloudflared 설정 경로
set CLOUDFLARED_CONFIG=C:\Users\AD\.cloudflared\config.yml

REM 개발 환경 변수 설정
set NODE_ENV=development
set DEBUG_SESSION=true

REM Cloudflared 실행 확인
echo [1/5] Cloudflared 실행 준비 중...
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
echo [2/5] Cloudflared 터널 시작 중...
echo       설정 파일: %CLOUDFLARED_CONFIG%
start "Cloudflared Tunnel" /min cmd /c "cloudflared tunnel --config %CLOUDFLARED_CONFIG% run"

REM 3초 대기 (Cloudflared가 시작되도록)
timeout /t 3 /nobreak > nul

REM Node.js 설치 확인
echo.
echo [3/5] Node.js 환경 확인 중...
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
echo [4/5] 의존성 패키지 확인 중...
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

REM nodemon 설치 확인
echo [5/5] Nodemon 확인 중...
where nodemon >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Nodemon이 전역으로 설치되어 있지 않습니다.
    echo 로컬 nodemon을 사용합니다...
)

REM 환경 변수 파일 확인
if not exist ".env" (
    echo.
    echo [경고] .env 파일이 없습니다.
    echo 봇이 정상적으로 작동하려면 .env 파일이 필요합니다.
    echo.
)

REM Discord 봇 실행 (개발 모드)
echo.
echo ════════════════════════════════════════════════════════════════════
echo.
echo [성공] 개발 환경 준비 완료!
echo.
echo - 환경: Development
echo - 디버그 모드: 활성화
echo - 자동 재시작: 활성화 (파일 변경 감지)
echo - Cloudflared 터널: https://aimdot.dev
echo - Express 서버: http://localhost:3000
echo.
echo ════════════════════════════════════════════════════════════════════
echo.
echo Discord 봇을 개발 모드로 시작합니다...
echo 종료하려면 Ctrl+C를 두 번 누르세요.
echo.

REM 봇 실행 (개발 모드)
call npm run dev:debug

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