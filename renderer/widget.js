const $ = selector => document.querySelector(selector);
const icons = () => window.lucide?.createIcons({ attrs: { 'stroke-width': 1.7 } });
const spriteRows = [{ y: 28, height: 279 }, { y: 309, height: 263 }, { y: 573, height: 305 }];
const spriteColumns = [23, 314, 605, 896, 1187, 1478];
const DEPARTURE_MS = 35000;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
function loadImage(source) {
  const image = new Image();
  const ready = new Promise((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('장면 이미지를 불러오지 못했습니다.'));
    image.src = source;
  });
  return { image, ready };
}
let atlas, meals;
let data, audio, width = 0, fieldWidth = 0, size = 116;
let raf = 0, lastFrame = 0, clockAt = 0, lastStatus = '', lastCycle = '', lastSoundEvent = '', hiddenAt = 0;
let spriteFrames = [], mealFrames = [];
let visualKey = '', previewAnchors = [], lastPreviewCue = -1, nextAmbientAt = 0, ambientTurn = 2, lastReminderId = '';
const actors = [...document.querySelectorAll('.character')].map((node, index) => ({
  node, sprite: node.querySelector('.sprite'), speech: node.querySelector('.speech'), index,
  x: 0, target: 0, goal: 0, speed: 13 + index * 1.3, velocity: 0, direction: -1, painted: '',
  walking: false, walkPhase: 0, lift: 0, action: null,
  nextMove: 0, nextBlink: 0, blinkEnd: 0, petEnd: 0
}));
function showError(error) { $('#error').textContent = error.message || '요청을 처리하지 못했습니다.'; $('#error').hidden = false; }
function opaqueBounds(canvas) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const offset = (y * canvas.width + x) * 4;
    if (pixels[offset + 3] < 180 || (pixels[offset] > 190 && pixels[offset + 1] < 100 && pixels[offset + 2] < 100)) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error('이미지의 표시 영역을 찾지 못했습니다.');
  left = Math.max(0, left - 2); top = Math.max(0, top - 2);
  right = Math.min(canvas.width - 1, right + 2); bottom = Math.min(canvas.height - 1, bottom + 2);
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
function canvasCrop(image, x, y, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width); canvas.height = Math.ceil(height);
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
  return { canvas, bounds: opaqueBounds(canvas) };
}
function prepareSprites() {
  const scaleX = atlas.image.naturalWidth / 1774, scaleY = atlas.image.naturalHeight / 887;
  // Normalize transparent padding, body size and soles once, not on every animation frame.
  spriteFrames = spriteRows.map(row => {
    const sources = spriteColumns.map(x => canvasCrop(atlas.image, x * scaleX, row.y * scaleY, 280 * scaleX, row.height * scaleY));
    const base = sources[0].bounds, height = Math.min(300, Math.round(230 * base.height / base.width));
    const frames = sources.map(({ canvas: source, bounds }) => {
      const frame = document.createElement('canvas'); frame.width = 300; frame.height = 340;
      const context = frame.getContext('2d'); context.imageSmoothingQuality = 'high';
      context.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, 35, 326 - height, 230, height);
      return frame;
    });
    // Keep the same upper body in both walking frames; alternate only the feet.
    const feetTop = 326 - Math.round(height * .16);
    const stableStep = document.createElement('canvas'); stableStep.width = 300; stableStep.height = 340;
    const context = stableStep.getContext('2d');
    context.drawImage(frames[1], 0, 0);
    context.clearRect(0, feetTop, 300, 340 - feetTop);
    context.drawImage(frames[2], 0, feetTop, 300, 340 - feetTop, 0, feetTop, 300, 340 - feetTop);
    frames[2] = stableStep;
    return frames;
  });
  const cellWidth = meals.image.naturalWidth / 3, cellHeight = meals.image.naturalHeight / 2;
  mealFrames = Array.from({ length: 6 }, (_, index) => canvasCrop(meals.image, (index % 3) * cellWidth, Math.floor(index / 3) * cellHeight, cellWidth, cellHeight));
}
function paintSprite(actor, frame, bite) {
  if (!spriteFrames.length) return;
  const walkingFrame = frame === 1 || frame === 2;
  const reflected = walkingFrame && actor.direction > 0;
  const menu = frame === 5 ? data.day.menu : -1;
  const key = [frame, reflected, menu, frame === 5 ? bite : 0].join(':');
  if (actor.painted === key) return;
  const context = actor.sprite.getContext('2d');
  context.clearRect(0, 0, 300, 340); context.save();
  if (reflected) { context.translate(300, 0); context.scale(-1, 1); }
  context.drawImage(spriteFrames[actor.index][frame], 0, 0);
  context.restore();
  if (menu >= 0) {
    const { canvas, bounds } = mealFrames[menu];
    const scale = Math.min(64 / bounds.width, 64 / bounds.height);
    const w = bounds.width * scale, h = bounds.height * scale;
    context.drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, 150 - w / 2, 263 - h / 2 - bite * 1.5, w, h);
  }
  actor.painted = key;
}
function remaining(target, now) {
  const minutes = Math.max(0, Math.ceil((target - now) / 60000));
  if (!minutes) return '잠시 후';
  return minutes >= 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분` : `${minutes}분`;
}
function sound() {
  if (!data?.settings.sound || document.hidden) return;
  try {
    audio ||= new AudioContext();
    if (audio.state !== 'running') return;
    for (const [index, frequency] of [659.25, 783.99].entries()) {
      const oscillator = audio.createOscillator(), gain = audio.createGain(), start = audio.currentTime + index * .12;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.035, start + .02); gain.gain.exponentialRampToValueAtTime(.001, start + .18);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(start); oscillator.stop(start + .2);
    }
  } catch {}
}
function layout() {
  const scene = $('#scene'), next = scene.clientWidth, oldField = fieldWidth;
  size = Math.round(Math.min(data?.settings.size || 116, data?.settings.mini ? 88 : 144, scene.clientHeight * .58, next / 4.2));
  fieldWidth = next; width = next;
  document.documentElement.style.setProperty('--pet-size', size + 'px');
  document.documentElement.style.setProperty('--pet-height', size * 340 / 300 + 'px');
  for (const actor of actors) {
    const spawn = fieldWidth * ((actor.index + .5) / 3) - size / 2;
    actor.x = oldField ? actor.x / oldField * fieldWidth : spawn;
    if (!oldField && data?.timeline.status === 'after' && !isDeparting(data.timeline.now)) actor.x = width - (3 - actor.index) * (size + 8) - 10;
    actor.x = clamp(actor.x, 10, fieldWidth - size - 10);
    actor.nextMove = 0; actor.velocity = 0; actor.walking = false;
  }
  // Reflow once on resize, never push a moving friend back and forth each frame.
  for (let i = 1; i < actors.length; i++) actors[i].x = Math.max(actors[i].x, actors[i - 1].x + size + 8);
  actors[2].x = Math.min(actors[2].x, fieldWidth - size - 10);
  for (let i = 1; i >= 0; i--) actors[i].x = Math.min(actors[i].x, actors[i + 1].x - size - 8);
}
function weather(now) {
  const date = new Date(now), hour = date.getHours() + date.getMinutes() / 60;
  let sunset = 0, night = 0;
  const background = data?.settings.background || 'auto';
  if (background === 'day') { sunset = 0; night = 0; }
  else if (background === 'sunset') sunset = 1;
  else if (background === 'night') night = 1;
  else if (hour < 6) night = 1;
  else if (hour < 8) night = (8 - hour) / 2;
  else if (hour >= 17 && hour < 19) sunset = (hour - 17) / 2;
  else if (hour >= 19 && hour < 21) { sunset = 1; night = (hour - 19) / 2; }
  else if (hour >= 21) night = 1;
  $('#sunset').style.opacity = sunset; $('#night').style.opacity = night;
}
function sceneNow(tick = performance.now()) { return data.timeline.now + Math.max(0, tick - clockAt); }
function isDeparting(now) {
  return data.timeline.status === 'after' && Number.isFinite(data.day.animationAt) && now >= data.day.animationAt && now - data.day.animationAt < DEPARTURE_MS;
}
function previewMode(now = sceneNow()) {
  return data.preview && now < data.preview.expiresAt ? data.preview.mode : null;
}
function visualStatus(now = sceneNow()) {
  const mode = previewMode(now);
  return mode === 'lunch' ? 'lunch' : mode === 'after' ? 'after' : mode ? 'work' : data.timeline.status;
}
function renderSceneMessage(now, tick = performance.now()) {
  const mode = previewMode(now), status = visualStatus(now);
  $('#previewBadge').hidden = !mode;
  $('#previewBadge').title = mode ? { walk: '양방향 걷기', lunch: '점심 식사', after: '퇴근 인사', ambient: '소소한 행동' }[mode] : '';
  const text = status === 'lunch' ? '점심시간! 오늘은 ' + data.day.menuName :
    mode === 'after' || (!mode && isDeparting(now)) ? '오늘도 수고했어!' :
    !mode && data.reminder && now < data.reminder.expiresAt ? data.reminder.text : '';
  if ($('#story').textContent !== text) $('#story').textContent = text;
  $('#story').hidden = !text || actors.some(actor => actor.petEnd > tick);
  $('#food').hidden = status !== 'lunch';
}
function beginAction(actor, tick) {
  const kind = ['hello', 'look', 'hop'][actor.index];
  actor.action = { kind, start: tick, end: tick + 2400 };
  actor.velocity = 0; actor.walking = false; actor.target = actor.x; actor.nextMove = tick + 4200;
  actor.speech.textContent = ['안녕!', '뭐 해?', '야하!'][actor.index];
  if (kind === 'look') {
    const neighbor = actors.filter(other => other !== actor).sort((a, b) => Math.abs(a.x - actor.x) - Math.abs(b.x - actor.x))[0];
    actor.direction = neighbor.x > actor.x ? 1 : -1;
  }
}
function scheduleBehaviors(tick, now) {
  for (const actor of actors) if (actor.action && tick >= actor.action.end) actor.action = null;
  const mode = previewMode(now);
  if (mode === 'ambient') {
    const elapsed = now - data.preview.startedAt, stage = Math.floor(elapsed / 6000), within = elapsed % 6000;
    if (stage < 3 && stage !== lastPreviewCue && within >= 1000 && within < 3400 &&
        !actors.some(actor => actor.action || actor.petEnd > tick)) {
      beginAction(actors[stage], tick); lastPreviewCue = stage;
    }
    return;
  }
  if (mode || !data.settings.ambient || visualStatus(now) === 'lunch' || isDeparting(now) || data.reminder) return;
  if (tick < nextAmbientAt || actors.some(actor => actor.action || actor.petEnd > tick)) return;
  const order = [1, 2, 3].map(offset => (ambientTurn + offset) % 3);
  const index = order.find(index => !actors[index].walking && Math.abs(actors[index].velocity) < .6);
  if (index === undefined) { nextAmbientAt = tick + 1500; return; }
  beginAction(actors[index], tick); ambientTurn = index;
  nextAmbientAt = tick + 24000 + Math.random() * 16000;
}
function syncVisualState(tick, now) {
  const mode = previewMode(now), key = mode ? 'preview:' + data.preview.startedAt : 'live:' + data.timeline.cycleKey + ':' + data.timeline.status;
  if (key !== visualKey) {
    visualKey = key; lastPreviewCue = -1;
    previewAnchors = actors.map(actor => actor.x);
    nextAmbientAt = tick + 18000 + Math.random() * 12000;
    actors.forEach(actor => { actor.action = null; actor.velocity = 0; actor.walking = false; actor.nextMove = 0; });
  }
  return mode;
}
function update(value) {
  const resized = !data || data.settings.size !== value.settings.size || data.settings.mini !== value.settings.mini;
  data = value; clockAt = performance.now();
  document.body.classList.toggle('mini', value.settings.mini);
  const mode = syncVisualState(clockAt, value.timeline.now);
  if ((!value.settings.ambient && mode !== 'ambient') || value.reminder) actors.forEach(actor => { actor.action = null; });
  $('#error').hidden = !value.error;
  if (value.error) $('#error').textContent = value.error;
  const t = value.timeline, local = new Date(t.now);
  $('#clock').textContent = String(local.getHours()).padStart(2, '0') + ':' + String(local.getMinutes()).padStart(2, '0');
  $('#status').textContent = t.label; $('#status').dataset.state = t.status;
  $('#remaining').textContent = { before: '출근까지', work: '퇴근까지', lunch: '점심 끝까지', after: '다음 출근까지', off: '다음 출근까지' }[t.status] + ' ' + remaining(t.target, t.now);
  $('#secondary').textContent = t.status === 'work' ? Math.round(t.progress) + '%' + (t.now < t.shift.lunchStart ? ' · 점심까지 ' + remaining(t.shift.lunchStart, t.now) : '') : t.status === 'lunch' ? value.day.menuName : t.status === 'after' ? '오늘도 수고했어' : '';
  for (const id of ['remaining', 'secondary']) $('#' + id).title = $('#' + id).textContent;
  $('#progressFill').style.width = t.progress + '%'; $('.progress').setAttribute('aria-valuenow', Math.round(t.progress));
  $('#pin').setAttribute('aria-pressed', String(value.settings.pin));
  $('#sound').setAttribute('aria-pressed', String(value.settings.sound));
  $('#sound').title = value.settings.sound ? '소리 끄기' : '소리 켜기'; $('#sound').setAttribute('aria-label', $('#sound').title);
  const soundName = value.settings.sound ? 'volume-2' : 'volume-x';
  if ($('#sound').dataset.icon !== soundName) {
    $('#sound').dataset.icon = soundName;
    $('#sound').replaceChildren(); const soundIcon = document.createElement('i'); soundIcon.dataset.lucide = soundName; $('#sound').append(soundIcon); icons();
  }
  $('#mini').setAttribute('aria-pressed', String(value.settings.mini));
  $('#mini').title = value.settings.mini ? '기본 크기로 돌아가기' : '미니 모드'; $('#mini').setAttribute('aria-label', $('#mini').title);
  const miniIcon = value.settings.mini ? 'maximize-2' : 'minimize-2';
  if ($('#mini').dataset.icon !== miniIcon) {
    $('#mini').dataset.icon = miniIcon; $('#mini').replaceChildren();
    const glyph = document.createElement('i'); glyph.dataset.lucide = miniIcon; $('#mini').append(glyph); icons();
  }
  weather(t.now);
  renderSceneMessage(t.now);
  $('#food').style.left = (fieldWidth || $('#scene').clientWidth) / 2 + 'px';
  $('#food').style.backgroundPosition = (value.day.menu % 3) * 50 + '% ' + Math.floor(value.day.menu / 3) * 100 + '%';
  if (lastCycle !== t.cycleKey || lastStatus !== t.status) {
    if (!mode) actors.forEach(actor => { actor.nextMove = 0; actor.velocity = 0; });
    const eventId = t.cycleKey + ':' + t.status;
    if (!mode && lastStatus && eventId !== lastSoundEvent && (t.status === 'lunch' || isDeparting(t.now))) { sound(); lastSoundEvent = eventId; }
    lastCycle = t.cycleKey; lastStatus = t.status;
  }
  if (value.reminder && value.reminder.id !== lastReminderId && !mode) { lastReminderId = value.reminder.id; sound(); }
  if (resized) { layout(); if (mode) previewAnchors = actors.map(actor => actor.x); }
  if (spriteFrames.length && !document.hidden && !raf) {
    lastFrame = performance.now(); raf = requestAnimationFrame(draw);
  }
}
function targetFor(actor, tick) {
  const now = sceneNow(tick), mode = previewMode(now), status = visualStatus(now);
  if (actor.action && tick < actor.action.end) return actor.x;
  if (mode === 'ambient') return actor.x;
  if (mode === 'walk') {
    const phase = Math.floor((now - data.preview.startedAt) / 6500) % 2;
    return (previewAnchors[actor.index] ?? actor.x) - (phase ? 0 : Math.min(60, size * .6));
  }
  if (status === 'lunch') return fieldWidth / 2 + (actor.index - 1) * (size + 12) - size / 2;
  if (status === 'after') return width - (3 - actor.index) * (size + 8) - 10;
  if (tick >= actor.nextMove) {
    const slot = (fieldWidth - 24) / 3;
    const min = 12 + actor.index * slot + 5, max = 12 + (actor.index + 1) * slot - size - 5;
    actor.target = min + Math.random() * Math.max(0, max - min);
    actor.nextMove = tick + 6000 + Math.random() * 9000;
  }
  return actor.target;
}
function draw(tick) {
  raf = 0;
  if (document.hidden || !data || !spriteFrames.length) return;
  if (tick - lastFrame < 32) { raf = requestAnimationFrame(draw); return; }
  const dt = Math.min(.08, (tick - lastFrame) / 1000 || .033), now = sceneNow(tick);
  const pixelRatio = window.devicePixelRatio || 1;
  lastFrame = tick;
  syncVisualState(tick, now);
  scheduleBehaviors(tick, now);
  const positions = actors.map(actor => actor.x);
  const next = actors.map((actor, index) => {
    actor.goal = clamp(targetFor(actor, tick), 10, fieldWidth - size - 10);
    const delta = actor.goal - actor.x;
    if (actor.petEnd > tick) { actor.velocity = 0; return actor.x; }
    const min = index ? (positions[index - 1] + positions[index] + size) / 2 + 4 : 10;
    const max = index < actors.length - 1 ? (positions[index] + positions[index + 1] - size) / 2 - 4 : fieldWidth - size - 10;
    if (Math.abs(delta) < .4) { actor.velocity = 0; return clamp(actor.goal, min, max); }
    const moveSpeed = previewMode(now) === 'after' ? Math.max(actor.speed, Math.min(40, width / 24)) : actor.speed;
    let desired = Math.sign(delta) * Math.min(moveSpeed, Math.abs(delta) * 2);
    desired = clamp(desired, -Math.max(0, actor.x - min) * 2, Math.max(0, max - actor.x) * 2);
    actor.velocity += (desired - actor.velocity) * (1 - Math.exp(-dt * 4));
    const step = actor.velocity * dt;
    const candidate = Math.sign(step) === Math.sign(delta) && Math.abs(step) >= Math.abs(delta) ? actor.goal : actor.x + step;
    const bounded = clamp(candidate, min, max);
    if (Math.abs(bounded - candidate) > .001) actor.velocity = 0;
    return bounded;
  });
  actors.forEach((actor, index) => {
    const movement = next[index] - actor.x, speed = Math.abs(movement) / dt;
    const petting = actor.petEnd > tick, action = actor.action && tick < actor.action.end ? actor.action : null;
    if (petting || speed < .6) actor.walking = false;
    else if (speed > 2) actor.walking = true;
    if (speed > 2) actor.direction = movement > 0 ? 1 : -1;
    if (actor.walking) actor.walkPhase += Math.abs(movement) / Math.max(8, size * .09) * Math.PI;
    actor.x = next[index]; actor.node.style.left = Math.round(actor.x * pixelRatio) / pixelRatio + 'px';
    actor.node.hidden = false; actor.node.disabled = false;
    actor.node.style.opacity = 1; actor.node.style.transform = '';
    actor.node.classList.toggle('walking', actor.walking && !petting);
    actor.node.classList.toggle('petting', petting);
    const eating = visualStatus(now) === 'lunch' && !actor.walking;
    actor.node.classList.toggle('eating', eating);
    actor.node.classList.toggle('resting', !actor.walking && !petting && !eating && !action);
    if (tick > actor.nextBlink) { actor.blinkEnd = tick + 160; actor.nextBlink = tick + 2500 + Math.random() * 4000; }
    const frame = petting ? 4 : eating ? 5 : action ? (action.kind === 'look' ? 1 : 4) : actor.walking ? 1 + Math.floor(actor.walkPhase / Math.PI) % 2 : tick < actor.blinkEnd ? 3 : 0;
    const bite = Math.round((Math.sin(tick / 700 + index) + 1) * 2);
    paintSprite(actor, frame, bite);
    const actionLift = action ? -(action.kind === 'hop' ? 3 : action.kind === 'hello' ? 1 : 0) * Math.sin(clamp((tick - action.start) / (action.end - action.start)) * Math.PI) : 0;
    const desiredLift = petting ? -4 * Math.sin(clamp((tick - actor.petEnd + 950) / 950) * Math.PI) :
      action ? actionLift : actor.walking ? -.8 * (1 - Math.cos(actor.walkPhase * 2)) / 2 :
      eating ? 0 : -.35 * (1 + Math.sin(tick / 1600 + index));
    actor.lift += (desiredLift - actor.lift) * (1 - Math.exp(-dt * 8));
    actor.sprite.style.transform = 'translateY(' + Math.round(actor.lift * pixelRatio) / pixelRatio + 'px)';
    actor.speech.hidden = !petting && !action;
  });
  $('#food').style.left = fieldWidth / 2 + 'px';
  renderSceneMessage(now, tick);
  raf = requestAnimationFrame(draw);
}
function hearts(actor) {
  const host = $('#hearts');
  for (let i = 0; i < 3; i++) {
    const node = document.createElement('span'); node.className = 'heart';
    node.style.left = actor.x + size / 2 + (i - 1) * 18 + 'px'; node.style.bottom = $('#scene').clientHeight * .13 + size * .7 + i * 7 + 'px';
    node.style.setProperty('--drift', (i - 1) * 19 + 'px'); const glyph = document.createElement('i'); glyph.dataset.lucide = 'heart'; node.append(glyph); host.append(node);
    node.addEventListener('animationend', () => node.remove(), { once: true });
  }
  icons();
}
document.addEventListener('pointerdown', () => { if (data?.settings.sound) { try { audio ||= new AudioContext(); audio.resume().catch(() => {}); } catch {} } });
actors.forEach(actor => actor.node.addEventListener('click', () => {
  if (actor.node.disabled || actor.node.hidden) return;
  actor.action = null; actor.petEnd = performance.now() + 950; actor.speech.textContent = ['고마워!', '헤헤!', '야하!'][actor.index]; hearts(actor); sound();
}));
for (const action of ['settings', 'pin', 'hide', 'quit', 'sound', 'mini']) $('#' + action).addEventListener('click', async () => {
  try { const result = await window.widget.action(action); if (result) update(result); } catch (error) { showError(error); }
});
window.addEventListener('resize', layout);
document.addEventListener('visibilitychange', async () => {
  document.body.classList.toggle('paused', document.hidden);
  if (document.hidden) { hiddenAt = performance.now(); cancelAnimationFrame(raf); raf = 0; return; }
  try { update(await window.widget.getState()); } catch (error) { showError(error); }
  const elapsed = performance.now() - hiddenAt;
  actors.forEach(actor => { actor.action = null; actor.nextMove = 0; actor.nextBlink += elapsed; actor.petEnd = 0; actor.velocity = 0; });
  nextAmbientAt = performance.now() + 18000 + Math.random() * 12000;
  $('#hearts').replaceChildren(); lastFrame = performance.now(); if (!raf) raf = requestAnimationFrame(draw);
});
async function start() {
  icons();
  if (!window.widget) { showError(new Error('Electron 앱으로 실행해주세요.')); return; }
  window.widget.onState(update);
  try {
    const artwork = await window.widget.getArtwork();
    atlas = loadImage(artwork.characters); meals = loadImage(artwork.food);
    await Promise.all([atlas.ready, meals.ready]); prepareSprites();
    update(await window.widget.getState());
    if (!raf) { lastFrame = performance.now(); raf = requestAnimationFrame(draw); }
  } catch (error) { showError(error); }
}
start();
