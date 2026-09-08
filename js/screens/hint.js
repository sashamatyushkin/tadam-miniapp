// ── Механика «Намекни»: карточка-намёк уходит в чат Telegram ─────────
import { createHint, track } from '../store.js?v=2609090130';
import { deepLink } from '../config.js?v=2609090130';
import { sheet, esc, toast, mascot } from '../ui.js?v=2609090130';
import { tg } from '../tg.js?v=2609090130';

export function openHint({ ideaId, title, desc, wishlistId }) {
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
    const h = createHint({ ideaId: ideaId || null, wishlistId: wishlistId || null, title });
    const url = deepLink(ideaId ? 'h_' + ideaId : 'w_' + h.token);
    const text = wishlistId
      ? `Привет! Слушай, если не знаешь, что мне подарить — вот моя подборка, начни с «${title}» 🎁 Переходи и забирай`
      : `Привет! Кажется, это тот самый подарок: «${title}» 🎁 Глянь, я собрал идею в Та-дам`;
    el.querySelector('#send').onclick = () => {
      track('hint_shared', { id: h.id });
      tg.haptic('success');
      tg.share(url, text);
      close();
      setTimeout(() => confirmSent(title), 300);
    };
    el.querySelector('#copy').onclick = async () => {
      try { await navigator.clipboard.writeText(url + '\n' + text); toast('Ссылка скопирована'); }
      catch (e) { toast(url); }
      track('hint_link_copied', { id: h.id });
    };
  });
}

function confirmSent(title) {
  sheet(`
    <div class="center stack">
      ${mascot('wow', 'mascot--md')}
      <h3 class="bups" style="font-size:24px;color:var(--mango)">та-дам! намёк ушёл</h3>
      <p class="muted small">«${esc(title)}» — теперь близкий точно поймёт</p>
      <button class="btn" id="ok">Отлично</button>
    </div>`, (el, close) => { el.querySelector('#ok').onclick = close; });
}
