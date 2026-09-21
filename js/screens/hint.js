// ── Механика «Намекни»: карточка-намёк уходит в чат Telegram ─────────
import { createHint, track, hintsLeftToday } from '../store.js?v=2609211121';
import { deepLink, CONFIG } from '../config.js?v=2609211121';
import { sheet, esc, toast, mascot } from '../ui.js?v=2609211121';
import { tg } from '../tg.js?v=2609211121';

export function openHint({ ideaId, title, desc, wishlistId }) {
  // Без premium «Намекни» ограничен по тарифной сетке — несколько карточек в сутки
  if (hintsLeftToday() <= 0) {
    track('premium_limit_reached', { kind: 'hints' });
    return sheet(`
      <div class="center stack">
        ${mascot('bubble', 'mascot--md')}
        <h3 class="h2">Намёки на сегодня закончились</h3>
        <p class="muted small">Бесплатно — ${CONFIG.limits.freeHintsPerDay} в сутки. С premium намекай сколько угодно.</p>
        <button class="btn" id="pw">Смотреть тарифы</button>
        <button class="btn btn--ghost" id="no">Завтра</button>
      </div>`, (el, close) => {
      el.querySelector('#pw').onclick = () => { close(); import('../app.js?v=2609211121').then(m => m.go('paywall', { from: 'hints_limit' })); };
      el.querySelector('#no').onclick = close;
    });
  }
  sheet(`
    <div class="stack">
      <h3 class="h2">Намекнуть другу</h3>
      <p class="muted small">Так это увидит близкий человек в Telegram:</p>
      <div class="chat">
        <div class="bubble">Что тебе подарить? 🎂</div>
        <div class="hintcard">
          <div class="hintcard__brand">🎁 намёк от меня</div>
          <div class="hintcard__box">
            <div style="font-weight:800">${esc(title)}</div>
            <div class="small muted">${esc(desc || 'из моего вишлиста в Та-дам')}</div>
          </div>
          <div style="margin-top:8px;font-size:13px;font-weight:700">Посмотреть в Та-дам →</div>
        </div>
      </div>
      <button class="btn" id="send">Отправить в Telegram</button>
      <button class="btn btn--ghost" id="copy">Скопировать ссылку</button>
      <p class="small muted center">Telegram сам спросит, в какой чат отправить</p>
    </div>`, (el, close) => {
    // Намёк считается, только когда его правда отправили или скопировали
    const tok = Math.random().toString(36).slice(2) + Date.now().toString(36);
    let h = null;
    const made = () => h || (h = createHint({ ideaId: ideaId || null, wishlistId: wishlistId || null, title, token: tok }));
    const url = deepLink(ideaId ? 'h_' + ideaId : 'w_' + tok);
    const text = wishlistId
      ? `Привет! Слушай, если не знаешь, что мне подарить — вот моя подборка, начни с «${title}» 🎁 Переходи и забирай`
      : `Привет! Кажется, это тот самый подарок: «${title}» 🎁 Глянь, я собрал идею в Та-дам`;
    el.querySelector('#send').onclick = () => {
      track('hint_shared', { id: made().id });
      tg.haptic('success');
      tg.share(url, text);
      close();
      setTimeout(() => confirmSent(title), 300);
    };
    el.querySelector('#copy').onclick = async () => {
      try { await navigator.clipboard.writeText(url + '\n' + text); toast('Ссылка скопирована'); }
      catch (e) { toast(url); }
      track('hint_link_copied', { id: made().id });
    };
  });
}

function confirmSent(title) {
  sheet(`
    <div class="center stack">
      ${mascot('wow', 'mascot--md')}
      <h3 class="bups" style="font-size:30px;color:var(--mango)">та-дам! намёк ушёл</h3>
      <p class="muted small">«${esc(title)}» — теперь близкий точно поймёт</p>
      <button class="btn" id="ok">Отлично</button>
    </div>`, (el, close) => { el.querySelector('#ok').onclick = close; });
}
