[CmdletBinding()]
param(
  [string]$Tag = "",
  [string]$ReleaseNotesPath = "",
  [string]$RuntimeDir = "",
  [string]$GitHubRepo = "ringeringeraja33/NarrativeCanvas",
  [switch]$CheckGitHubRelease,
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
$script:PluginReleaseFiles = @("main.js", "manifest.json", "styles.css")

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

function Get-JsStringArrayJoinedText([string]$ConstantName) {
  $mainPath = Resolve-ProjectPath "main.js"
  $mainJs = Read-Utf8Strict $mainPath
  $pattern = 'const\s+' + [regex]::Escape($ConstantName) + '\s*=\s*\[([\s\S]*?)\]\.join\("([^"]*)"\);'
  $match = [regex]::Match($mainJs, $pattern)
  if (-not $match.Success) {
    throw "Could not find $ConstantName in main.js"
  }
  $chunks = [regex]::Matches($match.Groups[1].Value, '"(?:\\.|[^"\\])*"') | ForEach-Object {
    $_.Value | ConvertFrom-Json
  }
  if (-not $chunks -or $chunks.Count -eq 0) {
    throw "$ConstantName has no string chunks"
  }
  $joinText = ('"' + $match.Groups[2].Value + '"') | ConvertFrom-Json
  return [string]::Join($joinText, $chunks)
}

function Assert-BundledHtmlMatchesSource {
  try {
    $bundled = Get-JsStringArrayJoinedText "CANVAS_INDEX_HTML"
    $source = (Read-Utf8Strict (Resolve-ProjectPath "index.html")).Replace("`r`n", "`n").TrimEnd()
    if ($bundled -eq $source) {
      Write-CheckOk "CANVAS_INDEX_HTML matches index.html"
    } else {
      Write-CheckFail "CANVAS_INDEX_HTML does not match index.html"
    }
  } catch {
    Write-CheckFail "CANVAS_INDEX_HTML check failed: $($_.Exception.Message)"
  }
}

function Assert-BundledAppMatchesSource {
  try {
    $mainJs = Read-Utf8Strict (Resolve-ProjectPath "main.js")
    $pattern = 'function\s+installNarrativeCanvasApp\(\)\s*\{\s*// BEGIN bundled app\.js\r?\n([\s\S]*?)\r?\n\s*// END bundled app\.js\r?\n\}'
    $match = [regex]::Match($mainJs, $pattern)
    if (-not $match.Success) {
      throw "Could not find bundled app.js markers in main.js"
    }
    $body = ($match.Groups[1].Value -split "\r?\n") | ForEach-Object {
      if ($_.StartsWith("  ")) { $_.Substring(2) } else { $_ }
    }
    $bundled = [string]::Join("`n", $body).TrimEnd()
    $source = (Read-Utf8Strict (Resolve-ProjectPath "app.js")).Replace("`r`n", "`n").TrimEnd()
    if ($bundled -eq $source) {
      Write-CheckOk "bundled app.js matches source app.js"
    } else {
      Write-CheckFail "bundled app.js does not match source app.js"
    }
  } catch {
    Write-CheckFail "bundled app.js check failed: $($_.Exception.Message)"
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

function Assert-TextDoesNotMatch([string]$Text, [string]$Pattern, [string]$Label) {
  if ($Text -match $Pattern) {
    Write-CheckFail $Label
  } else {
    Write-CheckOk $Label
  }
}

function Assert-TextContains([string]$Text, [string]$Needle, [string]$Label) {
  if ($Text.Contains($Needle)) {
    Write-CheckOk $Label
  } else {
    Write-CheckFail $Label
  }
}

function Assert-GitHubReleaseAssets([string]$Repo, [string]$ReleaseTag) {
  if (-not $ReleaseTag) {
    Write-CheckWarn "No tag supplied; GitHub release asset check skipped"
    return
  }

  $ghCommand = Get-Command gh -ErrorAction SilentlyContinue
  if (-not $ghCommand) {
    Write-CheckFail "GitHub release asset check needs the gh CLI"
    return
  }

  $json = & gh release view $ReleaseTag --repo $Repo --json assets 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $json) {
    Write-CheckFail "GitHub release $ReleaseTag could not be read from $Repo"
    return
  }

  $release = $json | ConvertFrom-Json
  $assetNames = @($release.assets | ForEach-Object { [string]$_.name } | Sort-Object)
  $expected = @($script:PluginReleaseFiles | Sort-Object)
  $extra = @($assetNames | Where-Object { $expected -notcontains $_ })
  $missing = @($expected | Where-Object { $assetNames -notcontains $_ })

  if ($extra.Count -eq 0 -and $missing.Count -eq 0) {
    Write-CheckOk "GitHub release assets are plugin-only: $($expected -join ', ')"
    return
  }

  if ($extra.Count -gt 0) {
    Write-CheckFail "GitHub release has non-plugin assets: $($extra -join ', ')"
  }
  if ($missing.Count -gt 0) {
    Write-CheckFail "GitHub release is missing plugin assets: $($missing -join ', ')"
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

$releaseFiles = $script:PluginReleaseFiles
foreach ($file in $releaseFiles) {
  Assert-FileExists (Resolve-ProjectPath $file) "release asset $file" | Out-Null
}

$sourceFiles = @("app.js", "canvas.css", "index.html")
foreach ($file in $sourceFiles) {
  Assert-FileExists (Resolve-ProjectPath $file) "source asset $file" | Out-Null
}

$obsidianTreeClassFiles = @("app.js", "canvas.css", "index.html", "main.js", "styles.css")
foreach ($file in $obsidianTreeClassFiles) {
  $path = Resolve-ProjectPath $file
  if (Test-Path -LiteralPath $path -PathType Leaf) {
    $text = Read-Utf8Strict $path
    if ($text -match "(^|[^A-Za-z0-9_-])tree-item($|[^A-Za-z0-9_-])" -or $text -match "(^|[^A-Za-z0-9_-])tree-item-label($|[^A-Za-z0-9_-])") {
      Write-CheckFail "$file uses Obsidian tree-item class names"
    } else {
      Write-CheckOk "$file avoids Obsidian tree-item class names"
    }
  }
}

$mainJsText = Read-Utf8Strict (Resolve-ProjectPath "main.js")
Assert-TextDoesNotMatch $mainJsText 'new\s+Function\s*\(' "main.js avoids new Function dynamic execution"
Assert-TextDoesNotMatch $mainJsText '\beval\s*\(' "main.js avoids eval"
Assert-TextDoesNotMatch $mainJsText 'window\.(prompt|confirm)\b' "main.js avoids native prompt/confirm dialogs"
Assert-TextDoesNotMatch $mainJsText 'EMBEDDED_(INDEX_HTML|CANVAS_CSS|APP_JS)' "main.js has no base64 embedded fallback constants"
Assert-TextDoesNotMatch $mainJsText 'app\.vault\.adapter' "main.js avoids direct vault adapter project file I/O"
Assert-TextDoesNotMatch $mainJsText 'detachLeavesOfType' "main.js does not detach leaves on unload"
Assert-TextDoesNotMatch $mainJsText 'document\.head\.appendChild' "main.js does not inject plugin CSS into document.head"
Assert-TextDoesNotMatch $mainJsText 'contentEl\.innerHTML' "main.js does not mount the app with contentEl.innerHTML"

$stylesText = Read-Utf8Strict (Resolve-ProjectPath "styles.css")
Assert-TextContains $stylesText "Narrative Canvas web app styles (scoped; generated from canvas.css)" "styles.css includes scoped generated canvas styles"
Assert-TextDoesNotMatch $stylesText ':root\[data-theme=' "styles.css does not rely on scoped :root theme selectors"

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
  Assert-BundledHtmlMatchesSource
  Assert-BundledAppMatchesSource
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

if ($CheckGitHubRelease) {
  $releaseTag = if ($Tag) { $Tag } elseif ($manifest) { [string]$manifest.version } else { "" }
  Assert-GitHubReleaseAssets $GitHubRepo $releaseTag
}

Write-Host ""
Write-Host "Summary: $($script:Failures.Count) failure(s), $($script:Warnings.Count) warning(s)"
if ($script:Failures.Count -gt 0) {
  exit 1
}
exit 0
