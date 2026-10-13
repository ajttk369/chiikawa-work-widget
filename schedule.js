(function () {
'use strict';
const DEFAULTS = Object.freeze({ start: '09:00', lunchStart: '12:00', lunchEnd: '13:00', end: '18:00',
  workdays: [1, 2, 3, 4, 5], sound: false, size: 116, pin: false,
  mini: false, ambient: true, breakEnabled: false, breakMinutes: 60,
  clickThrough: false, opacity: 100, background: 'auto' });
const MENUS = ['주먹밥', '옥수수', '카레라이스', '라멘', '도시락', '샌드위치'];
const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function clock(date, value, offset = 0) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset, Math.floor(minutes(value) / 60), minutes(value) % 60).getTime();
}
function shift(date, settings) {
  const overnight = minutes(settings.end) < minutes(settings.start);
  const start = clock(date, settings.start), end = clock(date, settings.end, overnight ? 1 : 0);
  const lunchOffset = minutes(settings.lunchStart) < minutes(settings.start) ? 1 : 0;
  const lunchStart = clock(date, settings.lunchStart, lunchOffset);
  const lunchEnd = clock(date, settings.lunchEnd, lunchOffset + (minutes(settings.lunchEnd) < minutes(settings.lunchStart) ? 1 : 0));
  return { key: dayKey(date), weekday: date.getDay(), start, end, lunchStart, lunchEnd };
}
function validateSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('설정 형식을 확인해주세요.');
  for (const key of ['start', 'end', 'lunchStart', 'lunchEnd']) if (typeof input[key] !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input[key])) throw new Error('시간을 올바르게 입력해주세요.');
  if (input.start === input.end) throw new Error('출근과 퇴근 시간은 달라야 합니다.');
  if (input.lunchStart === input.lunchEnd) throw new Error('점심 시작과 종료 시간은 달라야 합니다.');
  const sample = shift(new Date(2026, 0, 5), input);
  if (!(sample.lunchStart > sample.start && sample.lunchEnd > sample.lunchStart && sample.lunchEnd < sample.end)) throw new Error('점심시간을 출근과 퇴근 사이로 설정해주세요.');
  if (!Array.isArray(input.workdays) || !input.workdays.length || input.workdays.length > 7 || input.workdays.some(n => !Number.isInteger(n) || n < 0 || n > 6)) throw new Error('근무 요일을 한 개 이상 선택해주세요.');
  if (typeof input.sound !== 'boolean' || typeof input.pin !== 'boolean') throw new Error('설정 값을 확인해주세요.');
  if (!Number.isFinite(input.size) || input.size < 72 || input.size > 144) throw new Error('캐릭터 크기는 72~144로 설정해주세요.');
  const extra = { mini: input.mini ?? DEFAULTS.mini, ambient: input.ambient ?? DEFAULTS.ambient,
    breakEnabled: input.breakEnabled ?? DEFAULTS.breakEnabled, breakMinutes: input.breakMinutes ?? DEFAULTS.breakMinutes,
    clickThrough: input.clickThrough ?? DEFAULTS.clickThrough, opacity: input.opacity ?? DEFAULTS.opacity, background: input.background ?? DEFAULTS.background };
  if (['mini', 'ambient', 'breakEnabled', 'clickThrough'].some(key => typeof extra[key] !== 'boolean')) throw new Error('설정 값을 확인해주세요.');
  if (![30, 45, 60, 90, 120].includes(extra.breakMinutes)) throw new Error('휴식 알림 간격을 확인해주세요.');
  if (!Number.isFinite(extra.opacity) || extra.opacity < 40 || extra.opacity > 100) throw new Error('불투명도는 40~100으로 설정해주세요.');
  if (!['auto', 'day', 'sunset', 'night'].includes(extra.background)) throw new Error('배경 종류를 확인해주세요.');
  extra.opacity = Math.round(extra.opacity);
  return { start: input.start, end: input.end, lunchStart: input.lunchStart, lunchEnd: input.lunchEnd,
    workdays: [...new Set(input.workdays)].sort(), sound: input.sound, size: Math.round(input.size), pin: input.pin, ...extra };
}
function timeline(settings, now = Date.now()) {
  const today = new Date(now), yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const current = shift(today, settings), previous = shift(yesterday, settings);
  const overnight = minutes(settings.end) < minutes(settings.start);
  const active = overnight && settings.workdays.includes(previous.weekday) && now >= previous.start && now < current.start ? previous : current;
  const working = settings.workdays.includes(active.weekday);
  let status = !working ? 'off' : now < active.start ? 'before' : now >= active.end ? 'after' : now >= active.lunchStart && now < active.lunchEnd ? 'lunch' : 'work';
  let nextStart;
  for (let offset = 0; offset <= 8; offset++) {
    const candidate = shift(new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset), settings);
    if (settings.workdays.includes(candidate.weekday) && candidate.start > now) { nextStart = candidate.start; break; }
  }
  const total = active.end - active.start - (active.lunchEnd - active.lunchStart);
  const elapsed = Math.min(Math.max(now - active.start, 0), active.end - active.start) - Math.min(Math.max(now - active.lunchStart, 0), active.lunchEnd - active.lunchStart);
  const progress = working ? Math.max(0, Math.min(100, elapsed / total * 100)) : 0;
  return { now, status, label: { off: '휴무', before: '출근 전', work: '업무 중', lunch: '점심시간', after: '퇴근 후' }[status],
    cycleKey: active.key, shift: active, progress, nextStart,
    target: status === 'before' ? active.start : status === 'work' ? active.end : status === 'lunch' ? active.lunchEnd : nextStart };
}
const api = { DEFAULTS, MENUS, dayKey, validateSettings, timeline };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.WidgetSchedule = Object.freeze(api);
})();
