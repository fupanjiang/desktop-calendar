const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('calendarAPI', {

  // 日程 CRUD
  loadSchedules: () => ipcRenderer.invoke('schedules:loadAll'),
  saveSchedule: (schedule) => ipcRenderer.invoke('schedules:save', schedule),
  deleteSchedule: (scheduleId) => ipcRenderer.invoke('schedules:delete', scheduleId),
  toggleComplete: (scheduleId) => ipcRenderer.invoke('schedules:toggleComplete', scheduleId),

  // 照片
  pickPhotos: () => ipcRenderer.invoke('photos:pick'),
  removePhoto: (scheduleId, photoId) => ipcRenderer.invoke('photos:remove', scheduleId, photoId),

  // 窗口控制
  minimizeToTray: () => ipcRenderer.invoke('window:minimizeToTray'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  focusWindow: () => ipcRenderer.invoke('window:focus'),

  // 设置
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setAutoStart: (enabled) => ipcRenderer.invoke('settings:setAutoStart', enabled),

  // 语音识别（百度 STT API + Windows SAPI 保底）
  getSttConfig: () => ipcRenderer.invoke('voice:getSttConfig'),
  saveSttConfig: (apiKey, secretKey) => ipcRenderer.invoke('voice:saveSttConfig', apiKey, secretKey),
  transcribeAudio: (audioBase64, byteLength) => ipcRenderer.invoke('voice:transcribe', audioBase64, byteLength),
  startVoiceRecognition: () => ipcRenderer.invoke('voice:startRecognition'),
  stopVoiceRecognition: () => ipcRenderer.invoke('voice:stopRecognition'),
  onVoiceResult: (callback) => {
    const handler = (_event, text) => callback(text);
    ipcRenderer.on('voice:result', handler);
    return () => ipcRenderer.removeListener('voice:result', handler);
  },
  onVoiceError: (callback) => {
    const handler = (_event, msg) => callback(msg);
    ipcRenderer.on('voice:error', handler);
    return () => ipcRenderer.removeListener('voice:error', handler);
  },
  onVoiceEnd: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('voice:end', handler);
    return () => ipcRenderer.removeListener('voice:end', handler);
  },

  // 提醒事件（主→渲染）
  onReminderTriggered: (callback) => {
    const handler = (_event, schedule) => callback(schedule);
    ipcRenderer.on('reminder:triggered', handler);
    return () => ipcRenderer.removeListener('reminder:triggered', handler);
  },

  // 打开日程表单（托盘菜单触发）
  onOpenScheduleForm: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('action:openScheduleForm', handler);
    return () => ipcRenderer.removeListener('action:openScheduleForm', handler);
  }
});
