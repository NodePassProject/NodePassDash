@echo off
setlocal enabledelayedexpansion

:: NodePassDash MySQL + GORM Windows 启动脚本
:: 演示多种数据库连接配置方式

echo 🚀 NodePassDash MySQL + GORM 启动脚本
echo ======================================

:: 切换到项目根目录
cd /d "%~dp0\.."

:: 检查Go环境
where go >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Go 未安装或未添加到 PATH
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('go version') do set GO_VERSION=%%i
echo ✅ Go 版本: %GO_VERSION%

:: 构建应用
echo 🔨 构建应用...
go build -o nodepass-dashboard.exe ./cmd/server
if %errorlevel% neq 0 (
    echo ❌ 构建失败
    pause
    exit /b 1
)

:: 配置方式选择
echo.
echo 选择数据库配置方式:
echo 1. 使用环境变量 (.env 文件)
echo 2. 使用命令行参数
echo 3. 使用默认配置
echo 4. 交互式配置

set /p choice="请选择 (1-4): "

if "%choice%"=="1" goto env_config
if "%choice%"=="2" goto cmd_config
if "%choice%"=="3" goto default_config
if "%choice%"=="4" goto interactive_config
goto default_config

:env_config
echo 📝 使用环境变量配置...
if not exist ".env" (
    echo ⚠️  .env 文件不存在，从示例文件创建...
    copy config.env.sample .env >nul
    echo ✅ 已创建 .env 文件，请编辑数据库配置后重新运行
    pause
    exit /b 0
)

:: 读取.env文件并设置环境变量
for /f "usebackq tokens=1,2 delims==" %%a in (".env") do (
    if not "%%a"=="" if not "%%a:~0,1%"=="#" (
        set "%%a=%%b"
    )
)
echo ✅ 已加载环境变量配置
set DB_ARGS=
goto start_app

:cmd_config
echo ⌨️  使用命令行参数配置...
set /p db_host="MySQL 主机 [localhost]: "
set /p db_port="MySQL 端口 [3306]: "
set /p db_user="MySQL 用户名 [nodepass]: "
set /p db_password="MySQL 密码: "
set /p db_name="数据库名 [nodepass_dashboard]: "

:: 设置默认值
if "%db_host%"=="" set db_host=localhost
if "%db_port%"=="" set db_port=3306
if "%db_user%"=="" set db_user=nodepass
if "%db_name%"=="" set db_name=nodepass_dashboard

:: 构建命令行参数
set DB_ARGS=--db-host="%db_host%" --db-port="%db_port%" --db-user="%db_user%" --db-password="%db_password%" --db-name="%db_name%"
echo ✅ 已设置命令行参数
goto start_app

:default_config
echo 🔧 使用默认配置...
echo   主机: localhost:3306
echo   用户: nodepass
echo   数据库: nodepass_dashboard
echo ⚠️  请确保 MySQL 服务运行且配置正确
set DB_ARGS=
goto start_app

:interactive_config
echo 💬 交互式配置...

:: 数据库连接配置
set /p db_host="MySQL 主机 [localhost]: "
set /p db_port="MySQL 端口 [3306]: "
set /p db_user="MySQL 用户名 [nodepass]: "
set /p db_password="MySQL 密码: "
set /p db_name="数据库名 [nodepass_dashboard]: "
set /p db_charset="字符集 [utf8mb4]: "

:: 连接池配置
set /p db_max_open="最大连接数 [100]: "
set /p db_max_idle="最大空闲连接数 [10]: "
set /p db_log_level="日志级别 (silent/error/warn/info) [info]: "

:: 设置默认值
if "%db_host%"=="" set db_host=localhost
if "%db_port%"=="" set db_port=3306
if "%db_user%"=="" set db_user=nodepass
if "%db_name%"=="" set db_name=nodepass_dashboard
if "%db_charset%"=="" set db_charset=utf8mb4
if "%db_max_open%"=="" set db_max_open=100
if "%db_max_idle%"=="" set db_max_idle=10
if "%db_log_level%"=="" set db_log_level=info

:: 设置环境变量
set DB_HOST=%db_host%
set DB_PORT=%db_port%
set DB_USERNAME=%db_user%
set DB_PASSWORD=%db_password%
set DB_DATABASE=%db_name%
set DB_CHARSET=%db_charset%
set DB_MAX_OPEN_CONNS=%db_max_open%
set DB_MAX_IDLE_CONNS=%db_max_idle%
set DB_LOG_LEVEL=%db_log_level%

set DB_ARGS=
echo ✅ 已设置交互式配置
goto start_app

:start_app
echo.
echo 🔍 检查MySQL连接...

:: 简单的连接测试（如果安装了mysql客户端）
where mysql >nul 2>nul
if %errorlevel% equ 0 (
    if defined DB_HOST if defined DB_USERNAME (
        mysql -h"%DB_HOST%" -P"%DB_PORT%" -u"%DB_USERNAME%" -p"%DB_PASSWORD%" -e "SELECT 1;" >nul 2>nul
        if !errorlevel! equ 0 (
            echo ✅ MySQL 连接测试成功
        ) else (
            echo ⚠️  MySQL 连接测试失败，但程序仍将尝试连接
        )
    ) else (
        echo ⚠️  跳过MySQL连接测试
    )
) else (
    echo ⚠️  mysql 客户端未安装，跳过连接测试
)

:: 启动应用
echo.
echo 🚀 启动 NodePassDash...
echo Ctrl+C 停止应用
echo.

if "%DB_ARGS%"=="" (
    nodepass-dashboard.exe
) else (
    nodepass-dashboard.exe %DB_ARGS%
)

pause 