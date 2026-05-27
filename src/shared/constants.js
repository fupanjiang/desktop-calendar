// 悬浮窗默认尺寸
const WINDOW_WIDTH = 420;
const WINDOW_HEIGHT = 580;
const WINDOW_MIN_WIDTH = 340;
const WINDOW_MIN_HEIGHT = 420;

// 日程提醒扫描间隔（毫秒）
const REMINDER_SCAN_INTERVAL = 60000;

// 语音识别配置
const SPEECH_LANG = 'zh-CN';
const SPEECH_AUTO_STOP_SILENCE = 5000; // 5秒静默自动停止

// 日程分类
const CATEGORIES = [
  { key: 'work', label: '工作', color: '#4A90D9' },
  { key: 'personal', label: '个人', color: '#7ED321' },
  { key: 'health', label: '健康', color: '#F5A623' },
  { key: 'meeting', label: '会议', color: '#BD10E0' },
  { key: 'other', label: '其他', color: '#9B9B9B' }
];

// 提醒提前时间选项（分钟）
const REMINDER_OPTIONS = [
  { value: 0, label: '准时' },
  { value: 5, label: '提前5分钟' },
  { value: 15, label: '提前15分钟' },
  { value: 30, label: '提前30分钟' },
  { value: 60, label: '提前1小时' },
  { value: 1440, label: '提前1天' }
];

// 存储文件路径（相对于 data/ 目录）
const DATA_DIR = 'data';
const PHOTOS_DIR = 'data/photos';
const STORE_FILE = 'data/schedules.json';

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WINDOW_WIDTH, WINDOW_HEIGHT, WINDOW_MIN_WIDTH, WINDOW_MIN_HEIGHT,
    REMINDER_SCAN_INTERVAL, SPEECH_LANG, SPEECH_AUTO_STOP_SILENCE,
    CATEGORIES, REMINDER_OPTIONS, DATA_DIR, PHOTOS_DIR, STORE_FILE
  };
}
