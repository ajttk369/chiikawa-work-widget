const $ = selector => document.querySelector(selector);
let current, currentPreview = null, dirty = false, busy = false, previewBusy = false;
const edited = new Set();
let previewPendingMode;
function syncPreviewControls() {
  $('#previewPlay').disabled = previewBusy;
  $('#previewStop').disabled = previewBusy || !currentPreview;
  $('#previewPlay').setAttribute('aria-busy', String(previewBusy && previewPendingMode !== null));
  $('#previewStop').setAttribute('aria-busy', String(previewBusy && previewPendingMode === null));
}
async function withDeadline(request) {
  let timer;
  try {
    return await Promise.race([request, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.')), 5000);
    })]);
  } finally { clearTimeout(timer); }
}
const DEFAULTS = { start: '09:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00', workdays: [1,2,3,4,5], size: 116, sound: false, mini: false, ambient: true, breakEnabled: false, breakMinutes: 60, clickThrough: false, opacity: 100, background: 'auto', characters: ['chiikawa', 'hachiware', 'usagi'] };
function syncCharacterControls() {
  const inputs = [...document.querySelectorAll('[name=character]')];
  const count = inputs.filter(input => input.checked).length;
  $('#characterCount').textContent = count + ' / 3';
  for (const input of inputs) input.disabled = count >= 3 && !input.checked;
}
async function fillPortraits() {
  const load = source => new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('친구 이미지를 불러오지 못했습니다.')); image.src = source;
  });
  const artwork = await window.widget.getArtwork();
  const [atlas, momonga] = await Promise.all([load(artwork.characters), load(artwork.momonga)]);
  const frames = window.WidgetCharacters.prepare(atlas, momonga);
  for (const input of document.querySelectorAll('[name=character]')) {
    const canvas = input.parentElement.querySelector('canvas');
    canvas.getContext('2d').drawImage(frames[input.value][0], 0, 0);
  }
}
function fill(settings) {
  for (const field of ['start','end','lunchStart','lunchEnd','size']) $('#' + field).value = settings[field];
  $('#opacity').value = settings.opacity ?? DEFAULTS.opacity;
  $('#background').value = settings.background ?? DEFAULTS.background;
  for (const field of ['sound', 'mini', 'ambient', 'breakEnabled', 'clickThrough']) $('#' + field).checked = settings[field];
  $('#breakMinutes').value = settings.breakMinutes;
  $('#breakMinutes').disabled = !settings.breakEnabled;
  for (const input of document.querySelectorAll('[name=day]')) input.checked = settings.workdays.includes(Number(input.value));
  for (const input of document.querySelectorAll('[name=character]')) input.checked = (settings.characters || DEFAULTS.characters).includes(input.value);
  syncCharacterControls();
  $('#sizeOutput').textContent = `${settings.size}px`;
  $('#opacityOutput').textContent = $('#opacity').value + '%';
}
function feedback(message, error = false) { $('#feedback').textContent = message; $('#feedback').classList.toggle('error', error); }
function update(value) {
  current = value.settings; if (!dirty) fill(current);
  else for (const field of ['sound', 'mini', 'ambient', 'breakEnabled', 'clickThrough']) if (!edited.has(field)) $('#' + field).checked = current[field];
  if (dirty && !edited.has('characters')) {
    for (const input of document.querySelectorAll('[name=character]')) input.checked = (current.characters || DEFAULTS.characters).includes(input.value);
    syncCharacterControls();
  }
  $('#breakMinutes').disabled = !$('#breakEnabled').checked;
  const preview = value.preview && value.preview.expiresAt > value.timeline.now ? value.preview : null;
  currentPreview = preview;
  syncPreviewControls();
  const names = { walk: '양방향 걷기', lunch: '점심 식사', after: '퇴근 인사', ambient: '소소한 행동' };
  $('#previewState').textContent = preview ? names[preview.mode] + ' · ' + Math.max(0, Math.ceil((preview.expiresAt - value.timeline.now) / 1000)) + '초' : '';
}
$('#settingsForm').addEventListener('input', event => {
  if (event.target.id === 'previewMode') return;
  edited.add(event.target.name === 'character' ? 'characters' : event.target.id || 'workdays');
  if (event.target.name === 'character') syncCharacterControls();
  dirty = true; $('#sizeOutput').textContent = $('#size').value + 'px';
  $('#opacityOutput').textContent = $('#opacity').value + '%';
  $('#breakMinutes').disabled = !$('#breakEnabled').checked; feedback('');
});
$('#reset').addEventListener('click', () => { fill(DEFAULTS); for (const field of Object.keys(DEFAULTS)) edited.add(field); dirty = true; feedback(''); });
$('#settingsForm').addEventListener('submit', async event => {
  event.preventDefault(); if (busy || !current) return;
  const input = { ...current, characters: [...document.querySelectorAll('[name=character]:checked')].map(node => node.value), workdays: [...document.querySelectorAll('[name=day]:checked')].map(node => Number(node.value)), sound: $('#sound').checked, size: Number($('#size').value), mini: $('#mini').checked, ambient: $('#ambient').checked,
    breakEnabled: $('#breakEnabled').checked, breakMinutes: Number($('#breakMinutes').value),
    clickThrough: $('#clickThrough').checked, opacity: Number($('#opacity').value), background: $('#background').value };
  for (const field of ['start','end','lunchStart','lunchEnd']) input[field] = $('#' + field).value;
  busy = true; $('#save').disabled = true; $('#save').setAttribute('aria-busy', 'true');
  try { const result = await window.widget.saveSettings(input); dirty = false; edited.clear(); update(result); feedback('저장했습니다.'); }
  catch (error) { feedback(error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''), true); }
  finally { busy = false; $('#save').disabled = false; $('#save').setAttribute('aria-busy', 'false'); }
});
async function preview(mode) {
  if (previewBusy || !window.widget) return;
  previewBusy = true; previewPendingMode = mode; syncPreviewControls();
  try { const result = await withDeadline(window.widget.preview(mode)); update(result); feedback(''); }
  catch (error) { feedback(error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''), true); }
  finally { previewBusy = false; previewPendingMode = undefined; syncPreviewControls(); }
}
$('#previewPlay').addEventListener('click', () => preview($('#previewMode').value));
$('#previewStop').addEventListener('click', () => preview(null));
async function start() {
  window.lucide?.createIcons();
  if (!window.widget) { feedback('Electron 앱으로 실행해주세요.', true); return; }
  window.widget.onState(update);
  try { update(await window.widget.getState()); } catch (error) { feedback(error.message, true); }
  try { await fillPortraits(); } catch (error) { feedback(error.message, true); }
}
start();
