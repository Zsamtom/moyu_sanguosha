[CmdletBinding()]
param(
    [string]$KeyPath = (Join-Path $env:USERPROFILE "Downloads\tets.pem"),
    [string]$SshTarget = "ubuntu@49.51.188.128",
    [string]$RemoteAppDir = "/opt/sanguosha-online",
    [string]$PublicUrl = "https://moyu.pdcat.cn",
    [string]$Version = "",
    [switch]$PreflightOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ProjectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$WorkspaceRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $ProjectRoot))
$ArtifactDir = Join-Path $WorkspaceRoot ".deployment-artifacts"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$ArchiveName = "moyu-source-$Timestamp.tar.gz"
$ArchivePath = Join-Path $ArtifactDir $ArchiveName
$RemoteArchive = "/tmp/$ArchiveName"
$RemoteRelease = "$RemoteAppDir-release-$Timestamp"
$RemoteBackup = "$RemoteAppDir-backup-$Timestamp-pre-production"
$RemoteDisplaced = "$RemoteAppDir-displaced-$Timestamp-pre-production"
$RemoteFailed = "$RemoteAppDir-failed-$Timestamp"
$TempKey = Join-Path ([System.IO.Path]::GetTempPath()) "moyu-deploy-key-$PID-$Timestamp.pem"
$Uploaded = $false
$KeyReady = $false

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-NativeSuccess {
    param([string]$Action)
    if ($LASTEXITCODE -ne 0) {
        throw "$Action failed with exit code $LASTEXITCODE."
    }
}

function Assert-SafeRemoteValue {
    param(
        [string]$Name,
        [string]$Value
    )
    if ($Value -notmatch "^[A-Za-z0-9_./:@-]+$") {
        throw "$Name contains unsupported shell characters: $Value"
    }
}

function Invoke-CurlText {
    param([string]$Url)
    $output = & curl.exe --connect-timeout 8 --max-time 30 -fsS $Url
    Assert-NativeSuccess "GET $Url"
    return ($output -join "`n")
}

function Invoke-SshCommand {
    param(
        [string]$Command,
        [switch]$AcceptNewHost
    )
    $strictMode = if ($AcceptNewHost) { "accept-new" } else { "yes" }
    & ssh.exe `
        -i $script:TempKey `
        -o BatchMode=yes `
        -o ConnectTimeout=12 `
        -o ServerAliveInterval=20 `
        -o "StrictHostKeyChecking=$strictMode" `
        $script:SshTarget `
        $Command
    Assert-NativeSuccess "SSH command"
}

function Invoke-RemoteScript {
    param(
        [string]$ScriptText,
        [string[]]$Arguments = @(),
        [switch]$AcceptNewHost
    )

    foreach ($argument in $Arguments) {
        Assert-SafeRemoteValue "Remote argument" $argument
    }

    $normalized = $ScriptText.Replace("`r`n", "`n")
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($normalized))
    $argumentText = if ($Arguments.Count -gt 0) {
        " " + ($Arguments -join " ")
    } else {
        ""
    }
    $command = "printf '%s' '$encoded' | base64 -d | bash -s --$argumentText"
    Invoke-SshCommand -Command $command -AcceptNewHost:$AcceptNewHost
}

function Get-AutomaticVersion {
    param([string]$OnlineVersion)

    $datePrefix = Get-Date -Format "yyyy.MM.dd"
    $escapedPrefix = [regex]::Escape($datePrefix)
    $nextRevision = 1
    if ($OnlineVersion -match "^$escapedPrefix\.(\d+)-production$") {
        $nextRevision = [int]$Matches[1] + 1
    }
    return "$datePrefix.$nextRevision-production"
}

function Remove-LocalTemporaryFiles {
    if (Test-Path -LiteralPath $ArchivePath) {
        [System.IO.File]::Delete($ArchivePath)
    }
    if (Test-Path -LiteralPath $ArtifactDir) {
        $remaining = @(Get-ChildItem -LiteralPath $ArtifactDir -Force)
        if ($remaining.Count -eq 0) {
            [System.IO.Directory]::Delete($ArtifactDir)
        }
    }
    if (Test-Path -LiteralPath $TempKey) {
        & icacls.exe $TempKey /grant:r "$($env:USERNAME):F" | Out-Null
        [System.IO.File]::Delete($TempKey)
    }
}

Assert-SafeRemoteValue "SshTarget" $SshTarget
Assert-SafeRemoteValue "RemoteAppDir" $RemoteAppDir
if ($PublicUrl -notmatch "^https://[A-Za-z0-9.-]+(?::\d+)?$") {
    throw "PublicUrl must be an HTTPS origin without a path."
}
if (-not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) {
    throw "SSH private key was not found: $KeyPath"
}

$requiredCommands = @(
    "curl.exe",
    "git.exe",
    "icacls.exe",
    "pnpm.cmd",
    "scp.exe",
    "ssh.exe",
    "tar.exe"
)
foreach ($requiredCommand in $requiredCommands) {
    if (-not (Get-Command $requiredCommand -ErrorAction SilentlyContinue)) {
        throw "Required command is not available: $requiredCommand"
    }
}

try {
    Write-Step "Reading the current production version"
    $onlineHealth = Invoke-CurlText "$PublicUrl/healthz"
    $onlineVersionJson = Invoke-CurlText "$PublicUrl/version"
    try {
        $onlineVersion = $onlineVersionJson | ConvertFrom-Json
    } catch {
        throw "Production /version did not return valid JSON."
    }
    if ([string]::IsNullOrWhiteSpace($Version)) {
        $Version = Get-AutomaticVersion ([string]$onlineVersion.version)
    }
    if ($Version -notmatch "^\d{4}\.\d{2}\.\d{2}\.\d+-production$") {
        throw "Version must look like 2026.07.30.3-production."
    }

    Copy-Item -LiteralPath $KeyPath -Destination $TempKey -Force
    & icacls.exe $TempKey /inheritance:r /grant:r "$($env:USERNAME):R" | Out-Null
    Assert-NativeSuccess "Restricting temporary key permissions"
    $KeyReady = $true

    $preflightScript = @'
set -euo pipefail
live="$1"
sudo -n true
cd "$live"
sudo docker compose config --quiet
sudo docker compose ps
curl -fsS http://127.0.0.1:3100/healthz
printf '\n'
curl -fsS http://127.0.0.1:3100/version
printf '\n'
'@

    Write-Step "Checking SSH, Docker, application, and database access"
    Invoke-RemoteScript -ScriptText $preflightScript -Arguments @($RemoteAppDir) -AcceptNewHost
    Write-Host "Current production version: $($onlineVersion.version)"
    Write-Host "Next production version:    $Version"
    Write-Host "Current health:              $onlineHealth"

    if ($PreflightOnly) {
        Write-Host ""
        Write-Host "Preflight passed. No files were uploaded and production was not changed." -ForegroundColor Green
        return
    }

    Write-Step "Building the local production bundle"
    Push-Location $ProjectRoot
    try {
        & pnpm.cmd build
        Assert-NativeSuccess "Local production build"
    } finally {
        Pop-Location
    }

    $gitStatus = (& git.exe -C $ProjectRoot status --porcelain -- .) -join "`n"
    Assert-NativeSuccess "Reading Git status"
    $gitHead = ((& git.exe -C $ProjectRoot rev-parse HEAD) -join "").Trim()
    Assert-NativeSuccess "Reading Git revision"

    Write-Step "Packaging and validating the release"
    New-Item -ItemType Directory -Path $ArtifactDir -Force | Out-Null
    & tar.exe `
        -czf $ArchivePath `
        --exclude=".git" `
        --exclude=".env" `
        --exclude="node_modules" `
        --exclude="*/node_modules" `
        --exclude="dist" `
        --exclude="*/dist" `
        --exclude="*.log" `
        -C $ProjectRoot `
        .
    Assert-NativeSuccess "Creating release archive"

    $archiveEntries = @(& tar.exe -tzf $ArchivePath)
    Assert-NativeSuccess "Reading release archive"
    $forbiddenEntries = @(
        $archiveEntries | Where-Object {
            $_ -match "(^|/)\.git(/|$)" -or
            $_ -match "(^|/)node_modules(/|$)" -or
            $_ -match "(^|/)dist(/|$)" -or
            $_ -match "(^|/)\.env$"
        }
    )
    if ($forbiddenEntries.Count -gt 0) {
        throw "Release archive contains forbidden files: $($forbiddenEntries -join ', ')"
    }

    $packageHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $buildSha = if ([string]::IsNullOrWhiteSpace($gitStatus)) { $gitHead } else { $packageHash }

    $backupScript = @'
set -euo pipefail
live="$1"
backup="$2"
sudo test ! -e "$backup"
sudo cp -a "$live" "$backup"
cd "$live"
sudo docker compose exec -T db pg_dump -U sanguosha -d sanguosha |
  sudo tee "$backup/database.sql" >/dev/null
sudo chmod 600 "$backup/.env" "$backup/database.sql"
sudo test -s "$backup/database.sql"
printf 'BACKUP_OK\n'
'@

    Write-Step "Backing up production source and database"
    Invoke-RemoteScript -ScriptText $backupScript -Arguments @($RemoteAppDir, $RemoteBackup)

    Write-Step "Uploading and verifying the release"
    & scp.exe `
        -i $TempKey `
        -o BatchMode=yes `
        -o ConnectTimeout=12 `
        -o StrictHostKeyChecking=yes `
        $ArchivePath `
        "${SshTarget}:$RemoteArchive"
    Assert-NativeSuccess "Uploading release archive"
    $Uploaded = $true

    $checksumScript = @'
set -euo pipefail
sha256sum "$1"
'@
    $remoteChecksum = (Invoke-RemoteScript -ScriptText $checksumScript -Arguments @($RemoteArchive) | Select-Object -Last 1)
    $remoteHash = ([string]$remoteChecksum).Split(" ", [StringSplitOptions]::RemoveEmptyEntries)[0].ToLowerInvariant()
    if ($remoteHash -ne $packageHash) {
        throw "Uploaded release checksum does not match the local archive."
    }

    $buildScript = @'
set -euo pipefail
live="$1"
release="$2"
archive="$3"
version="$4"
build_sha="$5"
sudo test ! -e "$release"
sudo mkdir "$release"
sudo tar -xzf "$archive" -C "$release"
sudo cp "$live/.env" "$release/.env"
if sudo grep -q '^APP_VERSION=' "$release/.env"; then
  sudo sed -i "s|^APP_VERSION=.*|APP_VERSION=${version}|" "$release/.env"
else
  printf 'APP_VERSION=%s\n' "$version" | sudo tee -a "$release/.env" >/dev/null
fi
if sudo grep -q '^BUILD_SHA=' "$release/.env"; then
  sudo sed -i "s|^BUILD_SHA=.*|BUILD_SHA=${build_sha}|" "$release/.env"
else
  printf 'BUILD_SHA=%s\n' "$build_sha" | sudo tee -a "$release/.env" >/dev/null
fi
sudo chmod 600 "$release/.env"
cd "$release"
sudo docker compose config --quiet
sudo docker compose build app
'@

    Write-Step "Building the new production image"
    Invoke-RemoteScript `
        -ScriptText $buildScript `
        -Arguments @($RemoteAppDir, $RemoteRelease, $RemoteArchive, $Version, $buildSha)

    $swapScript = @'
set -euo pipefail
live="$1"
release="$2"
displaced="$3"
failed="$4"
sudo test ! -e "$displaced"
sudo test ! -e "$failed"
sudo mv "$live" "$displaced"
if ! sudo mv "$release" "$live"; then
  sudo mv "$displaced" "$live"
  exit 1
fi
cd "$live"
if ! sudo docker compose up -d --no-build --remove-orphans; then
  cd /
  sudo mv "$live" "$failed"
  sudo mv "$displaced" "$live"
  cd "$live"
  sudo docker compose up -d --no-build --remove-orphans
  exit 1
fi
'@

    Write-Step "Switching production to $Version"
    Invoke-RemoteScript `
        -ScriptText $swapScript `
        -Arguments @($RemoteAppDir, $RemoteRelease, $RemoteDisplaced, $RemoteFailed)

    $verifyScript = @'
set -euo pipefail
live="$1"
expected_version="$2"
cd "$live"
for attempt in $(seq 1 30); do
  if health="$(curl -fsS http://127.0.0.1:3100/healthz 2>/dev/null)" &&
     version="$(curl -fsS http://127.0.0.1:3100/version 2>/dev/null)" &&
     printf '%s' "$version" | grep -q "\"version\":\"${expected_version}\""; then
    sudo docker compose ps
    printf '%s\n' "$health"
    printf '%s\n' "$version"
    sudo nginx -t
    exit 0
  fi
  sleep 2
done
sudo docker compose logs --tail=80 app >&2
exit 1
'@

    $rollbackScript = @'
set -euo pipefail
live="$1"
displaced="$2"
failed="$3"
sudo test -d "$displaced"
sudo test ! -e "$failed"
cd /
sudo mv "$live" "$failed"
sudo mv "$displaced" "$live"
cd "$live"
sudo docker compose up -d --no-build --remove-orphans
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3100/healthz >/dev/null 2>&1; then
    printf 'ROLLBACK_OK\n'
    exit 0
  fi
  sleep 2
done
exit 1
'@

    Write-Step "Verifying the new application and database"
    try {
        Invoke-RemoteScript -ScriptText $verifyScript -Arguments @($RemoteAppDir, $Version)
    } catch {
        Write-Warning "Internal health verification failed. Restoring the previous release."
        Invoke-RemoteScript `
            -ScriptText $rollbackScript `
            -Arguments @($RemoteAppDir, $RemoteDisplaced, $RemoteFailed)
        throw "The new release failed health verification and was rolled back."
    }

    Write-Step "Verifying the public HTTPS endpoint"
    $publicHealth = Invoke-CurlText "$PublicUrl/healthz"
    $publicVersionJson = Invoke-CurlText "$PublicUrl/version"
    $publicVersion = $publicVersionJson | ConvertFrom-Json
    if ([string]$publicVersion.version -ne $Version) {
        throw "Public /version returned $($publicVersion.version), expected $Version."
    }
    $html = Invoke-CurlText "$PublicUrl/"
    $assetMatch = [regex]::Match($html, "/assets/index-[^`"']+\.js")
    if (-not $assetMatch.Success) {
        throw "The public HTML did not contain the expected entry asset."
    }
    & curl.exe `
        --connect-timeout 8 `
        --max-time 30 `
        --range 0-1023 `
        -fsS `
        -o NUL `
        "$PublicUrl$($assetMatch.Value)"
    Assert-NativeSuccess "Downloading the public entry asset"

    Write-Host ""
    Write-Host "Production deployment succeeded." -ForegroundColor Green
    Write-Host "URL:      $PublicUrl"
    Write-Host "Version:  $Version"
    Write-Host "Health:   $publicHealth"
    Write-Host "Backup:   $RemoteBackup"
    Write-Host "Rollback: $RemoteDisplaced"
} finally {
    if ($Uploaded -and $KeyReady -and (Test-Path -LiteralPath $TempKey)) {
        try {
            $cleanupScript = @'
set -euo pipefail
rm -f "$1"
'@
            Invoke-RemoteScript -ScriptText $cleanupScript -Arguments @($RemoteArchive) | Out-Null
        } catch {
            Write-Warning "Could not remove the remote temporary archive: $RemoteArchive"
        }
    }
    Remove-LocalTemporaryFiles
}
