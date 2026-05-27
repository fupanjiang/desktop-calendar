const { REMINDER_SCAN_INTERVAL } = require('../shared/constants');

class ReminderScheduler {
  constructor(storage, notificationManager, mainWindow) {
    this.storage = storage;
    this.notification = notificationManager;
    this.mainWindow = mainWindow;
    this.intervalId = null;
    this.firedReminders = new Set();
  }

  start() {
    this.scan();
    this.intervalId = setInterval(() => this.scan(), REMINDER_SCAN_INTERVAL);
    this.scheduleDailyCleanup();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  resetForSchedule(scheduleId) {
    for (const key of this.firedReminders) {
      if (key.startsWith(scheduleId + '_')) {
        this.firedReminders.delete(key);
      }
    }
  }

  scan() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const schedules = this.storage.readAll();

    for (const s of schedules) {
      if (s.completed) continue;
      if (!s.hasReminder) continue;
      if (!s.startTime) continue;

      const scheduleDT = this.makeDateTime(s.date, s.startTime);
      if (!scheduleDT) continue;

      // Skip past schedules (yesterday or earlier) — don't remind for expired events
      if (scheduleDT < todayStart) continue;

      const reminderKey = `${s.id}_${s.date}_${s.startTime}`;
      if (this.firedReminders.has(reminderKey)) continue;

      const reminderTime = new Date(scheduleDT.getTime() - (s.reminderMinutes || 15) * 60000);

      if (now >= reminderTime) {
        this.firedReminders.add(reminderKey);
        this.trigger(s);
      }
    }
  }

  trigger(schedule) {
    const timeStr = schedule.startTime + (schedule.endTime ? ' - ' + schedule.endTime : '');
    const body = `${schedule.date} ${timeStr}${schedule.description ? '\n' + schedule.description : ''}`;

    this.notification.show({
      title: `⏰ ${schedule.title}`,
      body: body,
    });

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (!this.mainWindow.isVisible()) {
        this.mainWindow.show();
      }
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.focus();
      this.mainWindow.webContents.send('reminder:triggered', schedule);
    }
  }

  makeDateTime(dateStr, timeStr) {
    try {
      const [h, m] = timeStr.split(':').map(Number);
      const d = new Date(dateStr + 'T00:00:00');
      d.setHours(h, m, 0, 0);
      if (isNaN(d.getTime())) return null;
      return d;
    } catch {
      return null;
    }
  }

  scheduleDailyCleanup() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const ms = midnight - now;
    setTimeout(() => {
      this.firedReminders.clear();
      this.scheduleDailyCleanup();
    }, ms);
  }
}

module.exports = { ReminderScheduler };
