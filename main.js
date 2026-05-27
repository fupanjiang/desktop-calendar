// 修复：系统环境变量 ELECTRON_RUN_AS_NODE 会强制 Electron 以纯 Node.js 模式运行，
// 导致开机自启动时 GUI 无法加载。由于该变量在 Electron 启动早期被消费，main.js
// 中 process.env 可能已不含该键，因此采用「总在首次启动时重 spawn」策略确保环境干净。
// __CALENDAR_RESPAWN__ 哨兵阻止无限循环。
(function() {
  if (process.env.__CALENDAR_RESPAWN__) return;
  const cp = require('child_process');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  env.__CALENDAR_RESPAWN__ = '1';
  cp.spawn(process.execPath, [], { env, stdio: 'inherit', detached: true, windowsHide: false }).unref();
  process.exit(0);
})();

const { app, session } = require('electron');
const path = require('path');
const { WindowManager } = require('./src/main/window-manager');
const { TrayManager } = require('./src/main/tray-manager');
const { JsonStorage } = require('./src/main/storage');
const { ReminderScheduler } = require('./src/main/scheduler');
const { NotificationManager } = require('./src/main/notification');
const { registerHandlers } = require('./src/main/ipc-handlers');

// Windows: 设置应用名称和 ID
app.name = '桌面日程';
if (process.platform === 'win32') {
  app.setAppUserModelId('com.calendar.desktop');
}

// 单实例锁：只允许运行一个桌面日程
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let windowManager;
let trayManager;
let storage;
let scheduler;

app.on('second-instance', () => {
  // 用户尝试启动第二个实例 → 聚焦已有窗口
  if (windowManager && windowManager.mainWindow) {
    const win = windowManager.mainWindow;
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
  }
});

app.whenReady().then(async () => {
  // 允许麦克风权限（语音识别需要）
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'microphone') {
      callback(true);
    } else {
      callback(false);
    }
  });

  // 开发模式用项目目录，打包后从 EXE 同级目录读写 data
  // 便携版必须用 PORTABLE_EXECUTABLE_DIR（process.execPath 指向临时目录）
  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR
    || path.dirname(process.execPath);
  const dataDir = app.isPackaged
    ? path.join(exeDir, 'data')
    : path.join(__dirname, 'data');
  console.log('[Main] exeDir:', exeDir);
  console.log('[Main] dataDir:', dataDir);
  console.log('[Main] PORTABLE_EXECUTABLE_DIR:', process.env.PORTABLE_EXECUTABLE_DIR);

  storage = new JsonStorage(path.join(dataDir, 'schedules.json'));
  await storage.init();

  // 读取设置并应用开机自启动
  const settingsPath = path.join(dataDir, 'settings.json');
  let settings = { autoStart: false };
  try {
    if (require('fs').existsSync(settingsPath)) {
      settings = JSON.parse(require('fs').readFileSync(settingsPath, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  if (settings.autoStart) {
    try {
      app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath,
      });
    } catch (e) {
      console.error('[Main] setLoginItemSettings failed:', e);
    }
  }

  windowManager = new WindowManager();
  const mainWindow = windowManager.create();

  const notificationManager = new NotificationManager();

  scheduler = new ReminderScheduler(storage, notificationManager, mainWindow);
  scheduler.start();

  trayManager = new TrayManager(mainWindow);
  trayManager.create();

  registerHandlers(storage, mainWindow, scheduler, dataDir);

  app.on('activate', () => {
    if (mainWindow.isDestroyed()) {
      windowManager.create();
    } else {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (scheduler) scheduler.stop();
});
