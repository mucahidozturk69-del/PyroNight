Option Explicit
Dim sh, fso, root, serverDir, logFile, command, rc, req, already, attempts
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
serverDir = fso.BuildPath(root, "server")
If Not fso.FileExists(fso.BuildPath(serverDir, "server.js")) Then
  MsgBox "Extract the entire game ZIP to a regular folder first, then run this launcher from that folder.", vbExclamation, "Pyro Night"
  WScript.Quit 1
End If
On Error Resume Next
Set req = CreateObject("WinHttp.WinHttpRequest.5.1")
req.SetTimeouts 500, 500, 500, 1000
req.Open "GET", "http://127.0.0.1:8788/health", False
req.Send
already = (Err.Number = 0 And req.Status = 200 And InStr(1, req.ResponseText, """ok"":true", vbTextCompare) > 0)
Err.Clear
On Error GoTo 0
If already Then
  sh.Run "http://localhost:8788", 1, False
  WScript.Quit 0
End If
rc = sh.Run("cmd.exe /c node -e ""process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)""", 0, True)
If rc <> 0 Then
  MsgBox "Node.js 18 or newer is required for local multiplayer. Install Node.js and try again.", vbExclamation, "Pyro Night"
  WScript.Quit 1
End If
sh.CurrentDirectory = serverDir
logFile = sh.ExpandEnvironmentStrings("%TEMP%") & "\pyro-night-server.log"
command = "cmd.exe /c node server.js > """ & logFile & """ 2>&1"
sh.Run command, 0, False
already = False
For attempts = 1 To 12
  WScript.Sleep 500
  On Error Resume Next
  Set req = CreateObject("WinHttp.WinHttpRequest.5.1")
  req.SetTimeouts 500, 500, 500, 1000
  req.Open "GET", "http://127.0.0.1:8788/health", False
  req.Send
  already = False
  If Err.Number = 0 Then
    If req.Status = 200 Then
      If InStr(1, req.ResponseText, """ok"":true", vbTextCompare) > 0 Then already = True
    End If
  End If
  Err.Clear
  On Error GoTo 0
  If already Then Exit For
Next
If Not already Then
  MsgBox "The local server did not start. Check " & logFile & " for details.", vbExclamation, "Pyro Night"
  WScript.Quit 1
End If
sh.Run "http://localhost:8788", 1, False
