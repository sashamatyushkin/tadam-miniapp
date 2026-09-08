// ── UI-примитивы ─────────────────────────────────────────────────────
import { tg } from './tg.js?v=2609090130';

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const mascot = (name, cls = 'mascot--md') =>
  `<img class="mascot ${cls}" src="assets/mascots/${name}.png" alt="" loading="lazy" decoding="async">`;

export function toast(text) {
  const root = $('#toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 1900);
  setTimeout(() => el.remove(), 2300);
}

let sheetCloser = null;
export function sheet(html, onMount) {
  closeSheet();
  const root = $('#sheet-root');
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  const sh = document.createElement('div'); sh.className = 'sheet';
  sh.innerHTML = `<div class="sheet__grip"></div>${html}`;
  root.append(bg, sh);
  bg.onclick = closeSheet;
  sheetCloser = () => { bg.remove(); sh.remove(); sheetCloser = null; };
  onMount?.(sh, closeSheet);
  return sheetCloser;
}
export function closeSheet() { sheetCloser?.(); }
export const sheetOpen = () => !!sheetCloser;

export function confirmSheet(title, text, okText, onOk) {
  sheet(`
    <div class="center stack">
      <h3 class="h2">${esc(title)}</h3>
      <p class="muted small">${esc(text)}</p>
      <button class="btn" id="cf-ok">${esc(okText)}</button>
      <button class="btn btn--ghost" id="cf-no">Отмена</button>
    </div>`, (el, close) => {
    el.querySelector('#cf-ok').onclick = () => { close(); onOk(); };
    el.querySelector('#cf-no').onclick = close;
  });
}

export function chips(items, activeIds, onToggle, lockedIds = []) {
  return items.map(i => {
    const on = activeIds.includes(i.id);
    const lock = lockedIds.includes(i.id);
    return `<button class="chip ${on ? 'chip--on' : ''} ${lock ? 'chip--lock' : ''}" data-chip="${i.id}">${lock ? '🔒 ' : ''}${esc(i.name)}</button>`;
  }).join('');
}

export function bindChips(root, cb) {
  root.querySelectorAll('[data-chip]').forEach(b => {
    b.onclick = () => { tg.haptic('light'); cb(b.dataset.chip === 'all' ? 'all' : b.dataset.chip); };
  });
}

export function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  return `${+d} ${months[+m - 1]}`;
}
export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
