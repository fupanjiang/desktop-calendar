const { Tray, Menu, app, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

class TrayManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.tray = null;
  }

  create() {
    const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');

    let icon;
    if (fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    } else {
      icon = nativeImage.createEmpty();
    }

    this.tray = new Tray(icon);
    this.tray.setToolTip('桌面日程');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示日程', click: () => {
          this.mainWindow.show();
          this.mainWindow.focus();
        }
      },
      {
        label: '添加日程', click: () => {
          this.mainWindow.show();
          this.mainWindow.focus();
          this.mainWindow.webContents.send('action:openScheduleForm');
        }
      },
      { type: 'separator' },
      {
        label: '退出', click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);

    this.tray.setContextMenu(contextMenu);

    this.tray.on('click', () => {
      if (this.mainWindow.isVisible()) {
        this.mainWindow.hide();
      } else {
        this.mainWindow.show();
        this.mainWindow.focus();
      }
    });
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

module.exports = { TrayManager };
