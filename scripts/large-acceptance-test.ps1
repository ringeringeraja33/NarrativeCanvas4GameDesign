[CmdletBinding()]
param(
  [string]$BrowserPath = "",
  [string]$Sizes = "30000,100000",
  [string]$Hosts = "web,plugin",
  [double]$BudgetScale = 1.0,
  [int]$TimeoutMs = 900000,
  [switch]$ContinueOnFailure,
  [switch]$ShowPhases
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AcceptancePath = Resolve-Path (Join-Path $ProjectRoot "tests\large-project-acceptance.html")
$AcceptanceUrl = ([System.Uri]$AcceptancePath.Path).AbsoluteUri

function Find-Browser {
  param([string]$RequestedPath)
  if ($RequestedPath) {
    if (Test-Path -LiteralPath $RequestedPath -PathType Leaf) { return $RequestedPath }
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
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { return $candidate }
  }
  foreach ($commandName in @("chrome.exe", "msedge.exe")) {
    $command = Get-Command $commandName -ErrorAction SilentlyContinue
    if ($command -and $command.Source -and (Test-Path -LiteralPath $command.Source -PathType Leaf)) { return $command.Source }
  }
  throw "Chrome or Edge was not found. Pass -BrowserPath to a Chromium-based browser."
}

function Start-BeaconListener {
  foreach ($attempt in 1..10) {
    $port = Get-Random -Minimum 49200 -Maximum 59000
    try {
      $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
      $listener.Start()
      return [pscustomobject]@{ Listener = $listener; Port = $port }
    } catch {
      # Try another random port.
    }
  }
  throw "Could not bind a local beacon port."
}

function Receive-Beacon {
  param([System.Net.Sockets.TcpListener]$Listener, [int]$TimeoutMs)
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (-not $Listener.Pending()) { Start-Sleep -Milliseconds 150; continue }
    $client = $Listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $stream.ReadTimeout = 5000
      $buffer = New-Object byte[] 1048576
      $text = ""
      for ($i = 0; $i -lt 64; $i += 1) {
        $count = $stream.Read($buffer, 0, $buffer.Length)
        if ($count -le 0) { break }
        $text += [System.Text.Encoding]::ASCII.GetString($buffer, 0, $count)
        if ($text.Contains("`r`n")) { break }
        if (-not $stream.DataAvailable) { Start-Sleep -Milliseconds 20 }
      }
      $requestLine = ($text -split "`r`n")[0]
      $response = "HTTP/1.1 200 OK`r`nContent-Type: text/plain`r`nContent-Length: 2`r`nConnection: close`r`n`r`nok"
      $responseBytes = [System.Text.Encoding]::ASCII.GetBytes($response)
      $stream.Write($responseBytes, 0, $responseBytes.Length)
      $stream.Flush()
      $match = [regex]::Match($requestLine, 'data=([^ &]+)')
      if ($match.Success) {
        $payload = [System.Uri]::UnescapeDataString($match.Groups[1].Value)
        if ($requestLine -match '^GET /phase\?') {
          $script:LastPhase = $payload
          if ($ShowPhases) { Write-Host "phase: $payload" }
        }
        if ($requestLine -match '^GET /done\?') {
          return $payload
        }
      }
    } finally {
      $client.Close()
    }
  }
  return $null
}

$browser = Find-Browser $BrowserPath
$beacon = Start-BeaconListener
$port = $beacon.Port
$script:LastPhase = ""
$profileDir = Join-Path ([System.IO.Path]::GetTempPath()) ("narrative-canvas-large-acceptance-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

$targetUrl = $AcceptanceUrl + "?port=" + $port + "&sizes=" + [System.Uri]::EscapeDataString($Sizes) + "&hosts=" + [System.Uri]::EscapeDataString($Hosts) + "&budgetScale=" + $BudgetScale.ToString([System.Globalization.CultureInfo]::InvariantCulture)
if ($ContinueOnFailure) { $targetUrl += "&continueOnFailure=1" }
Write-Host "Acceptance URL: $targetUrl"
Write-Host "Browser:        $browser"
Write-Host "Beacon:         127.0.0.1:$port"

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
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-features=CalculateNativeWinOcclusion",
  "--user-data-dir=$profileDir",
  $targetUrl
)

$process = $null
try {
  $process = Start-Process -FilePath $browser -ArgumentList $browserArgs -PassThru -WindowStyle Hidden
  $data = Receive-Beacon -Listener $beacon.Listener -TimeoutMs $TimeoutMs
  if (-not $data) {
    $phaseText = if ($script:LastPhase) { " Last phase: $script:LastPhase." } else { "" }
    throw "Timed out waiting for large-project acceptance results after ${TimeoutMs}ms.$phaseText"
  }

  $report = $data | ConvertFrom-Json
  if ($report.error) {
    Write-Host ""
    Write-Host "Acceptance error:" -ForegroundColor Red
    Write-Host $report.error
    throw "Large-project acceptance reported an error"
  }

  Write-Host ""
  Write-Host ("{0,-7} {1,8} {2,8} {3,8} {4,9} {5,9} {6,9} {7,9} {8,9} {9,9} {10,9} {11,10}" -f `
    "host", "nodes", "links", "visible", "open", "chars", "events", "vars", "canvas", "search", "save", "export")
  Write-Host ("-" * 118)
  foreach ($run in $report.runs) {
    $maxSearch = @($run.search.canvasMs, $run.search.charactersMs, $run.search.eventsMs | ForEach-Object { [double]$_ }) | Measure-Object -Maximum
    Write-Host ("{0,-7} {1,8} {2,8} {3,8} {4,9} {5,9} {6,9} {7,9} {8,9} {9,9} {10,9} {11,10}" -f `
      $run.host, $run.nodes, $run.links, $run.visibleNodes, $run.openMs, `
      $run.tabs.charactersMs, $run.tabs.eventsMs, $run.tabs.variablesMs, $run.tabs.canvasReturnMs, `
      $maxSearch.Maximum, $run.saveMs, $run.exportJsonMs)
  }

  if ($report.failures -and $report.failures.Count -gt 0) {
    Write-Host ""
    Write-Host "Budget failures:" -ForegroundColor Red
    $report.failures | ConvertTo-Json -Depth 5 | Write-Host
    throw "Large-project acceptance exceeded one or more budgets"
  }

  Write-Host ""
  Write-Host "Large-project acceptance passed."
} finally {
  if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  $beacon.Listener.Stop()
  Remove-Item -LiteralPath $profileDir -Recurse -Force -ErrorAction SilentlyContinue
}
