function createUpdater({ app, dialog, getParent, beforeInstall, onStateChange }) {
  const enabled = app.isPackaged && process.platform === 'win32';
  let phase = enabled ? 'idle' : 'disabled', version = '', percent = 0;
  let updater, disposed = false, promptOpen = false, lastCheck = 0, lastPrompted = '', lastError = null;
  let startupTimer, periodicTimer;

  function change(next) {
    if (disposed) return;
    phase = next;
    onStateChange();
  }
  async function message(options) {
    if (disposed || promptOpen) return null;
    promptOpen = true;
    try {
      const parent = getParent();
      const config = { title: '먼작귀 업데이트', noLink: true, ...options };
      return await (parent ? dialog.showMessageBox(parent, config) : dialog.showMessageBox(config));
    } finally { promptOpen = false; }
  }
  async function failure() {
    try {
      await message({ type: 'warning', message: '업데이트를 완료하지 못했어요.',
        detail: '인터넷 연결과 GitHub Release의 설치 파일·latest.yml을 확인한 뒤 다시 시도해주세요. 위젯은 그대로 사용할 수 있어요.', buttons: ['확인'] });
    } catch (error) { console.error('Update dialog failed:', error.message); }
  }
  async function install() {
    if (disposed || phase !== 'downloaded' || promptOpen) return;
    try {
      const answer = await message({ type: 'info', message: `v${version} 업데이트가 준비됐어요.`,
        detail: '위젯을 종료하고 새 버전을 설치한 뒤 다시 실행합니다. 업무 설정과 기록은 유지됩니다.',
        buttons: ['재시작하고 적용', '나중에'], defaultId: 1, cancelId: 1 });
      if (disposed || answer?.response !== 0) return;
      beforeInstall();
      lastError = null;
      change('installing');
      updater.quitAndInstall(false, true);
      if (lastError) await failure();
    } catch (error) {
      console.error('Update installation failed:', error.message);
      change('downloaded');
      await failure();
    }
  }
  async function offer() {
    if (disposed || phase !== 'available' || promptOpen) return;
    try {
      lastPrompted = version;
      const answer = await message({ type: 'info', message: `새 버전 v${version}이 있어요.`,
        detail: `현재 버전은 v${app.getVersion()}입니다. 다운로드 후에도 재시작 여부를 직접 선택할 수 있어요.`,
        buttons: ['다운로드', '나중에'], defaultId: 1, cancelId: 1 });
      if (disposed || answer?.response !== 0) return;
      lastError = null;
      percent = 0;
      change('downloading');
      await updater.downloadUpdate();
      if (disposed) return;
      change('downloaded');
      await install();
    } catch (error) {
      console.error('Update download failed:', error.message);
      change('available');
      await failure();
    }
  }
  async function check(manual = false) {
    if (disposed || !updater || promptOpen || ['checking', 'downloading', 'installing'].includes(phase)) return;
    if (phase === 'downloaded') { if (manual) await install(); return; }
    if (manual && phase === 'available') { await offer(); return; }
    if (!manual && Date.now() - lastCheck < 15 * 60 * 1000) return;
    lastCheck = Date.now();
    try {
      change('checking');
      const result = await updater.checkForUpdates();
      if (disposed) return;
      if (!result) { change('idle'); return; }
      if (result.isUpdateAvailable) {
        version = result.updateInfo.version;
        change('available');
        if (manual || lastPrompted !== version) await offer();
      } else {
        version = '';
        change('idle');
        if (manual) await message({ type: 'info', message: `현재 v${app.getVersion()}이 최신 버전이에요.`, buttons: ['확인'] });
      }
    } catch (error) {
      console.error('Update check failed:', error.message);
      change('idle');
      if (manual) await failure();
    }
  }
  function menuItems() {
    const labels = {
      disabled: '업데이트: 설치된 Windows 앱에서 사용',
      idle: '업데이트 확인', checking: '업데이트 확인 중...',
      available: `v${version} 다운로드`, downloading: `업데이트 다운로드 중 (${percent}%)`,
      downloaded: `v${version} 재시작하고 업데이트`, installing: '업데이트 적용 중...'
    };
    return [{ label: `${labels[phase]} · 현재 v${app.getVersion()}`,
      enabled: !['disabled', 'checking', 'downloading', 'installing'].includes(phase), click: () => { void check(true); } }];
  }
  if (enabled) {
    try {
      updater = require('electron-updater').autoUpdater;
      updater.autoDownload = false;
      updater.autoInstallOnAppQuit = false;
      updater.allowPrerelease = false;
      updater.allowDowngrade = false;
      updater.disableWebInstaller = true;
      updater.on('error', error => {
        lastError = error;
        console.error('Auto updater:', error.message);
        if (phase === 'installing') change('downloaded');
      });
      updater.on('download-progress', progress => {
        const next = Math.max(0, Math.min(100, Math.floor(progress.percent || 0)));
        if (phase === 'downloading' && next !== percent) { percent = next; onStateChange(); }
      });
      // The updater uses its own network session; renderer requests remain local-only.
      updater.netSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      updater.netSession.setPermissionCheckHandler(() => false);
      startupTimer = setTimeout(() => { void check(); }, 8000);
      periodicTimer = setInterval(() => { void check(); }, 60 * 60 * 1000);
    } catch (error) {
      console.error('Auto updater unavailable:', error.message);
      updater = null;
      phase = 'disabled';
    }
  }
  return { check, menuItems, dispose() { disposed = true; clearTimeout(startupTimer); clearInterval(periodicTimer); } };
}

module.exports = { createUpdater };
