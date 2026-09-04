@echo off
chcp 65001 > nul
set "GIT_EXE=%~dp0.git_bin\cmd\git.exe"

echo ===================================================
echo   ?? 캘린더 원클릭 깃허브 백업 및 자동 배포기
echo ===================================================
echo.

"%GIT_EXE%" remote get-url origin > nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [알림] 깃허브 저장소 주소가 아직 연결되지 않았습니다!
    echo.
    echo 깃허브(github.com)에서 만든 저장소 주소를 복사해 아래에 붙여넣고 Enter를 눌러주세요.
    echo (예: https://github.com/내아이디/my-calendar.git)
    echo.
    set /p REPO_URL="깃허브 저장소 URL: "
    if not "!REPO_URL!"=="" (
        "%GIT_EXE%" remote add origin !REPO_URL!
        echo.
        echo [성공] 저장소가 연결되었습니다!
    )
)

echo.
echo [1/3] 변경된 파일들을 추가합니다...
"%GIT_EXE%" add .

set /p MSG="[2/3] 변경 내용을 간단히 적어주세요 (엔터 치면 자동 문구 적용): "
if "%MSG%"=="" set MSG=업데이트: %date% %time%

"%GIT_EXE%" commit -m "%MSG%"
echo.
echo [3/3] 깃허브에 업로드(배포) 중입니다...
"%GIT_EXE%" push -u origin main

echo.
echo ===================================================
echo   ? 깃허브에 최신 버전이 성공적으로 배포되었습니다!
echo ===================================================
pause
