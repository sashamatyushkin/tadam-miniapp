// ── Мост к Telegram Mini Apps API ────────────────────────────────────
// Работает и вне Telegram (браузерный fallback для staging-проверки).

const raw = window.Telegram?.WebApp;
export const inTelegram = !!(raw && raw.initData !== undefined && raw.platform !== 'unknown');

export const tg = {
  raw,
  inTelegram,

  init() {
    if (!raw) return;
    raw.ready();
    raw.expand();                                   // на всю высоту, без «шторки»
    try { raw.disableVerticalSwipes?.(); } catch (e) {}   // чтобы свайп по списку не схлопывал окно
    try { raw.setHeaderColor?.('#FBF3E8'); raw.setBackgroundColor?.('#FBF3E8'); } catch (e) {}
    try { raw.setBottomBarColor?.('#FBF3E8'); } catch (e) {}

    this.applySafeArea();
    raw.onEvent?.('safeAreaChanged', () => this.applySafeArea());
    raw.onEvent?.('contentSafeAreaChanged', () => this.applySafeArea());
    raw.onEvent?.('viewportChanged', () => this.applySafeArea());
    raw.onEvent?.('fullscreenChanged', () => this.applySafeArea());

    this.goFullscreen();
  },

  // Полноэкранный режим (Bot API 8.0+). Где не поддерживается — остаётся expand(),
  // то есть приложение всё равно открывается на всю высоту.
  goFullscreen() {
    if (!raw?.requestFullscreen) return;
    if (raw.isVersionAtLeast && !raw.isVersionAtLeast('8.0')) return;
    if (raw.isFullscreen) return;
    raw.onEvent?.('fullscreenFailed', e => {
      console.warn('[tadam] fullscreen недоступен:', e?.error || 'unknown');
      try { raw.expand(); } catch (err) {}
    });
    try { raw.requestFullscreen(); } catch (e) { /* остаёмся в expanded */ }
  },

  applySafeArea() {
    const s = raw?.safeAreaInset || {};
    const c = raw?.contentSafeAreaInset || {};
    const top = (s.top || 0) + (c.top || 0);
    const bottom = (s.bottom || 0) + (c.bottom || 0);
    document.documentElement.style.setProperty('--tg-safe-top', top + 'px');
    document.documentElement.style.setProperty('--tg-safe-bottom', bottom + 'px');
  },

  // Данные пользователя — только для приветствия/аватара.
  // Доверять им нельзя: в production backend проверяет подпись initData.
  user() {
    return raw?.initDataUnsafe?.user || null;
  },
  initData() { return raw?.initData || ''; },

  // start_param из ссылки t.me/bot/app?startapp=... — рефералы и намёки
  startParam() {
    const p = raw?.initDataUnsafe?.start_param;
    if (p) return p;
    return new URLSearchParams(location.search).get('startapp') || location.hash.replace(/^#/, '') || '';
  },

  // Кнопка «Назад» Telegram. Пока она скрыта, Telegram показывает на её месте
  // «Закрыть» — один промах, и человек вылетает из приложения. Поэтому держим
  // её видимой везде, где есть куда вернуться: у экрана — свой обработчик (back),
  // а поверх него открытые шторки и сторис кладут свои (pushBack) — «Назад»
  // сначала закрывает их, и только потом уводит с экрана.
  _base: null,
  _overlays: [],
  back(handler) { this._base = handler || null; this._syncBack(); },
  pushBack(handler) { this._overlays.push(handler); this._syncBack(); },
  popBack(handler) {
    const i = this._overlays.lastIndexOf(handler);
    if (i >= 0) this._overlays.splice(i, 1);
    this._syncBack();
  },
  _syncBack() {
    const bb = raw?.BackButton;
    if (!bb) return;
    if (this._backCb) bb.offClick?.(this._backCb);
    const h = this._overlays[this._overlays.length - 1] || this._base;
    if (h) { this._backCb = () => h(); bb.onClick(this._backCb); bb.show(); }
    else { this._backCb = null; bb.hide(); }
  },

  haptic(type = 'light') {
    try {
      const h = raw?.HapticFeedback;
      if (!h) return;
      if (type === 'success' || type === 'error' || type === 'warning') h.notificationOccurred(type);
      else h.impactOccurred(type);
    } catch (e) {}
  },

  // Официальный share: открывает выбор чата в Telegram
  share(url, text) {
    const link = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text);
    if (raw?.openTelegramLink) raw.openTelegramLink(link);
    else window.open(link, '_blank');
  },

  alert(msg) { raw?.showAlert ? raw.showAlert(msg) : window.alert(msg); },
  confirm(msg, cb) {
    if (raw?.showConfirm) raw.showConfirm(msg, cb);
    else cb(window.confirm(msg));
  },

  // CloudStorage — постоянное хранилище Telegram (привязано к пользователю)
  cloudGet(key) {
    return new Promise(res => {
      const cs = raw?.CloudStorage;
      if (!cs) return res(null);
      cs.getItem(key, (err, val) => res(err ? null : val || null));
    });
  },
  cloudSet(key, value) {
    return new Promise(res => {
      const cs = raw?.CloudStorage;
      if (!cs) return res(false);
      cs.setItem(key, value, (err, ok) => res(!err && ok));
    });
  },
  cloudRemove(key) {
    return new Promise(res => {
      const cs = raw?.CloudStorage;
      if (!cs) return res(false);
      cs.removeItem(key, (err, ok) => res(!err && ok));
    });
  }
};
