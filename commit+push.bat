@echo off
cd "C:\Users\hh102\Desktop\TextLink"
set /p commitdesc=Enter commit description: 
git add *
git commit -m "%commitdesc%"
git push
pause
