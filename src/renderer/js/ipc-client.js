// IPC 调用封装 —— calendarAPI 由 preload.js 通过 contextBridge 注入
const api = window.calendarAPI;

// 获取本地时区的日期字符串 YYYY-MM-DD
// 不要用 toISOString().slice(0,10) 因为 UTC 转换会导致凌晨时日期错误
function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
