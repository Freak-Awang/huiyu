@echo off
chcp 65001 >nul
title 企业IM - 一键启动

echo ========================================
echo   企业IM 开发环境一键启动
echo ========================================
echo.

REM 关闭已有前端进程
echo [1/4] 清理旧进程...
for %%p in (5173 5174) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":%%p"') do (
        taskkill /F /PID %%a >nul 2>&1
    )
)

REM 启动基础设施 (MySQL + Redis)
echo [2/4] 启动 Docker 基础设施...
docker compose -f "%~dp0app\docker\docker-compose.yml" up -d mysql redis
if errorlevel 1 (
    echo Docker 启动失败，请检查 Docker Desktop 是否运行
    pause
    exit /b 1
)

REM 启动后端
echo [3/4] 启动后端服务 (8080)...
start "IM-Backend" cmd /c "cd /d %~dp0app\im-backend\im-server\target && java -jar im-server-1.0.0.jar"

REM 等待后端启动
echo 等待后端启动...
timeout /t 8 /nobreak >nul

REM 启动前端
echo [4/4] 启动前端服务...
start "IM-Admin" cmd /c "cd /d %~dp0app\im-admin && npm run dev"
start "IM-Web" cmd /c "cd /d %~dp0app\im-web && npm run dev"
timeout /t 4 /nobreak >nul

REM 打开浏览器
echo 正在打开浏览器...
start http://localhost:5173
start http://localhost:5174

echo.
echo ========================================
echo   启动完成！
echo   后台管理端: http://localhost:5173
echo   IM 客户端:   http://localhost:5174
echo   登录账号:    admin / admin123
echo ========================================
echo.
echo 关闭各命令行窗口即可停止服务
pause
