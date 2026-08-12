@echo off
setlocal
echo CRM Integral - Publicacao no Supabase
echo.
set /p PROJECT_REF=Cole o Project Reference do Supabase: 
if "%PROJECT_REF%"=="" (
  echo Project Reference nao informado.
  pause
  exit /b 1
)
call npx supabase login
if errorlevel 1 goto erro
call npx supabase link --project-ref %PROJECT_REF%
if errorlevel 1 goto erro
call npx supabase db push
if errorlevel 1 goto erro
call npx supabase functions deploy admin-create-user --no-verify-jwt
if errorlevel 1 goto erro
echo.
echo Supabase publicado com sucesso.
pause
exit /b 0
:erro
echo.
echo Ocorreu um erro durante a publicacao.
pause
exit /b 1
