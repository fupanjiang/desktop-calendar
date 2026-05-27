const { Notification } = require('electron');
const path = require('path');

class NotificationManager {
  show({ title, body, icon }) {
    if (!Notification.isSupported()) return;

    const iconPath = icon || path.join(__dirname, '..', '..', 'assets', 'icon.png');

    const n = new Notification({
      title: title || '日程提醒',
      body: body || '',
      icon: iconPath,
      urgency: 'critical',
      timeoutType: 'default'
    });

    n.on('click', () => {
      // 点击通知时恢复窗口
      const { BrowserWindow } = require('electron');
      const wins = BrowserWindow.getAllWindows();
      if (wins.length > 0) {
        wins[0].show();
        wins[0].focus();
      }
    });

    n.show();
    return n;
  }
}

module.exports = { NotificationManager };
