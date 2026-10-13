(function () {
  'use strict';
  const { DEFAULTS, MENUS, validateSettings, timeline } = window.WidgetSchedule;
  const STORAGE_KEY = 'meonjakkwi.web.v1';
  const shell = document.getElementById('widgetShell');
  const widgetFrame = document.getElementById('widgetFrame');
  const settingsFrame = document.getElementById('settingsFrame');
  const dialog = document.getElementById('settingsDialog');
  const subscriptions = new Set();
  let state, lastTimeline, preview = null, reminder = null, storageError = '', storedValue;

  function readState(raw) {
    const saved = raw ? JSON.parse(raw) : {};
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Invalid saved state');
    let settings;
    try { settings = validateSettings({ ...DEFAULTS, ...saved.settings, pin: false, clickThrough: false }); }
    catch { settings = { ...DEFAULTS, workdays: [...DEFAULTS.workdays] }; }
    const days = {};
    if (saved.days && typeof saved.days === 'object' && !Array.isArray(saved.days)) {
      for (const [key, day] of Object.entries(saved.days)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !day || !Number.isInteger(day.menu) || day.menu < 0 || day.menu >= MENUS.length) continue;
        days[key] = {
          menu: day.menu, departed: day.departed === true,
          animationAt: Number.isFinite(day.animationAt) ? day.animationAt : null,
          breakSlot: Number.isInteger(day.breakSlot) && day.breakSlot >= 0 ? day.breakSlot : 0,
          breakMinutes: [30, 45, 60, 90, 120].includes(day.breakMinutes) ? day.breakMinutes : 60,
          breakEnabled: day.breakEnabled === true
        };
      }
    }
    return { settings, days };
  }
  function load() {
    try { storedValue = localStorage.getItem(STORAGE_KEY); state = readState(storedValue); }
    catch { state = readState(null); storageError = '저장된 설정을 읽지 못했습니다. 브라우저 저장소 설정을 확인해주세요.'; }
  }
  function persist(strict = false) {
    try {
      const value = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY, value);
      storedValue = value; storageError = '';
    } catch {
      storageError = '브라우저에 저장하지 못했습니다. 저장소 접근 권한과 여유 공간을 확인해주세요.';
      if (strict) throw new Error(storageError);
    }
  }
  function snapshot() {
    const time = timeline(state.settings);
    let changed = false;
    if (!state.days[time.cycleKey]) {
      const random = crypto.getRandomValues(new Uint32Array(1))[0];
      state.days[time.cycleKey] = { menu: random % MENUS.length, departed: false, animationAt: null };
      changed = true;
    }
    const day = state.days[time.cycleKey];
    if (time.status === 'after' && !day.departed) {
      day.departed = true;
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
      const previousSlot = day.breakSlot;
      day.breakSlot = slot; changed = true;
      if (state.settings.breakEnabled && slot === previousSlot + 1 && time.status === 'work' &&
          lastTimeline?.cycleKey === time.cycleKey && lastTimeline.status === 'work' &&
          time.now - lastTimeline.now < 10000 && !document.hidden && !preview) {
        reminder = { id: time.cycleKey + ':' + day.breakMinutes + ':' + slot, expiresAt: time.now + 8000, text: '잠깐 쉬어갈까?' };
      }
    }
    if (reminder && (time.now >= reminder.expiresAt || !state.settings.breakEnabled || time.status !== 'work' || document.hidden || preview)) reminder = null;
    lastTimeline = time;
    if (changed) persist();
    return structuredClone({ settings: state.settings, timeline: time, day: { ...day, menuName: MENUS[day.menu] }, error: storageError, preview, reminder });
  }
  function display() {
    if (shell.classList.contains('mini') !== state.settings.mini) {
      shell.style.width = ''; shell.style.height = '';
      shell.classList.toggle('mini', state.settings.mini);
    }
    widgetFrame.style.opacity = String(state.settings.opacity / 100);
  }
  function broadcast() {
    display();
    const value = snapshot();
    for (const subscription of subscriptions) {
      try { subscription.callback(structuredClone(value)); }
      catch (error) { console.error('Widget update failed:', error); }
    }
    return value;
  }
  function openSettings() {
    if (!settingsFrame.hasAttribute('src')) settingsFrame.src = 'renderer/settings.html';
    if (!dialog.open) dialog.showModal();
  }
  function closeSettings() { if (dialog.open) dialog.close(); }
  function saveSettings(input) {
    const next = validateSettings({ ...input, pin: false, clickThrough: false });
    const previous = state.settings;
    state.settings = next;
    try { persist(true); } catch (error) { state.settings = previous; throw error; }
    const scheduleChanged = ['start', 'end', 'lunchStart', 'lunchEnd'].some(key => next[key] !== previous[key]) || next.workdays.join() !== previous.workdays.join();
    if (scheduleChanged) { lastTimeline = null; reminder = null; }
    return broadcast();
  }
  function action(name) {
    if (name === 'settings') openSettings();
    else if (name === 'sound' || name === 'mini') {
      const previous = state.settings[name];
      state.settings[name] = !previous;
      try { persist(true); } catch (error) { state.settings[name] = previous; throw error; }
    } else throw new Error('웹에서 사용할 수 없는 창 기능입니다.');
    return broadcast();
  }
  function previewAction(mode) {
    if (mode !== null && !['walk', 'lunch', 'after', 'ambient'].includes(mode)) throw new Error('미리보기 종류를 확인해주세요.');
    const now = Date.now();
    preview = mode === null ? null : { mode, startedAt: now, expiresAt: now + 20000 };
    reminder = null;
    return broadcast();
  }
  window.WidgetWebHost = Object.freeze({
    connect(view) {
      const isWidget = view === widgetFrame.contentWindow;
      const isSettings = view === settingsFrame.contentWindow;
      if (!isWidget && !isSettings) throw new Error('허용되지 않은 화면입니다.');
      const onlySettings = callback => (...args) => {
        if (!isSettings) throw new Error('설정 화면에서 요청해주세요.');
        return callback(...args);
      };
      return Object.freeze({
        getState: snapshot,
        getArtwork: () => {
          if (!isWidget) throw new Error('허용되지 않은 이미지 요청입니다.');
          return { characters: new URL('assets/characters-atlas-v2.png', location.href).href, food: new URL('assets/food-atlas.png', location.href).href };
        },
        saveSettings: onlySettings(saveSettings),
        preview: onlySettings(previewAction),
        closeSettings: onlySettings(closeSettings),
        action: name => {
          if (!isWidget) throw new Error('위젯 화면에서 요청해주세요.');
          return action(name);
        },
        onState: callback => {
          if (typeof callback !== 'function') throw new Error('화면 콜백을 확인해주세요.');
          const subscription = { view, callback };
          subscriptions.add(subscription);
          view.addEventListener('pagehide', event => { if (!event.persisted) subscriptions.delete(subscription); }, { once: true });
          return () => subscriptions.delete(subscription);
        }
      });
    }
  });
  load(); display();
  window.lucide?.createIcons();
  document.getElementById('closeSettings').addEventListener('click', closeSettings);
  dialog.addEventListener('click', event => { if (event.target === dialog) closeSettings(); });
  dialog.addEventListener('close', () => {
    preview = null; broadcast();
    widgetFrame.contentWindow?.document.getElementById('settings')?.focus();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { reminder = null; broadcast(); }
  });
  window.addEventListener('pageshow', broadcast);
  window.addEventListener('storage', event => {
    if (event.storageArea !== localStorage || (event.key !== STORAGE_KEY && event.key !== null) || event.newValue === storedValue) return;
    try {
      state = readState(event.newValue); storedValue = event.newValue;
      storageError = ''; lastTimeline = null; reminder = null;
      broadcast();
    } catch { storageError = '다른 탭에서 저장한 설정을 읽지 못했습니다.'; broadcast(); }
  });
  setInterval(() => { if (!document.hidden) broadcast(); }, 1000);
  window.dispatchEvent(new Event('widget:web-ready'));
})();
