$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Split-Path -Parent $scriptDir
$workspaceDir = Split-Path -Parent $backendDir

$env:PYTHONPATH = Join-Path $backendDir "src"
$env:APP_DEBUG = "false"
$env:APP_LOG_LEVEL = "WARNING"
$env:APP_AUTO_CREATE_TABLES = "false"

Set-Location $backendDir

$existingListener = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existingListener) {
	Write-Host "API already running on 127.0.0.1:8000 (PID $($existingListener.OwningProcess))."
	exit 0
}


$enableUvRun = $env:DR_ENABLE_UV_RUN -eq "1"
$uvCommand = $null
if ($enableUvRun) {
	$uvCommand = Get-Command uv -ErrorAction SilentlyContinue
}
$uvLockPath = Join-Path $backendDir "uv.lock"
$useUv = $enableUvRun

if ($useUv -and (Test-Path $uvLockPath)) {
	$uvLockFirstLine = Get-Content $uvLockPath -TotalCount 1 -ErrorAction SilentlyContinue
	if ($uvLockFirstLine -like "# Placeholder lockfile*") {
		$useUv = $false
		Write-Warning "Skipping uv run because uv.lock is a placeholder. Run 'uv sync' in backend to generate a valid lockfile."
	}
}

if ($uvCommand -and $useUv) {
	uv run uvicorn datareaper.main:app --host 127.0.0.1 --port 8000 --app-dir src --log-level warning --no-access-log
	if ($LASTEXITCODE -eq 0) {
		exit 0
	}
	Write-Warning "uv run failed; falling back to Python interpreter."
}

$pythonCandidates = @()

if ($env:CONDA_PREFIX) {
	$pythonCandidates += (Join-Path $env:CONDA_PREFIX "python.exe")
}

$defaultCondaPython = Join-Path $env:USERPROFILE "miniconda3/python.exe"
if (Test-Path $defaultCondaPython) {
	$pythonCandidates += $defaultCondaPython
}

$condaCmd = Get-Command conda -ErrorAction SilentlyContinue
if ($condaCmd) {
	$condaBase = & $condaCmd.Source info --base 2>$null
	if ($LASTEXITCODE -eq 0 -and $condaBase) {
		$pythonCandidates += (Join-Path $condaBase.Trim() "python.exe")
	}
}

$pythonCandidates += (Join-Path $backendDir ".venv/Scripts/python.exe")
$pythonCandidates += (Join-Path $workspaceDir ".venv/Scripts/python.exe")
$pythonCandidates = $pythonCandidates | Where-Object { $_ } | Select-Object -Unique

function Test-PythonModule {
	param (
		[string]$PythonExe,
		[string]$ModuleName
	)

	if (-not (Test-Path $PythonExe)) {
		return $false
	}

	& $PythonExe -c "import $ModuleName" 2>$null
	return $LASTEXITCODE -eq 0
}

function Test-PythonRuntime {
	param (
		[string]$PythonExe
	)

	return (Test-PythonModule -PythonExe $PythonExe -ModuleName "uvicorn") -and (Test-PythonModule -PythonExe $PythonExe -ModuleName "curl_cffi")
}

$pythonExe = $null
foreach ($candidate in $pythonCandidates) {
	if (Test-PythonRuntime -PythonExe $candidate) {
		$pythonExe = $candidate
		break
	}
}

if (-not $pythonExe) {
	$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
	if ($pythonCmd) {
		if (Test-PythonRuntime -PythonExe $pythonCmd.Source) {
			$pythonExe = $pythonCmd.Source
		}
	}
}

if (-not $pythonExe) {
	throw "No Python interpreter with required modules (uvicorn and curl_cffi) found. Install project dependencies first."
}

& $pythonExe -m uvicorn datareaper.main:app --host 127.0.0.1 --port 8000 --app-dir src --log-level warning --no-access-log
