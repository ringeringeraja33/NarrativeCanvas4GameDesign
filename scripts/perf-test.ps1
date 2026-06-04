[CmdletBinding()]
param(
  [string]$BrowserPath = "",
  [string]$Sizes = "30,3000,30000",
  [int]$Reps = 12,
  [int]$TimeoutMs = 300000
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PerfPath = Resolve-Path (Join-Path $ProjectRoot "tests\perf.html")
$PerfUrl = ([System.Uri]$PerfPath.Path).AbsoluteUri

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
      # port busy; try another
    }
  }
  throw "Could not bind a local beacon port."
}

# Read beacon GET requests until the final /done report arrives. perf.html also
# sends /phase probes while a long run is in progress; those are diagnostic only.
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
      $read = 0
      $text = ""
      # Read until we have the full request line (terminated by CRLF).
      for ($i = 0; $i -lt 64; $i += 1) {
        if ($stream.DataAvailable -or $read -eq 0) {
          $count = $stream.Read($buffer, 0, $buffer.Length)
          if ($count -le 0) { break }
          $text += [System.Text.Encoding]::ASCII.GetString($buffer, 0, $count)
          $read += $count
          if ($text.Contains("`r`n")) { break }
        } else { Start-Sleep -Milliseconds 20 }
      }
      $requestLine = ($text -split "`r`n")[0]
      $response = "HTTP/1.1 200 OK`r`nContent-Type: text/plain`r`nContent-Length: 2`r`nConnection: close`r`n`r`nok"
      $responseBytes = [System.Text.Encoding]::ASCII.GetBytes($response)
      $stream.Write($responseBytes, 0, $responseBytes.Length)
      $stream.Flush()
      $match = [regex]::Match($requestLine, 'data=([^ &]+)')
      if ($match.Success -and $requestLine -match '^GET /done\?') {
        return [System.Uri]::UnescapeDataString($match.Groups[1].Value)
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
$profileDir = Join-Path ([System.IO.Path]::GetTempPath()) ("narrative-canvas-perf-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

$targetUrl = $PerfUrl + "?port=" + $port + "&sizes=" + $Sizes + "&reps=" + $Reps
Write-Host "Perf URL: $targetUrl"
Write-Host "Browser:  $browser"
Write-Host "Beacon:   127.0.0.1:$port"

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
  if (-not $data) { throw "Timed out waiting for benchmark results after ${TimeoutMs}ms" }

  $report = $data | ConvertFrom-Json
  if ($report.error) {
    Write-Host ""
    Write-Host "Benchmark error:" -ForegroundColor Red
    Write-Host $report.error
    throw "Benchmark reported an error"
  }

  Write-Host ""
  Write-Host ("{0,8} {1,8} {2,8} {3,10} {4,11} {5,11} {6,11} {7,10}" -f `
    "nodes", "links", "visible", "open(ms)", "drag.avg", "drag.max", "input.avg", "commit")
  Write-Host ("-" * 92)
  foreach ($run in $report.runs) {
    Write-Host ("{0,8} {1,8} {2,8} {3,10} {4,11} {5,11} {6,11} {7,10}" -f `
      $run.n, $run.links, $run.visibleNodes, $run.openMs, `
      $run.dragAvgMs, $run.dragMaxMs, $run.inputAvgMs, $run.commitMs)
  }
  Write-Host ""
  Write-Host "Perf benchmark complete."
} finally {
  if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  $beacon.Listener.Stop()
  Remove-Item -LiteralPath $profileDir -Recurse -Force -ErrorAction SilentlyContinue
}
