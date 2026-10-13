(function () {
  'use strict';
  const config = window.WidgetDownloadConfig;
  const button = document.getElementById('downloadButton');
  const status = document.getElementById('downloadStatus');
  const prefix = '/ajttk369/chiikawa-work-widget/releases/download/';
  try {
    if (!config?.installer) return;
    const installer = config.installer, url = new URL(installer.url);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password ||
        !url.pathname.startsWith(prefix) || !url.pathname.endsWith('.exe')) return;
    button.href = url.href;
    button.removeAttribute('aria-disabled');
    button.removeAttribute('role');
    button.removeAttribute('tabindex');
    const size = Number.isFinite(installer.size) && installer.size > 0 ? ' · ' + Math.round(installer.size / 1048576) + ' MB' : '';
    status.textContent = 'Windows 64비트 · ' + String(installer.version || '배포 버전') + size;
  } catch { status.textContent = '설치 파일 준비 중'; }
})();
