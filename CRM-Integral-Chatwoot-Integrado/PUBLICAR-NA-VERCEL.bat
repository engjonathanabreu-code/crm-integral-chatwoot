@echo off
echo CRM Integral - Publicacao na Vercel
echo.
echo Este processo exige Node.js instalado.
echo Selecione o projeto da Vercel que ja possui o dominio crmintegralreurb.work.
echo.
call npx vercel login
call npx vercel link
call npx vercel --prod
pause
