@echo off
cd /d "%~dp0"
".git_bin\cmd\git.exe" remote add origin https://github.com/finnthehuman-code/0904-CODE.git 2>nul
".git_bin\cmd\git.exe" remote set-url origin https://github.com/finnthehuman-code/0904-CODE.git
".git_bin\cmd\git.exe" add .
".git_bin\cmd\git.exe" commit -m "update"
".git_bin\cmd\git.exe" push -u origin main
pause
