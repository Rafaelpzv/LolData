@echo off
setlocal
cd /d "%~dp0"

REM Localiza o git sem depender do PATH (o PATH so e recarregado em terminais novos).
set "GIT="
for %%P in (
  "C:\Program Files\Git\cmd\git.exe"
  "C:\Program Files (x86)\Git\cmd\git.exe"
  "%LOCALAPPDATA%\Programs\Git\cmd\git.exe"
) do (
  if exist %%P if not defined GIT set "GIT=%%~P"
)
if not defined GIT (
  where git >nul 2>nul && set "GIT=git"
)
if not defined GIT (
  echo ERRO: git.exe nao encontrado. Abra um terminal novo e tente de novo.
  exit /b 1
)

REM O proprio script e a mensagem nao entram no commit.
"%GIT%" add -A -- ":!.tmp-dev.log" ":!commit.bat" ":!commit-msg.txt"
if errorlevel 1 goto :erro

"%GIT%" commit -F- < "%~dp0commit-msg.txt"
if errorlevel 1 goto :erro

echo.
echo === COMMIT CRIADO ===
"%GIT%" log --oneline -1
exit /b 0

:erro
echo.
echo === FALHOU (codigo %errorlevel%) ===
exit /b 1
