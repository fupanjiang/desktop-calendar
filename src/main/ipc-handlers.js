const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { VoiceRecognition } = require('./voice-recognition');
const { SttService } = require('./stt-service');

function findConfigPath(storageFilePath) {
  const candidates = [
    // 1. EXE 同级 data 目录（便携版 / 普通打包）
    path.join(path.dirname(storageFilePath), 'baidu-config.json'),
    // 2. extraResources 打包进 resources/data/（便携版回退）
    path.join(process.resourcesPath, 'data', 'baidu-config.json'),
  ];
  for (const p of candidates) {
    if (fsSync.existsSync(p)) return p;
  }
  // 默认返回 EXE 同级路径（后续 save 会写入这里）
  return candidates[0];
}

function registerHandlers(storage, mainWindow, scheduler, dataDir) {
  // 百度语音识别配置
  const configPath = findConfigPath(storage.filePath);
  const sttService = new SttService();

  // 加载百度 API 配置
  try {
    console.log('[Config] Looking for config at:', configPath);
    console.log('[Config] resourcesPath:', process.resourcesPath);
    if (fsSync.existsSync(configPath)) {
      const raw = fsSync.readFileSync(configPath, 'utf8');
      console.log('[Config] File content:', raw.substring(0, 100));
      const cfg = JSON.parse(raw);
      console.log('[Config] Parsed apiKey:', cfg.apiKey ? cfg.apiKey.substring(0, 8) + '...' : 'MISSING');
      if (cfg.apiKey && cfg.secretKey) {
        sttService.configure(cfg.apiKey, cfg.secretKey);
        console.log('[Config] sttService configured successfully');
      }
    } else {
      console.log('[Config] Config file not found');
    }
  } catch (e) {
    console.error('[Config] Error loading config:', e.message);
  }

  // 语音识别（旧 SAPI，保底用）
  let voiceRecognition = null;

  ipcMain.handle('voice:startRecognition', async () => {
    return new Promise((resolve) => {
      if (voiceRecognition) voiceRecognition.stop();
      voiceRecognition = new VoiceRecognition();
      voiceRecognition.onResult = (text) => mainWindow.webContents.send('voice:result', text);
      voiceRecognition.onError = (msg) => mainWindow.webContents.send('voice:error', msg);
      voiceRecognition.onEnd = () => {
        mainWindow.webContents.send('voice:end');
        voiceRecognition = null;
      };
      voiceRecognition.start();
      resolve({ success: true });
    });
  });

  ipcMain.handle('voice:stopRecognition', async () => {
    if (voiceRecognition) { voiceRecognition.stop(); voiceRecognition = null; }
    return { success: true };
  });

  // 百度语音识别 API
  ipcMain.handle('voice:getSttConfig', async () => {
    // If sttService already has keys, return them
    if (sttService.apiKey) {
      return { apiKey: sttService.apiKey, secretKey: sttService.secretKey ? '***' : '' };
    }
    // Fallback: re-read config file in case it was created after startup
    const searchPaths = [configPath, path.join(process.resourcesPath, 'data', 'baidu-config.json')];
    for (const p of searchPaths) {
      try {
        if (fsSync.existsSync(p)) {
          const cfg = JSON.parse(fsSync.readFileSync(p, 'utf8'));
          if (cfg.apiKey && cfg.secretKey) {
            sttService.configure(cfg.apiKey, cfg.secretKey);
            return { apiKey: cfg.apiKey, secretKey: '***' };
          }
        }
      } catch {}
    }
    return { apiKey: '', secretKey: '' };
  });

  ipcMain.handle('voice:saveSttConfig', async (_event, apiKey, secretKey) => {
    sttService.configure(apiKey, secretKey);
    // 始终保存到 EXE 同级 data 目录（resources 是只读的）
    const savePath = path.join(path.dirname(storage.filePath), 'baidu-config.json');
    const dir = path.dirname(savePath);
    try { await fs.mkdir(dir, { recursive: true }); } catch {}
    await fs.writeFile(savePath, JSON.stringify({ apiKey, secretKey }, null, 2));
    return { success: true };
  });

  ipcMain.handle('voice:transcribe', async (_event, audioBase64, byteLength) => {
    try {
      const text = await sttService.recognize(audioBase64, byteLength);
      return { success: true, text };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle('schedules:loadAll', async () => {
    return storage.readAll();
  });

  ipcMain.handle('schedules:save', async (_event, schedule) => {
    scheduler.resetForSchedule(schedule.id);
    return storage.save(schedule);
  });

  ipcMain.handle('schedules:delete', async (_event, scheduleId) => {
    const result = await storage.delete(scheduleId);
    for (const p of result.photoPaths) {
      try { await fs.unlink(p); } catch {}
    }
    scheduler.resetForSchedule(scheduleId);
    return { success: true };
  });

  ipcMain.handle('schedules:toggleComplete', async (_event, scheduleId) => {
    const result = await storage.toggleComplete(scheduleId);
    if (result.completed) {
      scheduler.resetForSchedule(scheduleId);
    }
    return result;
  });

  ipcMain.handle('photos:pick', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }]
    });

    if (result.canceled || !result.filePaths.length) return [];

    const photosDir = path.join(storage.filePath, '..', 'photos');
    await fs.mkdir(photosDir, { recursive: true });

    const photoEntries = [];
    for (const srcPath of result.filePaths) {
      const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
      const ext = path.extname(srcPath);
      const fileName = `${id}${ext}`;
      const destPath = path.join(photosDir, fileName);

      await fs.copyFile(srcPath, destPath);

      photoEntries.push({
        id,
        filePath: destPath,
        fileName: path.basename(srcPath),
        addedAt: new Date().toISOString()
      });
    }

    return photoEntries;
  });

  ipcMain.handle('photos:remove', async (_event, scheduleId, photoId) => {
    const s = storage.findById(scheduleId);
    if (!s) return { success: false };

    const photo = s.photos.find(p => p.id === photoId);
    if (photo) {
      try { await fs.unlink(photo.filePath); } catch {}
      s.photos = s.photos.filter(p => p.id !== photoId);
      await storage.save(s);
    }
    return { success: true };
  });

  ipcMain.handle('window:minimizeToTray', () => {
    mainWindow.hide();
  });

  ipcMain.handle('window:minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.handle('window:focus', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // ── 设置 ──
  const settingsPath = require('path').join(dataDir, 'settings.json');

  function _readSettings() {
    try {
      if (require('fs').existsSync(settingsPath)) {
        return JSON.parse(require('fs').readFileSync(settingsPath, 'utf-8'));
      }
    } catch (e) { /* ignore */ }
    return { autoStart: false };
  }

  function _writeSettings(s) {
    const dir = require('path').dirname(settingsPath);
    try { require('fs').mkdirSync(dir, { recursive: true }); } catch (e) { /* ignore */ }
    require('fs').writeFileSync(settingsPath, JSON.stringify(s, null, 2), 'utf-8');
  }

  ipcMain.handle('settings:get', async () => {
    return _readSettings();
  });

  ipcMain.handle('settings:createDesktopShortcut', async () => {
    const { app, shell } = require('electron');
    const shortcutPath = require('path').join(app.getPath('desktop'), '桌面日程.lnk');
    try {
      shell.writeShortcutLink(shortcutPath, 'create', {
        target: process.execPath,
        description: '桌面日程 — 桌面悬浮日历日程管理',
        icon: process.execPath,
        iconIndex: 0,
      });
      return { success: true, path: shortcutPath };
    } catch (e) {
      // writeShortcutLink 在某些版本可能不支持，回退到硬链接/复制方案
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('settings:setAutoStart', async (_event, enabled) => {
    const { app } = require('electron');
    app.setLoginItemSettings({ openAtLogin: !!enabled });
    const s = _readSettings();
    s.autoStart = !!enabled;
    _writeSettings(s);
    return true;
  });
}

module.exports = { registerHandlers };
