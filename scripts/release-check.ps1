[CmdletBinding()]
param(
  [string]$Tag = "",
  [string]$ReleaseNotesPath = "",
  [string]$RuntimeDir = "",
  [switch]$SkipRuntime,
  [switch]$SkipEmbedded
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$VaultRoot = Resolve-Path (Join-Path $ProjectRoot "..\..")
if (-not $RuntimeDir) {
  $RuntimeDir = Join-Path $VaultRoot ".obsidian\plugins\narrative-canvas"
}

$script:Failures = New-Object System.Collections.Generic.List[string]
$script:Warnings = New-Object System.Collections.Generic.List[string]

function Write-CheckOk([string]$Message) {
  Write-Host "[ok] $Message"
}

function Write-CheckWarn([string]$Message) {
  $script:Warnings.Add($Message) | Out-Null
  Write-Host "[warn] $Message"
}

function Write-CheckFail([string]$Message) {
  $script:Failures.Add($Message) | Out-Null
  Write-Host "[fail] $Message"
}

function Resolve-ProjectPath([string]$RelativePath) {
  return Join-Path $ProjectRoot $RelativePath
}

function Read-Utf8Strict([string]$Path) {
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $encoding = [System.Text.UTF8Encoding]::new($false, $true)
  return $encoding.GetString($bytes)
}

function Read-JsonStrict([string]$Path) {
  return (Read-Utf8Strict $Path) | ConvertFrom-Json
}

function Get-Sha256([string]$Path) {
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash
}

function Assert-FileExists([string]$Path, [string]$Label) {
  if (Test-Path -LiteralPath $Path -PathType Leaf) {
    Write-CheckOk "$Label exists"
    return $true
  }
  Write-CheckFail "$Label is missing: $Path"
  return $false
}

function Get-EmbeddedAssetText([string]$ConstantName) {
  $mainPath = Resolve-ProjectPath "main.js"
  $mainJs = Read-Utf8Strict $mainPath
  $pattern = 'const\s+' + [regex]::Escape($ConstantName) + '\s*=\s*\[([\s\S]*?)\]\.join\(""\);'
  $match = [regex]::Match($mainJs, $pattern)
  if (-not $match.Success) {
    throw "Could not find $ConstantName in main.js"
  }
  $chunks = [regex]::Matches($match.Groups[1].Value, '"([^"]*)"') | ForEach-Object { $_.Groups[1].Value }
  if (-not $chunks -or $chunks.Count -eq 0) {
    throw "$ConstantName has no encoded chunks"
  }
  $base64 = -join $chunks
  return [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($base64))
}

function Assert-EmbeddedMatchesSource([string]$ConstantName, [string]$SourceFile) {
  try {
    $embedded = Get-EmbeddedAssetText $ConstantName
    $source = Read-Utf8Strict (Resolve-ProjectPath $SourceFile)
    if ($embedded -eq $source) {
      Write-CheckOk "$ConstantName matches $SourceFile"
    } else {
      Write-CheckFail "$ConstantName does not match $SourceFile"
    }
  } catch {
    Write-CheckFail "$ConstantName check failed: $($_.Exception.Message)"
  }
}

function Assert-TextHasNoMojibake([string]$Text, [string]$Label) {
  if ($Text.Contains([char]0xfffd)) {
    Write-CheckFail "$Label contains replacement characters"
  } elseif ($Text -match "\?\?") {
    Write-CheckFail "$Label contains ??"
  } else {
    Write-CheckOk "$Label has no obvious mojibake markers"
  }
}

Write-Host "Narrative Canvas release check"
Write-Host "Project root: $ProjectRoot"

$manifestPath = Resolve-ProjectPath "manifest.json"
$versionsPath = Resolve-ProjectPath "versions.json"

if (Assert-FileExists $manifestPath "manifest.json") {
  try {
    $manifest = Read-JsonStrict $manifestPath
    Write-CheckOk "manifest.json is valid UTF-8 JSON"
  } catch {
    Write-CheckFail "manifest.json could not be parsed: $($_.Exception.Message)"
  }
}

if (Assert-FileExists $versionsPath "versions.json") {
  try {
    $versions = Read-JsonStrict $versionsPath
    Write-CheckOk "versions.json is valid UTF-8 JSON"
  } catch {
    Write-CheckFail "versions.json could not be parsed: $($_.Exception.Message)"
  }
}

if ($manifest) {
  $version = [string]$manifest.version
  if ($Tag) {
    $normalizedTag = $Tag -replace "^v", ""
    if ($normalizedTag -eq $version) {
      Write-CheckOk "manifest version matches tag $Tag"
    } else {
      Write-CheckFail "manifest version $version does not match tag $Tag"
    }
  } else {
    Write-CheckWarn "No tag supplied; using manifest version $version for local checks"
  }

  if ($versions) {
    $versionKeys = $versions.PSObject.Properties.Name
    if ($versionKeys -contains $version) {
      Write-CheckOk "versions.json contains $version"
    } else {
      Write-CheckFail "versions.json does not contain $version"
    }
  }

  if ([string]$manifest.description -match "Obsidian") {
    Write-CheckFail "manifest description contains Obsidian"
  } else {
    Write-CheckOk "manifest description does not contain Obsidian"
  }
}

$releaseFiles = @("app.js", "canvas.css", "index.html", "main.js", "manifest.json", "styles.css")
foreach ($file in $releaseFiles) {
  Assert-FileExists (Resolve-ProjectPath $file) "release asset $file" | Out-Null
}

if (-not $SkipRuntime) {
  if (Test-Path -LiteralPath $RuntimeDir -PathType Container) {
    foreach ($file in $releaseFiles) {
      $sourcePath = Resolve-ProjectPath $file
      $runtimePath = Join-Path $RuntimeDir $file
      if ((Test-Path -LiteralPath $sourcePath -PathType Leaf) -and (Test-Path -LiteralPath $runtimePath -PathType Leaf)) {
        if ((Get-Sha256 $sourcePath) -eq (Get-Sha256 $runtimePath)) {
          Write-CheckOk "runtime $file matches source"
        } else {
          Write-CheckFail "runtime $file does not match source"
        }
      } else {
        Write-CheckFail "runtime $file is missing"
      }
    }
  } else {
    Write-CheckWarn "runtime directory not found: $RuntimeDir"
  }
}

if (-not $SkipEmbedded) {
  Assert-EmbeddedMatchesSource "EMBEDDED_INDEX_HTML" "index.html"
  Assert-EmbeddedMatchesSource "EMBEDDED_CANVAS_CSS" "canvas.css"
  Assert-EmbeddedMatchesSource "EMBEDDED_APP_JS" "app.js"
}

if ($ReleaseNotesPath) {
  $resolvedReleaseNotes = if ([System.IO.Path]::IsPathRooted($ReleaseNotesPath)) {
    $ReleaseNotesPath
  } else {
    Join-Path $ProjectRoot $ReleaseNotesPath
  }
  if (Assert-FileExists $resolvedReleaseNotes "release notes") {
    try {
      $releaseNotes = Read-Utf8Strict $resolvedReleaseNotes
      Write-CheckOk "release notes are valid UTF-8"
      Assert-TextHasNoMojibake $releaseNotes "release notes"
    } catch {
      Write-CheckFail "release notes are not valid UTF-8: $($_.Exception.Message)"
    }
  }
} else {
  Write-CheckWarn "No release notes path supplied; UTF-8 release note check skipped"
}

Write-Host ""
Write-Host "Summary: $($script:Failures.Count) failure(s), $($script:Warnings.Count) warning(s)"
if ($script:Failures.Count -gt 0) {
  exit 1
}
exit 0
