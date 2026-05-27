const fs = require('fs').promises;
const path = require('path');

class JsonStorage {
  constructor(filePath) {
    this.filePath = filePath;
    this.cache = { version: '1.0', lastModified: null, schedules: [] };
    this.writeQueue = Promise.resolve();
  }

  async init() {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    const photosDir = path.join(dir, 'photos');
    await fs.mkdir(photosDir, { recursive: true });

    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      this.cache = JSON.parse(raw);
    } catch {
      this.cache = { version: '1.0', lastModified: new Date().toISOString(), schedules: [] };
      await this.flush();
    }
  }

  readAll() {
    return [...this.cache.schedules];
  }

  findById(id) {
    return this.cache.schedules.find(s => s.id === id) || null;
  }

  async save(schedule) {
    const idx = this.cache.schedules.findIndex(s => s.id === schedule.id);
    schedule.updatedAt = new Date().toISOString();
    if (idx >= 0) {
      this.cache.schedules[idx] = schedule;
    } else {
      this.cache.schedules.push(schedule);
    }
    await this.flush();
    return { success: true };
  }

  async toggleComplete(scheduleId) {
    const s = this.cache.schedules.find(s => s.id === scheduleId);
    if (!s) return { success: false, reason: 'not found' };
    s.completed = !s.completed;
    s.completedAt = s.completed ? new Date().toISOString() : null;
    s.updatedAt = new Date().toISOString();
    await this.flush();
    return { success: true, completed: s.completed };
  }

  async delete(scheduleId) {
    const s = this.cache.schedules.find(s => s.id === scheduleId);
    const photoPaths = s ? s.photos.map(p => p.filePath) : [];
    this.cache.schedules = this.cache.schedules.filter(s => s.id !== scheduleId);
    await this.flush();
    return { photoPaths };
  }

  async flush() {
    this.writeQueue = this.writeQueue.then(async () => {
      this.cache.lastModified = new Date().toISOString();
      await fs.writeFile(this.filePath, JSON.stringify(this.cache, null, 2), 'utf-8');
    });
    return this.writeQueue;
  }
}

module.exports = { JsonStorage };
