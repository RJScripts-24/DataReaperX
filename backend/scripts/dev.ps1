$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Split-Path -Parent $scriptDir
$workspaceDir = Split-Path -Parent $backendDir

if (Get-Command uv -ErrorAction SilentlyContinue) {
	uv run uvicorn datareaper.main:app --reload --app-dir src
	if ($LASTEXITCODE -eq 0) {
		exit 0
	}
	Write-Warning "uv run failed; falling back to Python interpreter."
}

$pythonCandidates = @(
	(Join-Path $backendDir ".venv/Scripts/python.exe"),
	(Join-Path $workspaceDir ".venv/Scripts/python.exe")
)

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

$pythonExe = $null
foreach ($candidate in $pythonCandidates) {
	if (Test-PythonModule -PythonExe $candidate -ModuleName "uvicorn") {
		$pythonExe = $candidate
		break
	}
}

if (-not $pythonExe) {
	$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
	if ($pythonCmd) {
		& $pythonCmd.Source -c "import uvicorn" 2>$null
		if ($LASTEXITCODE -eq 0) {
			$pythonExe = $pythonCmd.Source
		}
	}
}

if (-not $pythonExe) {
	throw "No Python interpreter with uvicorn found. Install project dependencies first."
}

& $pythonExe -m uvicorn datareaper.main:app --reload --app-dir src
