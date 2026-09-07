Option Explicit

Dim fileSystem, shell, scriptDirectory, startScript, command, exitCode, quote, noBrowser, index
Dim powerShellPath, localAppData, diagnosticPath

Set fileSystem = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

quote = Chr(34)
noBrowser = False
For index = 0 To WScript.Arguments.Count - 1
    If LCase(WScript.Arguments(index)) = "--no-browser" Then noBrowser = True
Next

scriptDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)
startScript = fileSystem.BuildPath(scriptDirectory, "Start-LocalApp.ps1")
powerShellPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
localAppData = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
diagnosticPath = fileSystem.BuildPath(fileSystem.BuildPath(localAppData, "PatternStudioLocal"), "launcher-errors.log")

If Not fileSystem.FileExists(startScript) Then
    MsgBox "Pattern Studio launcher is incomplete: Start-LocalApp.ps1 was not found.", 16, "Pattern Studio"
    WScript.Quit 2
End If
If Not fileSystem.FileExists(powerShellPath) Then
    MsgBox "Pattern Studio could not find Windows PowerShell: " & powerShellPath, 16, "Pattern Studio"
    WScript.Quit 3
End If

command = quote & powerShellPath & quote & " -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden " & _
    "-ExecutionPolicy Bypass -File " & quote & startScript & quote
If noBrowser Then command = command & " -NoBrowser"

exitCode = shell.Run(command, 0, True)
If exitCode <> 0 Then
    MsgBox "Pattern Studio could not start. Try the icon once more." & vbCrLf & vbCrLf & _
        "Diagnostic log: " & diagnosticPath, 16, "Pattern Studio"
End If

WScript.Quit exitCode
