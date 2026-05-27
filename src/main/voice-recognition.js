const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

class VoiceRecognition {
  constructor() {
    this.process = null;
    this.isListening = false;
    this.onResult = null;
    this.onError = null;
    this.onEnd = null;
    this.debugLog = [];
  }

  start() {
    if (this.isListening) return;
    this.isListening = true;
    this.debugLog = [];

    // Use synchronous Recognize() — simpler, more reliable
    // Force UTF-8 encoding for Chinese character output
    const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null

Add-Type -AssemblyName System.Speech
$culture = $null
try { $culture = [System.Globalization.CultureInfo]::GetCultureInfo("zh-CN") } catch {}
if (-not $culture) {
    Write-Output "STATUS:NO_ZH_CN"
    exit 0
}

try {
    $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($culture)
    $engine.SetInputToDefaultAudioDevice()
    $grammar = New-Object System.Speech.Recognition.DictationGrammar
    $engine.LoadGrammar($grammar)
} catch {
    Write-Output "STATUS:INIT_ERROR:$($_.Exception.Message)"
    exit 0
}

try {
    $result = $engine.Recognize([TimeSpan]::FromSeconds(8))
    if ($result -and $result.Text -and $result.Text.Trim()) {
        Write-Output "OK:$($result.Text.Trim())"
    } else {
        Write-Output "STATUS:NO_SPEECH"
    }
} catch {
    Write-Output "STATUS:RECOG_ERROR:$($_.Exception.Message)"
}
$engine.Dispose()
`.trim();

    // Write script to temp file to avoid inline escaping issues
    const scriptPath = path.join(os.tmpdir(), 'calendar_voice.ps1');
    try {
      fs.writeFileSync(scriptPath, psScript, 'utf8');
    } catch (e) {
      this.isListening = false;
      if (this.onError) this.onError('无法写入语音脚本');
      if (this.onEnd) this.onEnd();
      return;
    }

    this.process = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      encoding: 'utf8'
    });

    let stdout = '';
    let stderr = '';

    this.process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    this.process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    this.process.on('close', (code) => {
      this.isListening = false;
      this.debugLog.push({ stdout, stderr, exitCode: code });

      // Cleanup temp file
      try { fs.unlinkSync(scriptPath); } catch {}

      const lines = stdout.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      // Keep only result/status lines, skip internal info like LISTENING
      const meaningful = lines.filter(l =>
        l.startsWith('OK:') ||
        l.startsWith('STATUS:NO_ZH_CN') ||
        l.startsWith('STATUS:NO_SPEECH') ||
        l.startsWith('STATUS:INIT_ERROR:') ||
        l.startsWith('STATUS:RECOG_ERROR:')
      );
      const lastLine = meaningful[meaningful.length - 1] || '';

      console.log('[VoiceRecognition] exitCode:', code, 'meaningful:', meaningful);

      if (lastLine.startsWith('OK:')) {
        const text = lastLine.substring(3).trim();
        if (text && this.onResult) this.onResult(text);
      } else if (lastLine === 'STATUS:NO_ZH_CN') {
        if (this.onError) this.onError('NO_ZH_CN');
      } else if (lastLine === 'STATUS:NO_SPEECH') {
        if (this.onError) this.onError('NO_SPEECH');
      } else if (lastLine.startsWith('STATUS:INIT_ERROR:')) {
        const msg = lastLine.substring(18);
        if (this.onError) this.onError('INIT_ERROR:' + msg);
      } else if (lastLine.startsWith('STATUS:RECOG_ERROR:')) {
        const msg = lastLine.substring(19);
        if (this.onError) this.onError('RECOG_ERROR:' + msg);
      } else if (stderr.trim()) {
        if (this.onError) this.onError('PS_ERROR:' + stderr.trim().split('\n')[0]);
      } else {
        if (this.onError) this.onError('NO_OUTPUT');
      }

      if (this.onEnd) this.onEnd();
      this.process = null;
    });

    this.process.on('error', (err) => {
      this.isListening = false;
      this.process = null;
      try { fs.unlinkSync(scriptPath); } catch {}
      if (this.onError) this.onError('SPAWN_ERROR:' + err.message);
      if (this.onEnd) this.onEnd();
    });
  }

  stop() {
    if (this.process) {
      try { this.process.kill(); } catch {}
      this.process = null;
    }
    this.isListening = false;
  }
}

module.exports = { VoiceRecognition };
