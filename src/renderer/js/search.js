class SearchManager {
  constructor() {
    this.schedules = [];
    this.onResultClick = null;
    this.debounceTimer = null;
  }

  init(schedulesProvider) {
    this.schedulesProvider = schedulesProvider;
    this.panel = document.getElementById('searchPanel');
    this.input = document.getElementById('searchInput');
    this.resultsEl = document.getElementById('searchResults');

    document.getElementById('btnSearch').addEventListener('click', () => this.open());
    document.getElementById('btnSearchClose').addEventListener('click', () => this.close());
    this.input.addEventListener('input', () => this._debounceFilter());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  }

  open() {
    this.schedules = this.schedulesProvider();
    this.panel.style.display = 'flex';
    this.input.value = '';
    this.resultsEl.innerHTML = '';
    setTimeout(() => this.input.focus(), 50);
  }

  close() {
    this.panel.style.display = 'none';
    this.input.value = '';
    this.resultsEl.innerHTML = '';
  }

  _debounceFilter() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this._filter(), 200);
  }

  _filter() {
    const query = this.input.value.trim().toLowerCase();
    this.resultsEl.innerHTML = '';

    if (!query) {
      this.resultsEl.innerHTML = '<div class="search-empty">输入关键词搜索日程</div>';
      return;
    }

    const results = this.schedules.filter(s => {
      return (s.title && s.title.toLowerCase().includes(query)) ||
             (s.description && s.description.toLowerCase().includes(query)) ||
             (s.category && s.category.toLowerCase().includes(query));
    });

    if (results.length === 0) {
      this.resultsEl.innerHTML = '<div class="search-empty">未找到匹配的日程</div>';
      return;
    }

    results.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
      return 0;
    });

    for (const s of results) {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.style.borderLeftColor = s.color;

      const dot = document.createElement('span');
      dot.className = 'search-result-dot';
      dot.style.backgroundColor = s.color;
      item.appendChild(dot);

      const info = document.createElement('div');
      info.className = 'search-result-info';

      const title = document.createElement('div');
      title.className = 'search-result-title';
      title.textContent = s.title;
      info.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'search-result-meta';
      const parts = [];
      if (s.startTime) parts.push(s.startTime + (s.endTime ? ' - ' + s.endTime : ''));
      const cat = CATEGORIES.find(c => c.key === s.category);
      if (cat) parts.push(cat.label);
      meta.textContent = parts.join(' · ');
      info.appendChild(meta);

      item.appendChild(info);

      const dateEl = document.createElement('span');
      dateEl.className = 'search-result-date';
      const d = new Date(s.date + 'T00:00:00');
      dateEl.textContent = `${d.getMonth() + 1}/${d.getDate()}`;
      item.appendChild(dateEl);

      item.addEventListener('click', () => {
        this.close();
        if (this.onResultClick) this.onResultClick(s.date);
      });

      this.resultsEl.appendChild(item);
    }
  }
}
