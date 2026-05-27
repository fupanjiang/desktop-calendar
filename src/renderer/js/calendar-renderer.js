class CalendarRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.currentDate = new Date();
    this.schedules = [];
    this.selectedDate = null;
    this.onDateClick = null;
  }

  setSchedules(schedules) {
    this.schedules = schedules;
    this.render();
  }

  setDate(date) {
    this.currentDate = new Date(date);
    this.render();
  }

  render() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    document.getElementById('monthYearLabel').textContent = `${year}年 ${month + 1}月`;

    this.container.innerHTML = '';

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    const todayStr = formatLocalDate(new Date());

    let cellCount = 0;

    // 上月填充
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      const m = month === 0 ? 12 : month;
      const y = month === 0 ? year - 1 : year;
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const weekNum = this._getWeekNumber(y, m - 1, day);
      if (cellCount % 7 === 0) this._renderWeekCell(weekNum);
      this._renderCell(day, dateStr, true, todayStr);
      cellCount++;
    }

    // 当月
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const weekNum = this._getWeekNumber(year, month, day);
      if (cellCount % 7 === 0) this._renderWeekCell(weekNum);
      this._renderCell(day, dateStr, false, todayStr);
      cellCount++;
    }

    // 下月填充
    const totalCells = cellCount;
    const remaining = totalCells <= 35 ? 35 - totalCells : 42 - totalCells;
    for (let day = 1; day <= remaining; day++) {
      const m = month === 11 ? 1 : month + 2;
      const y = month === 11 ? year + 1 : year;
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const weekNum = this._getWeekNumber(y, m - 1, day);
      if ((totalCells + day - 1) % 7 === 0) this._renderWeekCell(weekNum);
      this._renderCell(day, dateStr, true, todayStr);
    }
  }

  _getWeekNumber(year, month, day) {
    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  }

  _renderWeekCell(weekNum) {
    const cell = document.createElement('div');
    cell.className = 'week-cell';
    cell.textContent = weekNum;
    this.container.appendChild(cell);
  }

  _renderCell(day, dateStr, isOtherMonth, todayStr) {
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    cell.dataset.date = dateStr;

    if (isOtherMonth) cell.classList.add('other-month');
    if (dateStr === todayStr) cell.classList.add('today');
    if (dateStr === this.selectedDate) cell.classList.add('selected');

    // 周末标记
    const dow = new Date(dateStr + 'T00:00:00').getDay();
    if (dow === 0 || dow === 6) cell.classList.add('weekend');

    // 日期数字
    const numSpan = document.createElement('span');
    numSpan.className = 'day-number';
    numSpan.textContent = day;
    cell.appendChild(numSpan);

    // 日程文字列表
    const daySchedules = this.schedules.filter(s => s.date === dateStr);
    if (daySchedules.length > 0) {
      const itemsDiv = document.createElement('div');
      itemsDiv.className = 'day-items';

      const maxShow = 4;
      for (let i = 0; i < daySchedules.length && i < maxShow; i++) {
        const s = daySchedules[i];
        const item = document.createElement('span');
        item.className = 'day-item';
        if (s.completed) item.classList.add('completed');
        item.title = s.title;
        item.innerHTML = `<i class="day-item-dot" style="background:${s.color}"></i>${this._escapeHtml(s.title)}`;
        itemsDiv.appendChild(item);
      }

      if (daySchedules.length > maxShow) {
        const more = document.createElement('span');
        more.className = 'day-item day-more-text';
        more.textContent = `+${daySchedules.length - maxShow} 更多`;
        itemsDiv.appendChild(more);
      }

      cell.appendChild(itemsDiv);
    }

    cell.addEventListener('click', () => {
      this.selectedDate = dateStr;
      this.render();
      if (this.onDateClick) this.onDateClick(dateStr, daySchedules);
    });

    this.container.appendChild(cell);
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  prevMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() - 1);
    this.render();
  }

  nextMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() + 1);
    this.render();
  }

  prevYear() {
    this.currentDate.setFullYear(this.currentDate.getFullYear() - 1);
    this.render();
  }

  nextYear() {
    this.currentDate.setFullYear(this.currentDate.getFullYear() + 1);
    this.render();
  }

  goToToday() {
    const now = new Date();
    this.currentDate = now;
    this.selectedDate = formatLocalDate(now);
    this.render();
    return this.selectedDate;
  }
}
