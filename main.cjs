const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, powerMonitor, dialog, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { randomInt } = require('node:crypto');
const { DEFAULTS, MENUS, validateSettings, timeline } = require('./schedule.cjs');
const ROOT = __dirname, RENDERER = path.join(ROOT, 'renderer');
let widgetWindow, settingsWindow, widgetIcon, artwork, tray, state, file, lastTimeline, preview = null, reminder = null, quitting = false, saveTimer, storageError = '';
app.setName('먼작귀');
if (process.platform === 'win32') app.setAppUserModelId('com.ajttk369.chiikawaworkwidget');
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => showWidget());
  app.on('before-quit', () => { quitting = true; rememberBounds(); persist(); });
  app.on('window-all-closed', () => {});
  app.whenReady().then(start).catch(error => { dialog.showErrorBox('먼작귀 시작 오류', error.message); app.quit(); });
}
function loadState() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT' && fs.existsSync(file)) fs.copyFileSync(file, `${file}.${Date.now()}.invalid`); }
  let settings;
  try { settings = validateSettings({ ...DEFAULTS, ...saved.settings }); } catch { settings = { ...DEFAULTS, workdays: [...DEFAULTS.workdays] }; }
  const days = {};
  if (saved.days && typeof saved.days === 'object' && !Array.isArray(saved.days)) for (const [key, day] of Object.entries(saved.days)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key) && day && Number.isInteger(day.menu) && day.menu >= 0 && day.menu < MENUS.length) days[key] = { menu: day.menu, departed: day.departed === true, animationAt: Number.isFinite(day.animationAt) ? day.animationAt : null,
      breakSlot: Number.isInteger(day.breakSlot) && day.breakSlot >= 0 ? day.breakSlot : 0,
      breakMinutes: [30, 45, 60, 90, 120].includes(day.breakMinutes) ? day.breakMinutes : 60, breakEnabled: day.breakEnabled === true };
  }
  state = { settings, days, bounds: saved.bounds || null,
    normalBounds: saved.normalBounds || (!settings.mini ? saved.bounds : null),
    miniBounds: saved.miniBounds || (settings.mini ? saved.bounds : null) };
}
function persist(strict = false) {
  if (!file || !state) return;
  try { fs.writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2)); fs.renameSync(`${file}.tmp`, file); storageError = ''; }
  catch (error) { storageError = '설정을 저장하지 못했습니다. 저장 폴더와 디스크 공간을 확인해주세요.'; console.error('Settings persistence failed:', error.message); if (strict) throw new Error(storageError); }
}
function snapshot() {
  const time = timeline(state.settings);
  const visible = widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible();
  let changed = false;
  if (!state.days[time.cycleKey]) { state.days[time.cycleKey] = { menu: randomInt(MENUS.length), departed: false, animationAt: null }; changed = true; }
  const day = state.days[time.cycleKey];
  if (time.status === 'after' && !day.departed) {
    day.departed = true;
    // Persist absolute event time so a restart cannot replay the animation from the beginning.
    day.animationAt = lastTimeline?.cycleKey === time.cycleKey && ['before', 'work', 'lunch'].includes(lastTimeline.status) ? time.shift.end : null;
    changed = true;
  }
  const keys = Object.keys(state.days).sort();
  for (const key of keys.slice(0, Math.max(0, keys.length - 60))) { delete state.days[key]; changed = true; }
  if (preview && time.now >= preview.expiresAt) preview = null;
  const total = time.shift.end - time.shift.start - (time.shift.lunchEnd - time.shift.lunchStart);
  const slot = Math.floor((total * time.progress / 100 + 1) / (state.settings.breakMinutes * 60000));
  if (!Number.isInteger(day.breakSlot) || day.breakMinutes !== state.settings.breakMinutes || day.breakEnabled !== state.settings.breakEnabled) {
    day.breakSlot = slot; day.breakMinutes = state.settings.breakMinutes; day.breakEnabled = state.settings.breakEnabled; changed = true;
  } else if (slot !== day.breakSlot) {
    const previousSlot = day.breakSlot; day.breakSlot = slot; changed = true;
    if (state.settings.breakEnabled && slot === previousSlot + 1 && time.status === 'work' &&
        lastTimeline?.cycleKey === time.cycleKey && lastTimeline.status === 'work' &&
        time.now - lastTimeline.now < 10000 && visible && !preview) {
      reminder = { id: time.cycleKey + ':' + day.breakMinutes + ':' + slot, expiresAt: time.now + 8000, text: '잠깐 쉬어갈까?' };
    }
  }
  if (reminder && (time.now >= reminder.expiresAt || !state.settings.breakEnabled || time.status !== 'work' || !visible || preview)) reminder = null;
  lastTimeline = time;
  if (changed) persist();
  return { settings: state.settings, timeline: time, day: { ...day, menuName: MENUS[day.menu] }, error: storageError, preview, reminder };
}
function broadcast() {
  const value = snapshot();
  for (const window of [widgetWindow, settingsWindow]) if (window && !window.isDestroyed() && window.isVisible()) window.webContents.send('widget:update', value);
  return value;
}
function checkedBounds(saved, mini = state.settings.mini) {
  const primary = screen.getPrimaryDisplay().workArea;
  const valid = saved && ['x','y','width','height'].every(key => Number.isFinite(saved[key])) && Math.abs(saved.x) < 1000000 && Math.abs(saved.y) < 1000000 && saved.width > 0 && saved.width <= 1800 && saved.height > 0 && saved.height <= 700;
  const request = valid ? { x: Math.round(saved.x), y: Math.round(saved.y), width: Math.round(saved.width), height: Math.round(saved.height) } :
    { x: primary.x + primary.width - (mini ? 500 : 920), y: primary.y + primary.height - (mini ? 244 : 344), width: mini ? 480 : 900, height: mini ? 220 : 320 };
  const area = screen.getDisplayMatching(request).workArea;
  const width = Math.min(Math.max(request.width, mini ? 380 : 580), area.width), height = Math.min(Math.max(request.height, mini ? 200 : 240), area.height);
  return { width, height, x: Math.min(Math.max(request.x, area.x), area.x + area.width - width), y: Math.min(Math.max(request.y, area.y), area.y + area.height - height) };
}
function rememberBounds() {
  if (!state || !widgetWindow || widgetWindow.isDestroyed()) return;
  state.bounds = widgetWindow.getBounds();
  state[state.settings.mini ? 'miniBounds' : 'normalBounds'] = state.bounds;
}
function applyWidgetMode(previousMini) {
  const mini = state.settings.mini;
  if (previousMini === mini) return;
  const current = widgetWindow.getBounds();
  state[previousMini ? 'miniBounds' : 'normalBounds'] = current;
  widgetWindow.setMinimumSize(mini ? 380 : 580, mini ? 200 : 240);
  const saved = state[mini ? 'miniBounds' : 'normalBounds'];
  const width = mini ? 480 : 900, height = mini ? 220 : 320;
  widgetWindow.setBounds(checkedBounds(saved || { x: current.x + current.width - width, y: current.y + current.height - height, width, height }));
  rememberBounds(); persist();
}
function syncDisplay() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  widgetWindow.setOpacity(state.settings.opacity / 100);
  widgetWindow.setIgnoreMouseEvents(state.settings.clickThrough);
}
function toggleClickThrough() {
  state.settings.clickThrough = !state.settings.clickThrough;
  // Interaction recovery must still work if saving to disk fails.
  syncDisplay(); persist(); syncPin(); return broadcast();
}
function secureWindow(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
}
function preferences() { return { preload: path.join(ROOT, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: true }; }
function showWidget() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  widgetWindow.setBounds(checkedBounds(widgetWindow.getBounds()));
  if (widgetWindow.isMinimized()) widgetWindow.restore();
  widgetWindow.show(); widgetWindow.focus(); broadcast();
}
function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.show(); settingsWindow.focus(); return; }
  const area = screen.getDisplayMatching(widgetWindow.getBounds()).workArea;
  settingsWindow = new BrowserWindow({ width: Math.min(430, area.width), height: Math.min(730, area.height), parent: widgetWindow,
    title: '먼작귀 설정', icon: widgetIcon, autoHideMenuBar: true, resizable: false, show: false, backgroundColor: '#f6f8f5', webPreferences: preferences() });
  secureWindow(settingsWindow); settingsWindow.setAlwaysOnTop(state.settings.pin);
  settingsWindow.setIgnoreMouseEvents(false); settingsWindow.setOpacity(1);
  settingsWindow.loadFile(path.join(RENDERER, 'settings.html'));
  settingsWindow.once('ready-to-show', () => { settingsWindow.show(); broadcast(); });
  settingsWindow.on('closed', () => { settingsWindow = null; preview = null; if (!quitting) broadcast(); });
}
function syncPin() {
  widgetWindow.setAlwaysOnTop(state.settings.pin, 'floating');
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.setAlwaysOnTop(state.settings.pin);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '위젯 열기', click: showWidget }, { label: '설정', click: openSettings },
    { label: '미니 모드', type: 'checkbox', checked: state.settings.mini, click: () => { try { toggleMini(); } catch (error) { dialog.showErrorBox('먼작귀', error.message); } } },
    { label: '클릭 통과', type: 'checkbox', checked: state.settings.clickThrough, click: toggleClickThrough },
    { label: '항상 위에', type: 'checkbox', checked: state.settings.pin, click: () => { state.settings.pin = !state.settings.pin; persist(); syncPin(); broadcast(); } },
    { type: 'separator' }, { label: '종료', click: () => app.quit() }
  ]));
}
function toggleMini() {
  const previous = state.settings.mini; state.settings.mini = !previous;
  try { persist(true); } catch (error) { state.settings.mini = previous; throw error; }
  applyWidgetMode(previous); syncPin(); return broadcast();
}
function authorized(event, settingsOnly = false) {
  const window = BrowserWindow.fromWebContents(event.sender);
  const expected = window === settingsWindow ? 'settings.html' : window === widgetWindow ? 'index.html' : null;
  if (!expected || (settingsOnly && window !== settingsWindow) || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== pathToFileURL(path.join(RENDERER, expected)).href) throw new Error('허용되지 않은 창 요청입니다.');
}
async function start() {
  const profile = path.join(app.getPath('appData'), 'MeonjakkwiWidget');
  fs.mkdirSync(profile, { recursive: true }); app.setPath('userData', profile); file = path.join(profile, 'settings.json'); loadState();
  const icon = nativeImage.createFromPath(path.join(ROOT, 'assets', 'chiikawa-icon.png'));
  if (icon.isEmpty()) throw new Error('치이카와 아이콘 파일을 불러오지 못했습니다.');
  widgetIcon = icon;
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    let allowed = false;
    try { if (details.url.startsWith('file:')) {
      const filename = path.resolve(fileURLToPath(details.url));
      allowed = [RENDERER, path.join(ROOT, 'assets'), path.join(ROOT, 'node_modules', 'lucide', 'dist', 'umd')].some(folder => filename.startsWith(folder + path.sep));
    }} catch {}
    if (details.resourceType === 'image' && details.url.startsWith('data:image/png;base64,')) allowed = true;
    callback({ cancel: !allowed });
  });
  widgetWindow = new BrowserWindow({ ...checkedBounds(state.bounds), minWidth: state.settings.mini ? 380 : 580, minHeight: state.settings.mini ? 200 : 240, maxWidth: 1800, maxHeight: 700,
    title: '먼작귀', frame: false, resizable: true, show: false, backgroundColor: '#27323a', icon, webPreferences: preferences() });
  Menu.setApplicationMenu(null); secureWindow(widgetWindow); syncDisplay();
  tray = new Tray(icon.resize({ width: 32, height: 32 })); tray.setToolTip('먼작귀 업무시간 위젯'); tray.on('double-click', showWidget); syncPin();
  widgetWindow.loadFile(path.join(RENDERER, 'index.html'));
  widgetWindow.once('ready-to-show', () => { widgetWindow.show(); broadcast(); });
  widgetWindow.on('close', event => { if (!quitting) { event.preventDefault(); widgetWindow.hide(); } });
  widgetWindow.on('show', broadcast);
  const saveBounds = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { if (!widgetWindow || widgetWindow.isDestroyed()) return; rememberBounds(); persist(); }, 350); };
  widgetWindow.on('move', saveBounds); widgetWindow.on('resize', saveBounds);
  const recover = () => { widgetWindow.setBounds(checkedBounds(widgetWindow.getBounds())); broadcast(); };
  screen.on('display-removed', recover); screen.on('display-added', recover); screen.on('display-metrics-changed', recover);
  powerMonitor.on('resume', broadcast);
  ipcMain.handle('widget:state', event => { authorized(event); return snapshot(); });
  ipcMain.handle('widget:artwork', event => {
    authorized(event);
    if (event.sender !== widgetWindow.webContents) throw new Error('허용되지 않은 이미지 요청입니다.');
    artwork ||= Object.fromEntries([['characters', 'characters-atlas-v2.png'], ['food', 'food-atlas.png']].map(([key, name]) =>
      [key, 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'assets', name)).toString('base64')]));
    return artwork;
  });
  ipcMain.handle('widget:preview', (event, mode) => {
    authorized(event, true);
    if (mode !== null && !['walk', 'lunch', 'after', 'ambient'].includes(mode)) throw new Error('미리보기 종류를 확인해주세요.');
    preview = mode === null ? null : { mode, startedAt: Date.now(), expiresAt: Date.now() + 20000 };
    reminder = null;
    if (preview) { widgetWindow.show(); settingsWindow.focus(); }
    return broadcast();
  });
  ipcMain.handle('widget:action', (event, action) => {
    authorized(event);
    if (action === 'settings') openSettings();
    else if (action === 'pin') { state.settings.pin = !state.settings.pin; persist(); syncPin(); }
    else if (action === 'mini') return toggleMini();
    else if (action === 'sound') { state.settings.sound = !state.settings.sound; persist(); }
    else if (action === 'hide') widgetWindow.hide();
    else if (action === 'quit') { app.quit(); return null; }
    else throw new Error('알 수 없는 창 명령입니다.');
    return broadcast();
  });
  ipcMain.handle('widget:settings', (event, input) => {
    authorized(event, true); const settings = validateSettings(input), previous = state.settings; state.settings = settings;
    try { persist(true); } catch (error) { state.settings = previous; throw error; }
    // Editing a schedule is not an elapsed-time event.
    const scheduleChanged = ['start', 'end', 'lunchStart', 'lunchEnd'].some(key => settings[key] !== previous[key]) || settings.workdays.join() !== previous.workdays.join();
    if (scheduleChanged) lastTimeline = null;
    applyWidgetMode(previous.mini); syncDisplay(); syncPin(); return broadcast();
  });
  setInterval(broadcast, 1000);
}
