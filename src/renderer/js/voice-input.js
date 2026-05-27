class VoiceInput {
  constructor() {
    this.fabBtn = document.getElementById('voiceBtn');
    this.navBtn = document.getElementById('btnVoiceNav');
    this.overlay = document.getElementById('voiceOverlay');
    this.statusEl = document.getElementById('voiceStatus');
    this.textEl = document.getElementById('voiceText');
    this.isListening = false;
    this.onResult = null;

    // Audio recording
    this.audioContext = null;
    this.mediaStream = null;
    this.processor = null;
    this.audioChunks = [];
    this.recording = false;
    this.recordTimer = null;
    this.maxRecordMs = 10000;
    this.silenceMs = 3000;
    this.lastSoundTime = 0;

    // Baidu STT — check once at startup, don't re-check every click
    this.hasApiKey = false;
    this._configChecked = false;

    this._bindEvents();
    this._bindIpcEvents();
    this._checkApiConfig(); // pre-check, no await — ready by first click
  }

  async _checkApiConfig() {
    if (this._configChecked) return this.hasApiKey;
    if (typeof api === 'undefined') return false;
    try {
      const cfg = await api.getSttConfig();
      this.hasApiKey = !!(cfg && cfg.apiKey);
      this._configChecked = true;
      console.log('[VoiceInput] API config checked:', this.hasApiKey);
      return this.hasApiKey;
    } catch (e) {
      console.log('[VoiceInput] API config check failed:', e);
      return false;
    }
  }

  _bindIpcEvents() {
    if (typeof api === 'undefined') return;
    // Keep SAPI handlers for fallback
    api.onVoiceResult((text) => {
      this.finalText += text;
      this.textEl.textContent = this.finalText || '正在聆听...';
    });
    api.onVoiceError((msg) => {
      console.log('[VoiceInput] SAPI error:', msg);
      this._stopAll();
      this._showTextInput();
    });
    api.onVoiceEnd(() => {
      this._stopAll();
      if (this.finalText.trim()) {
        this._processResult();
      } else {
        this._showTextInput();
      }
    });
  }

  _bindEvents() {
    const handleClick = () => this.toggle();
    if (this.fabBtn) this.fabBtn.addEventListener('click', handleClick);
    if (this.navBtn) this.navBtn.addEventListener('click', handleClick);

    // Close voice overlay on click outside
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay && !this.recording) {
        this._stopAll();
        this.overlay.style.display = 'none';
      }
    });
  }

  _updateIcon(listening) {
    if (this.navBtn) {
      if (listening) {
        this.navBtn.style.color = 'var(--danger)';
        this.navBtn.classList.add('recording');
      } else {
        this.navBtn.style.color = '';
        this.navBtn.classList.remove('recording');
      }
    }
    if (this.fabBtn) {
      if (listening) {
        this.fabBtn.classList.add('listening');
      } else {
        this.fabBtn.classList.remove('listening');
      }
    }
  }

  toggle() {
    if (this.isListening && this.recording) {
      // Recording in progress → stop and recognize
      this.statusEl.textContent = '处理中...';
      this._finishRecording();
      return;
    }
    if (this.isListening) {
      // Already recognizing, ignore
      return;
    }
    this._start();
  }

  async _start() {
    // Show overlay immediately with status
    this.overlay.style.display = 'flex';
    this.statusEl.textContent = '正在检查配置...';
    this.textEl.textContent = '';

    if (typeof api === 'undefined') {
      this._showOverlayError('API 未加载，请重启应用');
      return;
    }

    // Check Baidu API key
    await this._checkApiConfig();
    if (!this.hasApiKey) {
      this.overlay.style.display = 'none';
      this._showApiKeySetup();
      return;
    }

    // Request microphone
    this.statusEl.textContent = '正在请求麦克风...';
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });
    } catch (e) {
      console.error('[VoiceInput] Mic error:', e);
      this._showOverlayError('无法访问麦克风：' + (e.message || '请检查系统权限设置'));
      return;
    }

    // Setup audio capture
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    this._lastSampleRate = this.audioContext.sampleRate;
    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.audioChunks = [];

    this.processor.onaudioprocess = (e) => {
      if (!this.recording) return;
      const data = new Float32Array(e.inputBuffer.getChannelData(0));
      this.audioChunks.push(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += Math.abs(data[i]);
      if (sum / data.length > 0.005) {
        this.lastSoundTime = Date.now();
      }
    };

    source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);

    this.recording = true;
    this.isListening = true;
    this.finalText = '';
    this.lastSoundTime = Date.now();
    this._updateIcon(true);

    this.statusEl.textContent = '🔴 录音中，说完点击按钮结束';
    this.textEl.textContent = '';

    // Timer — only show elapsed, don't auto-stop (user controls when to stop)
    let elapsed = 0;
    this.recordTimer = setInterval(() => {
      elapsed += 500;
      if (elapsed >= 60000) {
        // Safety max: 60 seconds
        this.statusEl.textContent = '已达最大时长，处理中...';
        this._finishRecording();
        return;
      }
      this.statusEl.textContent = `🔴 录音中 ${Math.round(elapsed / 1000)}s — 点击按钮结束`;
    }, 500);
  }

  async _finishRecording() {
    if (!this.recording) return;
    this.recording = false;

    // Cleanup audio
    if (this.recordTimer) clearInterval(this.recordTimer);
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    this._updateIcon(false);
    this.isListening = false;

    if (this.audioChunks.length === 0) {
      this._showOverlayError('未检测到声音，请重试');
      return;
    }

    this.statusEl.textContent = '正在识别...';
    this.textEl.textContent = '';

    // Merge all chunks
    const totalLen = this.audioChunks.reduce((sum, c) => sum + c.length, 0);
    const samples = new Float32Array(totalLen);
    let offset = 0;
    for (const chunk of this.audioChunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }

    // Encode as raw 16-bit PCM
    const pcmBuf = new ArrayBuffer(samples.length * 2);
    const pcmView = new DataView(pcmBuf);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      pcmView.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    const byteLen = pcmBuf.byteLength;
    const base64 = this._bufferToBase64(pcmBuf);
    console.log('[VoiceInput] Sending audio:', byteLen, 'bytes');

    // Send to Baidu ASR
    try {
      const result = await api.transcribeAudio(base64, byteLen);
      console.log('[VoiceInput] Result:', result);
      if (result.success && result.text) {
        this.finalText = result.text;
        this.textEl.textContent = result.text;
        this.statusEl.textContent = '识别完成';
        setTimeout(() => {
          this.overlay.style.display = 'none';
          this._processResult();
        }, 600);
      } else {
        this._showOverlayError(result.error || '识别失败，请重试');
      }
    } catch (e) {
      console.error('[VoiceInput] Transcribe error:', e);
      this._showOverlayError('识别服务不可用：' + (e.message || ''));
    }
  }

  _stopAll() {
    if (this.recordTimer) clearInterval(this.recordTimer);
    if (this.recording) {
      this.recording = false;
      if (this.processor) { this.processor.disconnect(); this.processor = null; }
      if (this.audioContext) { this.audioContext.close(); this.audioContext = null; }
      if (this.mediaStream) { this.mediaStream.getTracks().forEach(t => t.stop()); this.mediaStream = null; }
    }
    // Also stop SAPI if running
    if (typeof api !== 'undefined') {
      try { api.stopVoiceRecognition(); } catch {}
    }
    this.isListening = false;
    this._updateIcon(false);
    this.overlay.style.display = 'none';
  }

  // ── WAV encoding ────────────────────────────

  _encodeWav(samples, sampleRate) {
    const buf = new ArrayBuffer(44 + samples.length * 2);
    const v = new DataView(buf);
    const w = (p, s) => { for (let i = 0; i < s.length; i++) v.setUint8(p + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true);
    w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buf;
  }

  _bufferToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  _showOverlayError(msg) {
    this._updateIcon(false);
    this.isListening = false;
    this.recording = false;
    this.overlay.style.display = 'flex';
    this.statusEl.textContent = '出错了';
    this.textEl.innerHTML = `<span style="color:var(--danger);font-size:14px;">${msg}</span>`;
    // Auto-hide after 4 seconds
    clearTimeout(this._errorTimer);
    this._errorTimer = setTimeout(() => {
      this.overlay.style.display = 'none';
    }, 4000);
  }

  // ── API Key setup ───────────────────────────

  _showApiKeySetup() {
    const old = document.querySelector('.voice-apikey-wrap');
    if (old) old.remove();

    const wrap = document.createElement('div');
    wrap.className = 'voice-apikey-wrap';

    const title = document.createElement('h4');
    title.textContent = '配置百度语音识别';
    wrap.appendChild(title);

    const desc = document.createElement('p');
    desc.style.cssText = 'font-size:11px;color:var(--text-muted);margin-bottom:8px;';
    desc.innerHTML = '使用百度AI语音识别（每天免费5万次）。<br>注册地址: <a href="#" style="color:var(--accent);">https://ai.baidu.com/</a> → 控制台 → 语音识别';
    wrap.appendChild(desc);

    const inpKey = document.createElement('input');
    inpKey.type = 'text'; inpKey.placeholder = 'API Key';
    inpKey.className = 'voice-text-input';
    inpKey.style.marginBottom = '6px';
    wrap.appendChild(inpKey);

    const inpSecret = document.createElement('input');
    inpSecret.type = 'password'; inpSecret.placeholder = 'Secret Key';
    inpSecret.className = 'voice-text-input';
    inpSecret.style.marginBottom = '10px';
    wrap.appendChild(inpSecret);

    const actions = document.createElement('div');
    actions.className = 'voice-text-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-submit';
    saveBtn.textContent = '保存';
    saveBtn.addEventListener('click', async () => {
      const key = inpKey.value.trim();
      const secret = inpSecret.value.trim();
      if (!key || !secret) return;
      try {
        await api.saveSttConfig(key, secret);
        wrap.remove();
        this.hasApiKey = true;
        this._configChecked = true;
        this._start();
      } catch (e) {
        console.error('[VoiceInput] Failed to save config:', e);
        const errEl = document.createElement('p');
        errEl.style.cssText = 'color:var(--danger);font-size:11px;margin-top:4px;';
        errEl.textContent = '保存失败，请重试';
        wrap.appendChild(errEl);
        setTimeout(() => errEl.remove(), 3000);
      }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-cancel';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => wrap.remove());

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    wrap.appendChild(actions);

    document.body.appendChild(wrap);
    setTimeout(() => inpKey.focus(), 50);
  }

  // ── Text input fallback ─────────────────────

  _showTextInput(hint) {
    const old = document.querySelector('.voice-text-input-wrap');
    if (old) old.remove();

    const wrap = document.createElement('div');
    wrap.className = 'voice-text-input-wrap';

    if (hint) {
      const tip = document.createElement('p');
      tip.style.cssText = 'font-size:11px;color:var(--text-muted);margin-bottom:4px;';
      tip.textContent = hint;
      wrap.appendChild(tip);
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '输入日程，如：明天下午3点开会';
    input.className = 'voice-text-input';
    wrap.appendChild(input);

    const actions = document.createElement('div');
    actions.className = 'voice-text-actions';

    const okBtn = document.createElement('button');
    okBtn.className = 'btn-submit';
    okBtn.textContent = '解析';
    okBtn.addEventListener('click', () => {
      const text = input.value.trim();
      if (!text) return;
      const parsed = this._parse(text);
      wrap.remove();
      if (!parsed) { this._showError('无法提取日程信息'); return; }
      this._showPreview(parsed, text);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-cancel';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => wrap.remove());

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    wrap.appendChild(actions);

    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') okBtn.click(); });
    document.body.appendChild(wrap);
    setTimeout(() => input.focus(), 50);
  }

  // ── NLP Parsing ─────────────────────────────

  _processResult() {
    const text = this.finalText.trim();
    if (!text) return;
    const parsed = this._parse(text);
    if (!parsed) { this._showError('无法提取日程信息'); return; }
    this._showPreview(parsed, text);
  }

  _parse(text) {
    // Normalize: convert Chinese numerals to Arabic digits
    const normalized = this._normalizeNumbers(text);
    console.log('[VoiceInput] Parse input:', text);
    console.log('[VoiceInput] Normalized:', normalized);

    const result = {};
    const today = new Date();
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(today); dayAfter.setDate(dayAfter.getDate() + 2);

    // ── Date ──
    // Weekday: 周一/星期一/下周一/下个星期一
    const wdMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };
    let wdMatch = normalized.match(/(下个?|这|本)?\s*周\s*([一二三四五六日天])/);
    if (!wdMatch) wdMatch = normalized.match(/(下个?|这|本)?\s*星期\s*([一二三四五六日天])/);
    if (!wdMatch) wdMatch = normalized.match(/周\s*([一二三四五六日天])/);
    if (!wdMatch) wdMatch = normalized.match(/星期\s*([一二三四五六日天])/);

    if (/明天|明早/.test(normalized)) {
      result.date = formatLocalDate(tomorrow);
    } else if (/后天/.test(normalized)) {
      result.date = formatLocalDate(dayAfter);
    } else if (/今天|今晚/.test(normalized)) {
      result.date = formatLocalDate(today);
    } else if (wdMatch) {
      const prefix = wdMatch[1] || '';
      const targetWd = wdMap[wdMatch[2]];
      const todayWd = today.getDay();
      let diff = targetWd - todayWd;
      if (prefix.includes('下')) diff += 7;
      else if (diff <= 0 && !prefix.includes('这') && !prefix.includes('本')) diff += 7;
      const target = new Date(today); target.setDate(today.getDate() + diff);
      result.date = formatLocalDate(target);
    } else {
      const m = normalized.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[号日]/);
      if (m) result.date = `${today.getFullYear()}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
      else result.date = formatLocalDate(today);
    }

    // ── Time ──
    // Pattern: [上午/下午/晚上/早上/中午] X点[Y分][半][刻]
    const tm = normalized.match(/(上午|下午|晚上|早上|中午|夜里|傍晚|凌晨)?\s*(\d{1,2})\s*[点:：]\s*(\d{1,2})?\s*[分]?/);
    if (tm) {
      let h = parseInt(tm[2]), mi = tm[3] ? parseInt(tm[3]) : 0, p = tm[1];
      if (p === '下午') { if (h < 12) h += 12; }
      else if (p === '晚上' || p === '夜里' || p === '傍晚') { if (h < 12) h += 12; if (h < 18 && p !== '傍晚') h += 6; }
      else if (p === '中午') { if (h < 12) h += 12; }
      else if (p === '凌晨') { if (h === 12) h = 0; }
      else if (!p && h <= 7) h += 12; // bare "3点" → PM
      result.startTime = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
    }
    // "半" suffix: "三点半" or "3点半"
    const halfMatch = normalized.match(/(上午|下午|晚上|早上|中午|夜里|凌晨)?\s*(\d{1,2})\s*[点:：]?\s*半/);
    if (halfMatch && !result.startTime) {
      let h = parseInt(halfMatch[2]), p = halfMatch[1];
      if (p === '下午' || p === '晚上' || p === '夜里') { if (h < 12) h += 12; }
      else if (p === '中午') { if (h < 12) h += 12; }
      else if (!p && h <= 7) h += 12;
      result.startTime = `${String(h).padStart(2, '0')}:30`;
    }
    // "刻" suffix: "三点一刻" = 3:15, "三点三刻" = 3:45
    const keMatch = normalized.match(/(\d{1,2})\s*点\s*[一三]刻/);
    if (keMatch && !result.startTime) {
      let h = parseInt(keMatch[1]);
      const min = normalized.includes('三刻') ? 45 : 15;
      if (h <= 7) h += 12;
      result.startTime = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }

    // ── Time range ──
    const rm = normalized.match(/(\d{1,2})\s*[点:：]\s*(到|至|~|-)\s*(\d{1,2})\s*[点:：]?/);
    if (rm) {
      let h1 = parseInt(rm[1]), h2 = parseInt(rm[3]);
      if (!result.startTime || h1 === parseInt(result.startTime)) {
        if (h1 <= 7) h1 += 12; if (h2 <= 7) h2 += 12;
        if (h2 < h1) h2 += 12;
        if (!result.startTime) result.startTime = `${String(h1).padStart(2, '0')}:00`;
        result.endTime = `${String(h2).padStart(2, '0')}:00`;
      }
    }

    // ── Reminder ──
    const rem = normalized.match(/提前\s*(\d+)\s*分钟/);
    if (rem) result.reminderMinutes = parseInt(rem[1]);
    else if (/不提醒|无需提醒|不用提醒/.test(normalized)) result.reminderMinutes = 0;

    // ── Category ──
    if (/工作|上班/.test(normalized)) result.category = 'work';
    else if (/体检|看病|锻炼|健身|跑步|运动|游泳/.test(normalized)) result.category = 'health';
    else if (/会议|例会|开会/.test(normalized)) result.category = 'meeting';
    else if (/学习|写作业|上课|考试/.test(normalized)) result.category = 'study';

    // ── Title ──
    let title = normalized
      .replace(/明天|后天|今天|今晚|明早/g, '')
      .replace(/(下个?|这|本)?\s*周\s*[一二三四五六日天]/g, '')
      .replace(/周\s*[一二三四五六日天]/g, '')
      .replace(/星期\s*[一二三四五六日天]/g, '')
      .replace(/\d{1,2}\s*月\s*\d{1,2}\s*[号日]/g, '')
      .replace(/(上午|下午|晚上|早上|中午|夜里|傍晚|凌晨)?\s*\d{1,2}\s*[点:：]\s*(\d{0,2}\s*[分]?)?\s*[半刻]?\s*(到|至|~|-)\s*\d{1,2}\s*[点:：]?/g, '')
      .replace(/(上午|下午|晚上|早上|中午|夜里|傍晚|凌晨)?\s*\d{1,2}\s*[点:：]?\s*[半刻]?\s*(\d{0,2}\s*[分]?)?/g, '')
      .replace(/提前\s*\d+\s*分钟/g, '').replace(/不提醒|无需提醒|不用提醒/g, '')
      .replace(/提醒我|设置提醒|提醒/g, '')
      .replace(/[，。,\.\!！]/g, '').trim();
    if (title) result.title = title;

    console.log('[VoiceInput] Parsed result:', result);
    return Object.keys(result).length > 1 ? result : null;
  }

  // Convert Chinese numerals to Arabic: 三 → 3, 十五 → 15, 二十三 → 23
  _normalizeNumbers(text) {
    const map = { '零': '0', '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6', '七': '7', '八': '8', '九': '9', '十': '10' };
    // Handle "十二" (12), "二十三" (23), "三十五" (35) etc.
    let result = text;
    // "X十三" → X13 (but careful: 十三=13, not 10+3... wait)
    // Actually: 十=10, 十一=11, 十二=12, ..., 十九=19
    // 二十=20, 二十一=21, ..., 二十九=29
    // 三十=30, 三十一=31, ...
    // Simpler approach: convert common patterns
    result = result.replace(/三十一/g, '31').replace(/三十二/g, '32').replace(/三十三/g, '33')
      .replace(/三十四/g, '34').replace(/三十五/g, '35').replace(/三十六/g, '36')
      .replace(/三十七/g, '37').replace(/三十八/g, '38').replace(/三十九/g, '39')
      .replace(/三十/g, '30')
      .replace(/二十一/g, '21').replace(/二十二/g, '22').replace(/二十三/g, '23')
      .replace(/二十四/g, '24').replace(/二十五/g, '25').replace(/二十六/g, '26')
      .replace(/二十七/g, '27').replace(/二十八/g, '28').replace(/二十九/g, '29')
      .replace(/二十/g, '20')
      .replace(/十一/g, '11').replace(/十二/g, '12').replace(/十三/g, '13')
      .replace(/十四/g, '14').replace(/十五/g, '15').replace(/十六/g, '16')
      .replace(/十七/g, '17').replace(/十八/g, '18').replace(/十九/g, '19')
      .replace(/十/g, '10');
    // Simple single-char replacements
    for (const [cn, ar] of Object.entries(map)) {
      result = result.replace(new RegExp(cn, 'g'), ar);
    }
    return result;
  }

  // ── Preview ─────────────────────────────────

  _showPreview(parsed, rawText) {
    const old = document.querySelector('.voice-preview');
    if (old) old.remove();

    const preview = document.createElement('div');
    preview.className = 'voice-preview';
    preview.innerHTML = '<h4>识别结果</h4>';

    const fields = [];
    if (parsed.title) fields.push(`标题: <strong>${parsed.title}</strong>`);
    if (parsed.date) fields.push(`日期: <strong>${parsed.date}</strong>`);
    if (parsed.startTime) fields.push(`时间: <strong>${parsed.startTime}${parsed.endTime ? ' - ' + parsed.endTime : ''}</strong>`);
    if (parsed.reminderMinutes != null) fields.push(`提醒: <strong>提前${parsed.reminderMinutes}分钟</strong>`);
    if (parsed.category) {
      const cat = CATEGORIES.find(c => c.key === parsed.category);
      fields.push(`分类: <strong>${cat ? cat.label : parsed.category}</strong>`);
    }
    if (!fields.length) fields.push(`原文: <strong>${rawText}</strong>`);

    const list = document.createElement('div');
    for (const f of fields) { const d = document.createElement('div'); d.className = 'preview-field'; d.innerHTML = f; list.appendChild(d); }
    preview.appendChild(list);

    const actions = document.createElement('div');
    actions.className = 'preview-actions';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn-submit'; confirmBtn.style.cssText = 'font-size:12px;padding:5px 14px;';
    confirmBtn.textContent = '确认添加';
    confirmBtn.addEventListener('click', () => { preview.remove(); if (this.onResult) this.onResult(parsed); });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-cancel'; cancelBtn.style.cssText = 'font-size:12px;padding:5px 14px;';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => preview.remove());

    actions.appendChild(cancelBtn); actions.appendChild(confirmBtn);
    preview.appendChild(actions);
    document.body.appendChild(preview);
    setTimeout(() => { if (preview.parentNode) preview.remove(); }, 20000);
  }

  _showError(msg) {
    const old = document.querySelector('.voice-preview');
    if (old) old.remove();
    const p = document.createElement('div');
    p.className = 'voice-preview';
    p.innerHTML = `<p style="color:var(--danger);font-size:12px;">${msg}</p>`;
    document.body.appendChild(p);
    setTimeout(() => { if (p.parentNode) p.remove(); }, 3000);
  }
}
