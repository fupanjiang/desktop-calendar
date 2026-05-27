const { BrowserWindow, screen } = require('electron');
const path = require('path');

class WindowManager {
  constructor() {
    this.mainWindow = null;
  }

  create() {
    const { width: screenW } = screen.getPrimaryDisplay().workAreaSize;

    this.mainWindow = new BrowserWindow({
      width: 680,
      height: 750,
      x: screenW - 700,
      y: 40,
      minWidth: 340,
      minHeight: 420,
      title: '桌面日程',
      frame: false,
      transparent: false,
      alwaysOnTop: true,
      skipTaskbar: false,
      resizable: true,
      maximizable: false,
      fullscreenable: false,
      icon: path.join(__dirname, '..', '..', 'assets', 'icon.ico'),
      webPreferences: {
        preload: path.join(__dirname, '..', '..', 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
      }
    });

    this.mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

    this.mainWindow.on('close', (event) => {
      if (!require('electron').app.isQuitting) {
        event.preventDefault();
        this.mainWindow.hide();
      }
    });

    return this.mainWindow;
  }

  getWindow() {
    return this.mainWindow;
  }
}

module.exports = { WindowManager };
