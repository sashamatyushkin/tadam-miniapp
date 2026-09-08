// ── Профиль ──────────────────────────────────────────────────────────
import { state, isPremium, accessLabel, track } from '../store.js?v=2609090130';
import { esc } from '../ui.js?v=2609090130';
import { tg } from '../tg.js?v=2609090130';
import { go } from '../app.js?v=2609090130';
import { maybeShowTips } from './coach.js?v=2609090130';

export function render() {
  const u = tg.user();
  const name = state.profile.name || u?.first_name || 'Друг';
  const hints = state.hints.length;

  return {
    tab: 'profile',
    html: `
      <div class="phead">
        <div class="phead__ava"><img src="assets/img/logo-icon.png" alt=""></div>
        <div class="phead__name">${esc(name.toLowerCase())}</div>
        <div class="pill">${isPremium() ? '✦ Premium активен' : 'Бесплатный доступ'}</div>
      </div>
      <div class="wrap">
        <div class="rows">
          <button class="row" data-go="dates"><span class="row__ico">📅</span><span class="row__t">Важные даты</span><span class="row__v">${state.dates.length}</span><span class="row__chev">›</span></button>
          <button class="row" data-go="wishlist"><span class="row__ico">💖</span><span class="row__t">Мои вишлисты</span><span class="row__v">${state.wishlists.length}</span><span class="row__chev">›</span></button>
          <button class="row" data-go="invite"><span class="row__ico">👥</span><span class="row__t">Друзья и намёки</span><span class="row__v">${hints}</span><span class="row__chev">›</span></button>
          <button class="row" data-go="paywall"><span class="row__ico">⭐</span><span class="row__t">Мой доступ</span><span class="row__v">${accessLabel()}</span><span class="row__chev">›</span></button>
          <button class="row" data-go="rewards"><span class="row__ico">🎁</span><span class="row__t">Мои награды</span><span class="row__v">${state.rewards.filter(r => !r.redeemed).length}</span><span class="row__chev">›</span></button>
          <button class="row" data-go="quest"><span class="row__ico">✅</span><span class="row__t">Заполни и получи</span><span class="row__chev">›</span></button>
          <button class="row" data-go="friends"><span class="row__ico">✨</span><span class="row__t">Друзья бренда</span><span class="row__chev">›</span></button>
          <button class="row" data-go="ugc"><span class="row__ico">🎬</span><span class="row__t">Твори с Та-дам</span><span class="row__chev">›</span></button>
          <button class="row" data-go="settings"><span class="row__ico">⚙️</span><span class="row__t">Настройки</span><span class="row__chev">›</span></button>
          <button class="row" data-go="support"><span class="row__ico">💬</span><span class="row__t">Поддержка</span><span class="row__chev">›</span></button>
        </div>
        <div class="spacer"></div>
        <p class="small muted center">Та-дам · прототип · ${esc(state.profile.tz)}</p>
      </div>`,
    mount(app) {
      track('profile_viewed', {});
      maybeShowTips('profile');
      app.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go, {}));
      // Сброс до первого запуска — только в Настройках, за подтверждением:
      // случайный тап на главном экране профиля не должен стирать данные.
    }
  };
}
