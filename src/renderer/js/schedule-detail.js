class ScheduleDetail {
  constructor() {
    this.schedules = [];
    this.currentDate = null;
    this.onEdit = null;
    this.onRefresh = null;
    this.onBack = null;

    // 拖拽状态
    this.dragSrcId = null;
  }

  _getUrgency(schedule) {
    if (schedule.completed) {
      return { level: 0, color: '#57f287', label: '已完成' };
    }

    const now = new Date();
    const dateStr = schedule.date;
    const startTime = schedule.startTime;

    if (!startTime) {
      const today = formatLocalDate(now);
      if (dateStr < today) return { level: 100, color: '#ed4245', label: '已过期' };
      if (dateStr === today) return { level: 40, color: '#ffee58', label: '今天' };
      return { level: 10, color: '#57f287', label: '即将' };
    }

    const startDateTime = new Date(`${dateStr}T${startTime}`);
    const diffMs = startDateTime - now;
    const diffMinutes = diffMs / (1000 * 60);

    if (diffMinutes < 0)  return { level: 100, color: '#ed4245', label: '已过期' };
    if (diffMinutes < 15) return { level: 95, color: '#ed4245', label: '即将开始' };
    if (diffMinutes < 60) return { level: 80, color: '#f57c00', label: '紧迫' };
    if (diffMinutes < 180) return { level: 60, color: '#fee75c', label: '适中' };
    if (diffMinutes < 1440) return { level: 40, color: '#ffee58', label: '今天' };
    return { level: 10, color: '#57f287', label: '即将' };
  }

  renderFull(dateStr, schedules) {
    this.currentDate = dateStr;
    this.schedules = [...schedules];

    // 更新标题
    const d = new Date(dateStr + 'T00:00:00');
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    document.getElementById('detailDateTitle').textContent =
      `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${weekdays[d.getDay()]}`;

    // 渲染列表
    const listEl = document.getElementById('detailScheduleList');
    const emptyEl = document.getElementById('detailEmpty');
    listEl.innerHTML = '';

    if (!schedules || schedules.length === 0) {
      listEl.style.display = 'none';
      emptyEl.style.display = 'flex';
      return;
    }

    listEl.style.display = 'block';
    emptyEl.style.display = 'none';

    // 排序：未完成在前，按开始时间
    const sorted = [...schedules].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (!a.startTime && !b.startTime) return 0;
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime.localeCompare(b.startTime);
    });

    for (const s of sorted) {
      listEl.appendChild(this._buildCard(s));
    }
  }

  _buildCard(schedule) {
    const card = document.createElement('div');
    card.className = 'schedule-card';
    if (schedule.completed) card.classList.add('completed');
    card.style.borderLeftColor = schedule.color;
    card.dataset.id = schedule.id;
    card.draggable = true;

    // 拖拽手柄
    const grip = document.createElement('div');
    grip.className = 'card-grip';
    grip.innerHTML = '<span class="grip-dot"></span><span class="grip-dot"></span><span class="grip-dot"></span>';
    card.appendChild(grip);

    // 第一行：复选框 + 信息
    const topRow = document.createElement('div');
    topRow.className = 'card-top-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'card-complete-check';
    checkbox.checked = schedule.completed;
    checkbox.addEventListener('click', async (e) => {
      e.stopPropagation();
      await api.toggleComplete(schedule.id);
      if (this.onRefresh) this.onRefresh();
    });

    const info = document.createElement('div');
    info.className = 'card-info';

    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = schedule.title;

    const meta = document.createElement('div');
    meta.className = 'card-meta';

    if (schedule.startTime) {
      const time = document.createElement('span');
      time.className = 'card-time';
      time.textContent = schedule.startTime + (schedule.endTime ? ' - ' + schedule.endTime : '');
      meta.appendChild(time);
    }

    if (schedule.description) {
      const desc = document.createElement('span');
      desc.className = 'card-desc';
      desc.textContent = schedule.description;
      meta.appendChild(desc);
    }

    const cat = CATEGORIES.find(c => c.key === schedule.category);
    if (cat) {
      const badge = document.createElement('span');
      badge.className = 'card-badge';
      badge.style.backgroundColor = cat.color;
      badge.textContent = cat.label;
      meta.appendChild(badge);
    }

    info.appendChild(title);
    info.appendChild(meta);
    topRow.appendChild(checkbox);
    topRow.appendChild(info);
    card.appendChild(topRow);

    // 紧迫度进度条
    const urgency = this._getUrgency(schedule);
    const urgencyRow = document.createElement('div');
    urgencyRow.className = 'card-urgency';

    const bar = document.createElement('div');
    bar.className = 'urgency-bar';
    const fill = document.createElement('div');
    fill.className = 'urgency-fill';
    fill.style.width = urgency.level + '%';
    fill.style.backgroundColor = urgency.color;
    bar.appendChild(fill);

    const label = document.createElement('span');
    label.className = 'urgency-label';
    label.textContent = urgency.label;
    label.style.color = urgency.color;

    urgencyRow.appendChild(bar);
    urgencyRow.appendChild(label);
    card.appendChild(urgencyRow);

    // 照片预览
    if (schedule.photos && schedule.photos.length > 0) {
      const photosDiv = document.createElement('div');
      photosDiv.className = 'card-photos-preview';
      schedule.photos.slice(0, 4).forEach(p => {
        const img = document.createElement('img');
        img.src = `file://${p.filePath}`;
        img.alt = p.fileName;
        photosDiv.appendChild(img);
      });
      if (schedule.photos.length > 4) {
        const more = document.createElement('span');
        more.style.cssText = 'font-size:10px;color:var(--text-muted);align-self:flex-end;';
        more.textContent = `+${schedule.photos.length - 4}`;
        photosDiv.appendChild(more);
      }
      card.appendChild(photosDiv);
    }

    // 点击编辑
    card.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (this.onEdit) this.onEdit(schedule);
    });

    // 拖拽事件
    card.addEventListener('dragstart', (e) => {
      this.dragSrcId = schedule.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', schedule.id);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      this._clearDragOver();
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      this._clearDragOver();
      if (schedule.id !== this.dragSrcId) {
        card.classList.add('drag-over');
      }
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const srcId = e.dataTransfer.getData('text/plain');
      if (srcId === schedule.id) return;

      // 重排数组
      const srcIdx = this.schedules.findIndex(s => s.id === srcId);
      const destIdx = this.schedules.findIndex(s => s.id === schedule.id);
      if (srcIdx === -1 || destIdx === -1) return;

      const [moved] = this.schedules.splice(srcIdx, 1);
      this.schedules.splice(destIdx, 0, moved);

      // 更新 sortOrder
      this.schedules.forEach((s, i) => { s.sortOrder = i; });

      // 保存
      for (const s of this.schedules) {
        await api.saveSchedule(s);
      }

      // 重新渲染
      this.renderFull(this.currentDate, this.schedules);
    });

    return card;
  }

  _clearDragOver() {
    document.querySelectorAll('.schedule-card.drag-over').forEach(c => {
      c.classList.remove('drag-over');
    });
  }
}
