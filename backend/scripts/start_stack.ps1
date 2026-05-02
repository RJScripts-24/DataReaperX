$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Split-Path -Parent $scriptDir

function Get-WorkerProcess {
    Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='uv.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -and $_.CommandLine -match "datareaper\.workers\.scheduler\.WorkerSettings"
        } |
        Select-Object -First 1
}

Set-Location $backendDir

$existingWorker = Get-WorkerProcess
$startedWorkerProcess = $null

if ($existingWorker) {
    Write-Host "Worker already running (PID $($existingWorker.ProcessId))."
} else {
    $workerCommand = "Set-Location '$backendDir'; & '$backendDir\scripts\start_worker.ps1'"
    $startWorkerArgs = @{
        FilePath = "powershell.exe"
        ArgumentList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $workerCommand)
        PassThru = $true
    }
    $startedWorkerProcess = Start-Process @startWorkerArgs
    Write-Host "Started worker process (PID $($startedWorkerProcess.Id))."
}

$existingApi = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existingApi) {
    Write-Host "API already running on 127.0.0.1:8000 (PID $($existingApi.OwningProcess))."
    Write-Host "Backend stack is ready."
    exit 0
}

Write-Host "Starting API on http://127.0.0.1:8000 ..."
Write-Host "Press Ctrl+C to stop API."

try {
    & "$backendDir\scripts\start_api.ps1"
} finally {
    if ($startedWorkerProcess -and -not $startedWorkerProcess.HasExited) {
        Write-Host "Stopping worker process (PID $($startedWorkerProcess.Id))..."
        Stop-Process -Id $startedWorkerProcess.Id -Force -ErrorAction SilentlyContinue
    }
}
