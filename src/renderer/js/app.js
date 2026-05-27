(async function () {
  // ===== 主题 =====
  const theme = new ThemeManager();
  theme.init();

  // ===== 模块初始化 =====
  const calendar = new CalendarRenderer('calendarGrid');
  const detail = new ScheduleDetail();
  const form = new ScheduleForm();
  const voice = new VoiceInput();
  const search = new SearchManager();

  let allSchedules = [];

  // ===== 辅助：分裂动画打开详情 =====
  function splitOpenToDetail(dateStr, daySchedules) {
    const calendarView = document.getElementById('calendarView');
    const detailView = document.getElementById('detailView');

    // 先渲染详情
    detail.renderFull(dateStr, daySchedules);

    // 日历缩小消失（从中心塌陷）
    calendarView.classList.add('split-out');

    setTimeout(() => {
      calendarView.style.display = 'none';
      calendarView.classList.remove('split-out');
      detailView.style.display = 'flex';
      detailView.classList.add('fade-in');
      setTimeout(() => detailView.classList.remove('fade-in'), 260);
    }, 280);
  }

  // ===== 辅助：分裂动画返回日历 =====
  function splitCloseToCalendar() {
    const calendarView = document.getElementById('calendarView');
    const detailView = document.getElementById('detailView');

    // 隐藏详情
    detailView.style.display = 'none';

    // 日历从中线展开
    calendarView.style.display = 'flex';
    calendarView.classList.add('split-in');

    setTimeout(() => {
      calendarView.classList.remove('split-in');
    }, 280);
  }

  // ===== 加载数据 =====
  async function loadData() {
    allSchedules = await api.loadSchedules();
    calendar.setSchedules(allSchedules);

    if (detail.currentDate) {
      const daySchedules = allSchedules.filter(s => s.date === detail.currentDate);
      detail.renderFull(detail.currentDate, daySchedules);
    }
  }

  // ===== 日历点击日期 → 分裂动画 → 打开详情 =====
  calendar.onDateClick = (dateStr, daySchedules) => {
    splitOpenToDetail(dateStr, daySchedules);
  };

  // ===== 详情页返回日历 =====
  document.getElementById('btnBackToCalendar').addEventListener('click', () => {
    splitCloseToCalendar();
  });

  // ===== 详情回调 =====
  detail.onEdit = (schedule) => form.open('edit', schedule);
  detail.onRefresh = () => loadData();

  // ===== 表单保存后刷新 =====
  form.onSaved = () => loadData();

  // ===== 语音识别结果 → 打开表单 =====
  voice.onResult = (parsed) => form.prefillFromVoice(parsed);

  // ===== 添加日程按钮 =====
  document.getElementById('btnAddScheduleDetail').addEventListener('click', () => {
    const date = detail.currentDate || calendar.selectedDate || formatLocalDate(new Date());
    form.open('create', date);
  });

  // ===== 日历导航 =====
  document.getElementById('btnPrevMonth').addEventListener('click', () => calendar.prevMonth());
  document.getElementById('btnNextMonth').addEventListener('click', () => calendar.nextMonth());
  document.getElementById('btnPrevYear').addEventListener('click', () => calendar.prevYear());
  document.getElementById('btnNextYear').addEventListener('click', () => calendar.nextYear());
  document.getElementById('btnToday').addEventListener('click', () => calendar.goToToday());

  // ===== 主题切换 =====
  document.getElementById('btnTheme').addEventListener('click', () => theme.toggle());
  document.getElementById('btnTheme2').addEventListener('click', () => theme.toggle());

  // ===== 搜索 =====
  search.init(() => allSchedules);
  search.onResultClick = (dateStr) => {
    const daySchedules = allSchedules.filter(s => s.date === dateStr);
    calendar.selectedDate = dateStr;
    calendar.currentDate = new Date(dateStr + 'T00:00:00');
    calendar.render();
    splitOpenToDetail(dateStr, daySchedules);
  };

  // ===== 窗口控制 =====
  document.getElementById('btn-minimize').addEventListener('click', () => api.minimizeWindow());
  document.getElementById('btn-close').addEventListener('click', () => api.minimizeToTray());

  // ===== 托盘菜单打开添加日程 =====
  api.onOpenScheduleForm(() => {
    const date = detail.currentDate || calendar.selectedDate || formatLocalDate(new Date());
    form.open('create', date);
  });

  // ===== 提醒事件 =====
  let reminderTimer = null;
  api.onReminderTriggered((schedule) => {
    const toast = document.getElementById('reminderToast');
    document.getElementById('reminderTitle').textContent = schedule.title;
    document.getElementById('reminderTime').textContent =
      `${schedule.date} ${schedule.startTime}${schedule.endTime ? ' - ' + schedule.endTime : ''}`;
    document.getElementById('reminderDesc').textContent = schedule.description || '';
    toast.style.display = 'flex';

    if (reminderTimer) clearTimeout(reminderTimer);
    reminderTimer = setTimeout(() => { toast.style.display = 'none'; }, 15000);
  });

  document.getElementById('btnDismissReminder').addEventListener('click', () => {
    document.getElementById('reminderToast').style.display = 'none';
    if (reminderTimer) clearTimeout(reminderTimer);
  });

  // ===== 设置面板 =====
  const settingsOverlay = document.getElementById('settingsOverlay');
  document.getElementById('btnSettings').addEventListener('click', async () => {
    const s = await api.getSettings();
    document.getElementById('toggleAutoStart').checked = !!s.autoStart;
    settingsOverlay.style.display = 'flex';
  });
  document.getElementById('btnCloseSettings').addEventListener('click', () => {
    settingsOverlay.style.display = 'none';
  });
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) settingsOverlay.style.display = 'none';
  });
  document.getElementById('toggleAutoStart').addEventListener('change', async (e) => {
    await api.setAutoStart(e.target.checked);
  });

  // ===== 初始加载 =====
  await loadData();

  const today = formatLocalDate(new Date());
  calendar.selectedDate = today;
  calendar.render();
})();
