/**
 * PowerShell bridge for the Windows native speech provider.
 *
 * The plugin ships only `main.js`, so the script is embedded here as a string
 * constant and written to a temp file at runtime (see WindowsSpeechService).
 * It must run under **Windows PowerShell 5.1** (`powershell.exe`) — the WinRT
 * type projection it relies on is not available in PowerShell 7+ (`pwsh`).
 *
 * Protocol (one message per line on stdout):
 *   list mode:   `VOICES <compact-json-array>` then `DONE`
 *   speak mode:  `CHUNK <index> <format> <path>` per chunk, then `DONE`
 *   on failure:  `ERROR <message>`
 *
 * The script reads a job JSON `{ engine, voice, format, ssml, outDir, chunks[] }`
 * in speak mode, synthesizes each chunk with either the modern OneCore engine
 * (`Windows.Media.SpeechSynthesis`) or the legacy SAPI engine
 * (`System.Speech.Synthesis`), and transcodes the result to MP3 via the WinRT
 * `MediaTranscoder` (falling back to WAV when no MP3 encoder is present).
 */
export const WINTTS_SCRIPT = `# wintts - Windows native TTS bridge for the Obsidian Voice plugin.
# Runs in Windows PowerShell 5.1 (WinRT projection is unavailable in pwsh 7).
# Modes:
#   list           - print "VOICES <json>" with every OneCore + SAPI voice
#   speak -JobFile - read a job json {engine,voice,format,ssml,outDir,chunks[]},
#                    synthesize each chunk, print "CHUNK <i> <format> <path>"
#                    per chunk and "DONE" at the end.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet('list', 'speak')][string]$Mode,
  [string]$JobFile
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

function Out-Line([string]$s) { [Console]::Out.WriteLine($s); [Console]::Out.Flush() }

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  try { Add-Type -AssemblyName System.Speech } catch {}

  # Force WinRT type projections.
  $null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
  $null = [Windows.Media.SpeechSynthesis.SpeechSynthesisStream, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
  $null = [Windows.Media.Transcoding.MediaTranscoder, Windows.Media.Transcoding, ContentType = WindowsRuntime]
  $null = [Windows.Media.Transcoding.PrepareTranscodeResult, Windows.Media.Transcoding, ContentType = WindowsRuntime]
  $null = [Windows.Media.MediaProperties.MediaEncodingProfile, Windows.Media.MediaProperties, ContentType = WindowsRuntime]
  $null = [Windows.Media.MediaProperties.AudioEncodingQuality, Windows.Media.MediaProperties, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
  $null = [Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime]

  $script:AsTaskOp = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
      $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
    })[0]
  $script:AsTaskActionProgress = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
      $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncActionWithProgress\`1'
    })[0]

  function Await($op, $resultType) {
    $t = $script:AsTaskOp.MakeGenericMethod($resultType).Invoke($null, @($op))
    $null = $t.Wait(-1)
    return $t.Result
  }
  function AwaitActionWithProgress($op, $progressType) {
    $t = $script:AsTaskActionProgress.MakeGenericMethod($progressType).Invoke($null, @($op))
    $null = $t.Wait(-1)
  }

  function Get-AllVoices {
    $voices = @()
    try {
      foreach ($v in [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices) {
        $voices += @{ engine = 'onecore'; name = $v.DisplayName; lang = $v.Language; gender = $v.Gender.ToString() }
      }
    } catch {}
    try {
      $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
      try {
        foreach ($iv in $s.GetInstalledVoices()) {
          if (-not $iv.Enabled) { continue }
          $v = $iv.VoiceInfo
          $voices += @{ engine = 'sapi'; name = $v.Name; lang = $v.Culture.Name; gender = $v.Gender.ToString() }
        }
      } finally { $s.Dispose() }
    } catch {}
    return , $voices
  }

  if ($Mode -eq 'list') {
    $voices = Get-AllVoices
    Out-Line ('VOICES ' + (ConvertTo-Json @($voices) -Compress -Depth 4))
    Out-Line 'DONE'
    exit 0
  }

  # ---- speak mode ----
  if (-not $JobFile -or -not (Test-Path -LiteralPath $JobFile)) {
    Out-Line 'ERROR job file not found'
    exit 1
  }
  $job = Get-Content -LiteralPath $JobFile -Raw -Encoding UTF8 | ConvertFrom-Json
  $outDir = [string]$job.outDir
  $engine = [string]$job.engine
  $voiceName = [string]$job.voice
  $wantMp3 = ([string]$job.format -eq 'mp3')
  $useSsml = $false
  try { if ($job.ssml) { $useSsml = $true } } catch {}
  if (-not (Test-Path -LiteralPath $outDir)) {
    $null = New-Item -ItemType Directory -Force -Path $outDir
  }

  $script:mp3Profile = $null
  if ($wantMp3) {
    try {
      $script:mp3Profile = [Windows.Media.MediaProperties.MediaEncodingProfile]::CreateMp3([Windows.Media.MediaProperties.AudioEncodingQuality]::Medium)
    } catch { $script:mp3Profile = $null }
  }

  function Convert-StreamToMp3File($inStream, [string]$outPath) {
    $transcoder = New-Object Windows.Media.Transcoding.MediaTranscoder
    $outStream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
    try {
      $prep = Await ($transcoder.PrepareStreamTranscodeAsync($inStream, $outStream, $script:mp3Profile)) ([Windows.Media.Transcoding.PrepareTranscodeResult])
      if (-not $prep.CanTranscode) { throw "transcode unavailable: $($prep.FailureReason)" }
      AwaitActionWithProgress ($prep.TranscodeAsync()) ([double])
      $null = $outStream.Seek(0)
      $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($outStream)
      $fs = [System.IO.File]::Create($outPath)
      try { $net.CopyTo($fs) } finally { $fs.Dispose(); $net.Dispose() }
    } finally { $outStream.Dispose() }
  }

  function Copy-WinRtStreamToFile($inStream, [string]$outPath) {
    $null = $inStream.Seek(0)
    $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($inStream)
    $fs = [System.IO.File]::Create($outPath)
    try { $net.CopyTo($fs) } finally { $fs.Dispose(); $net.Dispose() }
  }

  $chunks = @($job.chunks)

  if ($engine -eq 'sapi') {
    $sapi = New-Object System.Speech.Synthesis.SpeechSynthesizer
    try {
      if ($voiceName) {
        try { $sapi.SelectVoice($voiceName) } catch {}
      }
      for ($i = 0; $i -lt $chunks.Count; $i++) {
        $wavPath = Join-Path $outDir ("chunk_$i.wav")
        $sapi.SetOutputToWaveFile($wavPath)
        if ($useSsml) {
          $sapi.SpeakSsml([string]$chunks[$i])
        } else {
          $sapi.Speak([string]$chunks[$i])
        }
        $sapi.SetOutputToNull()
        $emitted = $wavPath
        $fmt = 'wav'
        if ($script:mp3Profile) {
          try {
            $inFile = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($wavPath)) ([Windows.Storage.StorageFile])
            $inStream = Await ($inFile.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
            try {
              $mp3Path = Join-Path $outDir ("chunk_$i.mp3")
              Convert-StreamToMp3File $inStream $mp3Path
              $emitted = $mp3Path
              $fmt = 'mp3'
            } finally { $inStream.Dispose() }
          } catch {}
        }
        if ($fmt -eq 'mp3') {
          try { Remove-Item -LiteralPath $wavPath -Force } catch {}
        }
        Out-Line ("CHUNK $i $fmt $emitted")
      }
    } finally { $sapi.Dispose() }
  } else {
    $synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
    try {
      if ($voiceName) {
        $v = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -eq $voiceName } | Select-Object -First 1
        if ($v) { $synth.Voice = $v }
      }
      for ($i = 0; $i -lt $chunks.Count; $i++) {
        if ($useSsml) {
          $stream = Await ($synth.SynthesizeSsmlToStreamAsync([string]$chunks[$i])) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
        } else {
          $stream = Await ($synth.SynthesizeTextToStreamAsync([string]$chunks[$i])) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
        }
        try {
          $emitted = $null
          $fmt = 'wav'
          if ($script:mp3Profile) {
            try {
              $mp3Path = Join-Path $outDir ("chunk_$i.mp3")
              Convert-StreamToMp3File $stream $mp3Path
              $emitted = $mp3Path
              $fmt = 'mp3'
            } catch { $emitted = $null }
          }
          if (-not $emitted) {
            $wavPath = Join-Path $outDir ("chunk_$i.wav")
            Copy-WinRtStreamToFile $stream $wavPath
            $emitted = $wavPath
            $fmt = 'wav'
          }
          Out-Line ("CHUNK $i $fmt $emitted")
        } finally { $stream.Dispose() }
      }
    } finally { $synth.Dispose() }
  }

  Out-Line 'DONE'
  exit 0
} catch {
  $msg = ($_ | Out-String) -replace "\\r?\\n", ' '
  Out-Line ("ERROR " + $msg.Trim())
  exit 1
}
`;
