' 简洁版VBS脚本启动开发服务
Dim objShell, scriptDir

' 创建Shell对象
Set objShell = CreateObject("WScript.Shell")

' 获取脚本所在目录
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' 启动三个cmd窗口运行pnpm命令
objShell.Run "cmd.exe /k ""cd /d """ & scriptDir & """ && title 🚀 前端服务 && pnpm dev:front""", 1, False
WScript.Sleep 1500

objShell.Run "cmd.exe /k ""cd /d """ & scriptDir & """ && title 🚀 后端服务 && pnpm dev:back""", 1, False
WScript.Sleep 1500

objShell.Run "cmd.exe /k ""cd /d """ & scriptDir & """ && title 🚀 核心服务 && pnpm dev:core""", 1, False


Set objShell = Nothing