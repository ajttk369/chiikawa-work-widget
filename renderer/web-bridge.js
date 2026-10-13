(function () {
  'use strict';
  if (window.widget || !/^https?:$/.test(location.protocol)) return;
  document.body.classList.add('web');
  for (const id of ['pin', 'hide', 'quit']) {
    const button = document.getElementById(id);
    if (button) button.hidden = true;
  }
  const clickThrough = document.getElementById('clickThrough');
  if (clickThrough) clickThrough.closest('label').hidden = true;
  const ready = new Promise((resolve, reject) => {
    try {
      if (window.parent === window) throw new Error('사이트 첫 화면에서 위젯을 열어주세요.');
      const connect = () => resolve(window.parent.WidgetWebHost.connect(window));
      if (window.parent.WidgetWebHost) connect();
      else window.parent.addEventListener('widget:web-ready', connect, { once: true });
    } catch (error) { reject(error); }
  });
  const invoke = (method, ...args) => ready.then(api => api[method](...args));
  window.widget = Object.freeze({
    getState: () => invoke('getState'),
    getArtwork: () => invoke('getArtwork'),
    saveSettings: input => invoke('saveSettings', input),
    preview: mode => invoke('preview', mode),
    action: action => invoke('action', action),
    onState: callback => {
      let remove, cancelled = false;
      ready.then(api => { if (!cancelled) remove = api.onState(callback); }).catch(() => {});
      return () => { cancelled = true; remove?.(); };
    }
  });
  if (location.pathname.endsWith('/settings.html')) document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); invoke('closeSettings').catch(() => {}); }
  });
})();
