@echo off
echo Adding Windows Firewall rule for port 8443...
netsh advfirewall firewall add rule name="HTTPS Server 8443" dir=in action=allow protocol=tcp localport=8443
if %ERRORLEVEL%==0 (
    echo Success! Port 8443 is now open.
) else (
    echo Failed! Please run this as Administrator.
    echo Right-click on this file -> "Run as administrator"
)
pause
