Add-Type -AssemblyName System.Net.Http

function Test-GitHub {
    $h = New-Object System.Net.Http.HttpClient
    $h.Timeout = [TimeSpan]::FromSeconds(8)
    try {
        $resp = $h.GetAsync('https://github.com').GetAwaiter().GetResult()
        $h.Dispose()
        return ([int]$resp.StatusCode -eq 200)
    } catch {
        try { $h.Dispose() } catch {}
        return $false
    }
}

Set-Location 'D:\http'
$env:GIT_TERMINAL_PROMPT = '0'
$env:GIT_ASKPASS = 'echo'

$maxAttempts = 30
for ($i = 1; $i -le $maxAttempts; $i++) {
    Write-Output ("=== attempt $i/$maxAttempts $(Get-Date -Format HH:mm:ss) ===")
    if (-not (Test-GitHub)) {
        Write-Output "network not ready"
        Start-Sleep -Seconds 20
        continue
    }
    Write-Output "network OK, pushing..."
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'git'
    $psi.Arguments = 'push origin main'
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $psi.WorkingDirectory = 'D:\http'
    $envMap = @{ GIT_TERMINAL_PROMPT='0'; GIT_ASKPASS='echo' }
    $p = New-Object System.Diagnostics.Process
    $p.StartInfo = $psi
    $p.Start() | Out-Null
    $finished = $p.WaitForExit(90000)
    if (-not $finished) {
        try { $p.Kill() } catch {}
        Write-Output "push timed out after 90s, killed"
        Start-Sleep -Seconds 20
        continue
    }
    $out = $p.StandardOutput.ReadToEnd() + $p.StandardError.ReadToEnd()
    Write-Output $out
    Write-Output ("push exit=" + $p.ExitCode)
    if ($p.ExitCode -eq 0) {
        Write-Output "PUSH_SUCCESS"
        exit 0
    }
    Start-Sleep -Seconds 20
}
Write-Output "ALL_ATTEMPTS_FAILED"
exit 1
