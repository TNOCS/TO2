@echo off
call npm install
cd public
call bower install
cd ..
call gulp all
call tsc