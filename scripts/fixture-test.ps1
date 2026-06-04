[CmdletBinding()]
param(
  [string]$BrowserPath = "",
  [int]$VirtualTimeBudget = 18000,
  [int]$BrowserTimeoutMs = 45000
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$FixturePath = Resolve-Path (Join-Path $ProjectRoot "tests\fixture-roundtrip.html")
$FixtureUrl = ([System.Uri]$FixturePath.Path).AbsoluteUri

function Find-Browser {
  param([string]$RequestedPath)

  if ($RequestedPath) {
    if (Test-Path -LiteralPath $RequestedPath -PathType Leaf) {
      return $RequestedPath
    }
    throw "BrowserPath does not exist: $RequestedPath"
  }

  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:LocalAppData\Microsoft\Edge\Application\msedge.exe"
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      return $candidate
    }
  }

  foreach ($commandName in @("chrome.exe", "msedge.exe")) {
    $command = Get-Command $commandName -ErrorAction SilentlyContinue
    if ($command?.Source -and (Test-Path -LiteralPath $command.Source -PathType Leaf)) {
      return $command.Source
    }
  }

  throw "Chrome or Edge was not found. Pass -BrowserPath to a Chromium-based browser."
}

$browser = Find-Browser $BrowserPath
$profileDir = Join-Path ([System.IO.Path]::GetTempPath()) ("narrative-canvas-fixture-" + [System.Guid]::NewGuid().ToString("N"))
$stdoutPath = Join-Path ([System.IO.Path]::GetTempPath()) ("narrative-canvas-fixture-out-" + [System.Guid]::NewGuid().ToString("N") + ".html")
$stderrPath = Join-Path ([System.IO.Path]::GetTempPath()) ("narrative-canvas-fixture-err-" + [System.Guid]::NewGuid().ToString("N") + ".log")
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

try {
  Write-Host "Fixture test URL: $FixtureUrl"
  Write-Host "Browser: $browser"

  $browserArgs = @(
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--no-sandbox",
    "--allow-file-access-from-files",
    "--user-data-dir=$profileDir",
    "--virtual-time-budget=$VirtualTimeBudget",
    "--dump-dom",
    $FixtureUrl
  )

  $process = Start-Process -FilePath $browser -ArgumentList $browserArgs -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru -NoNewWindow
  if (-not $process.WaitForExit($BrowserTimeoutMs)) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw "Browser timed out after ${BrowserTimeoutMs}ms"
  }

  $exitCode = $process.ExitCode
  $html = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -Raw -Encoding UTF8 -LiteralPath $stdoutPath } else { "" }
  $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -Raw -Encoding UTF8 -LiteralPath $stderrPath } else { "" }

  $match = [regex]::Match($html, '<pre id="fixture-report">([\s\S]*?)</pre>')
  if ($match.Success) {
    $report = [System.Net.WebUtility]::HtmlDecode($match.Groups[1].Value.Trim())
    Write-Host $report
  } else {
    Write-Host $html
    if ($stderr) {
      Write-Host $stderr
    }
  }

  if ($exitCode -and $exitCode -ne 0) {
    throw "Browser exited with code $exitCode"
  }

  if ($html -notmatch 'data-fixture-status="pass"') {
    throw "Fixture tests failed"
  }

  Write-Host "Fixture tests passed"
} finally {
  Remove-Item -LiteralPath $profileDir -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $stdoutPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
}
