$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

try {
  python --version | Out-Null
} catch {
  Write-Host "[ERROR] Python not found. Please install Python 3.10+ and enable 'Add Python to PATH'."
  Read-Host "Press Enter to exit"
  exit 1
}

Write-Host "[INFO] Starting OpenClaw Agent Live Dashboard..."
python server.py
Read-Host "Press Enter to exit"
