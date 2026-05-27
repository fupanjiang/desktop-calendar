class ScheduleForm {
  constructor() {
    this.overlay = document.getElementById('modalOverlay');
    this.formTitle = document.getElementById('formTitle');
    this.editingId = null;
    this.selectedDate = null;
    this.photos = [];
    this.removedPhotoIds = [];
    this.onSaved = null;

    this._bindEvents();
    this._populateSelects();
  }

  _bindEvents() {
    document.getElementById('btnCloseForm').addEventListener('click', () => this.close());
    document.getElementById('btnCancelForm').addEventListener('click', () => this.close());
    document.getElementById('btnSubmitForm').addEventListener('click', () => this._submit());
    document.getElementById('btnDeleteSchedule').addEventListener('click', () => this._delete());
    document.getElementById('btnAddPhoto').addEventListener('click', () => this._addPhotos());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
  }

  _populateSelects() {
    const catSelect = document.getElementById('inputCategory');
    catSelect.innerHTML = '';
    CATEGORIES.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.key;
      opt.textContent = c.label;
      catSelect.appendChild(opt);
    });

    const remSelect = document.getElementById('inputReminder');
    remSelect.innerHTML = '';
    REMINDER_OPTIONS.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.value;
      opt.textContent = r.label;
      remSelect.appendChild(opt);
    });
    remSelect.value = '15';
  }

  open(mode, scheduleOrDate) {
    this.overlay.style.display = 'flex';
    this.photos = [];
    this.removedPhotoIds = [];

    if (mode === 'create') {
      this.editingId = null;
      this.formTitle.textContent = '添加日程';
      document.getElementById('btnDeleteSchedule').style.display = 'none';

      const date = typeof scheduleOrDate === 'string' ? scheduleOrDate : formatLocalDate(new Date());
      document.getElementById('inputTitle').value = '';
      document.getElementById('inputDate').value = date;
      document.getElementById('inputStartTime').value = '';
      document.getElementById('inputEndTime').value = '';
      document.getElementById('inputDescription').value = '';
      document.getElementById('inputCategory').value = 'personal';
      document.getElementById('inputReminder').value = '15';
      this._renderPhotos([]);

    } else if (mode === 'edit') {
      const s = scheduleOrDate;
      this.editingId = s.id;
      this.formTitle.textContent = '编辑日程';
      document.getElementById('btnDeleteSchedule').style.display = 'block';

      document.getElementById('inputTitle').value = s.title || '';
      document.getElementById('inputDate').value = s.date || '';
      document.getElementById('inputStartTime').value = s.startTime || '';
      document.getElementById('inputEndTime').value = s.endTime || '';
      document.getElementById('inputDescription').value = s.description || '';
      document.getElementById('inputCategory').value = s.category || 'personal';
      document.getElementById('inputReminder').value = s.reminderMinutes != null ? s.reminderMinutes : '15';
      this.photos = [...(s.photos || [])];
      this._renderPhotos(this.photos);
    }
  }

  close() {
    this.overlay.style.display = 'none';
    this.editingId = null;
    this.photos = [];
    this.removedPhotoIds = [];
  }

  prefillFromVoice(data) {
    // 由 voice-input 调用，打开表单并预填解析结果
    this.open('create', data.date || formatLocalDate(new Date()));
    if (data.title) document.getElementById('inputTitle').value = data.title;
    if (data.date) document.getElementById('inputDate').value = data.date;
    if (data.startTime) document.getElementById('inputStartTime').value = data.startTime;
    if (data.endTime) document.getElementById('inputEndTime').value = data.endTime;
    if (data.description) document.getElementById('inputDescription').value = data.description;
    if (data.reminderMinutes != null) document.getElementById('inputReminder').value = data.reminderMinutes;
    if (data.category) document.getElementById('inputCategory').value = data.category;
  }

  _renderPhotos(photoList) {
    const area = document.getElementById('photosArea');
    area.innerHTML = '';

    for (const p of photoList) {
      const wrap = document.createElement('div');
      wrap.className = 'photo-thumb-wrap';

      const img = document.createElement('img');
      img.src = `file://${p.filePath}`;
      img.alt = p.fileName;
      wrap.appendChild(img);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'photo-remove';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => {
        if (this.editingId) {
          this.removedPhotoIds.push(p.id);
        }
        this.photos = this.photos.filter(x => x.id !== p.id);
        this._renderPhotos(this.photos);
      });
      wrap.appendChild(removeBtn);

      area.appendChild(wrap);
    }

    const addBtn = document.createElement('button');
    addBtn.id = 'btnAddPhoto';
    addBtn.className = 'add-photo-btn';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', () => this._addPhotos());
    area.appendChild(addBtn);
  }

  async _addPhotos() {
    const results = await api.pickPhotos();
    if (results && results.length > 0) {
      this.photos.push(...results);
      this._renderPhotos(this.photos);
    }
  }

  async _submit() {
    const title = document.getElementById('inputTitle').value.trim();
    if (!title) return this._shake(document.getElementById('inputTitle'));

    const reminderMinutes = parseInt(document.getElementById('inputReminder').value) || 0;
    const hasReminder = reminderMinutes > 0;

    const schedule = {
      id: this.editingId || (Date.now().toString(36) + Math.random().toString(36).substr(2, 9)),
      title,
      date: document.getElementById('inputDate').value,
      startTime: document.getElementById('inputStartTime').value,
      endTime: document.getElementById('inputEndTime').value,
      description: document.getElementById('inputDescription').value.trim(),
      category: document.getElementById('inputCategory').value,
      color: CATEGORIES.find(c => c.key === document.getElementById('inputCategory').value)?.color || '#4A90D9',
      photos: this.photos,
      hasReminder: hasReminder,
      reminderMinutes: reminderMinutes,
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isAllDay: false
    };

    // 如果是编辑，保留原始创建时间和完成状态
    if (this.editingId) {
      const allSchedules = await api.loadSchedules();
      const original = allSchedules.find(s => s.id === this.editingId);
      if (original) {
        schedule.createdAt = original.createdAt;
        schedule.completed = original.completed;
        schedule.completedAt = original.completedAt;
      }
    }

    await api.saveSchedule(schedule);
    this.close();
    if (this.onSaved) this.onSaved();
  }

  async _delete() {
    if (!this.editingId) return;
    await api.deleteSchedule(this.editingId);
    this.close();
    if (this.onSaved) this.onSaved();
  }

  _shake(el) {
    el.style.borderColor = '#ed4245';
    el.focus();
    setTimeout(() => { el.style.borderColor = ''; }, 1500);
  }
}
