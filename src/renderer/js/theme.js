class ThemeManager {
  constructor() {
    this.current = 'dark';
  }

  init() {
    const saved = localStorage.getItem('calendar-theme');
    if (saved) this.current = saved;
    this._apply();
  }

  toggle() {
    this.current = this.current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('calendar-theme', this.current);
    this._apply();
  }

  _apply() {
    document.documentElement.setAttribute('data-theme', this.current);
    const icon = this.current === 'dark' ? '☀️' : '🌙';
    const btns = document.querySelectorAll('#btnTheme, #btnTheme2');
    btns.forEach(b => { b.textContent = icon; });
  }
}
