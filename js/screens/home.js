// ── Главная: поводы ──────────────────────────────────────────────────
import { CATEGORIES } from '../config.js?v=2609091220';
import { state, categoryOpen, isPremium, track, questComplete } from '../store.js?v=2609091220';
import { esc, mascot } from '../ui.js?v=2609091220';
import { tg } from '../tg.js?v=2609091220';
import { go } from '../app.js?v=2609091220';
import { maybeShowTips } from './coach.js?v=2609091220';
import { storiesRow, bindStories } from './stories.js?v=2609091220';
import { openLockSheet } from './extra.js?v=2609091220';

export function render() {
  track('home_viewed', { premium: isPremium() });
  const month = new Date().getMonth();
  // порядок: бесплатные → сезонные платные → остальные (в проде порядок задаёт админка)
  const cats = CATEGORIES.map(c => ({ ...c, hot: c.season?.includes(month) }))
    .sort((a, b) => rank(a) - rank(b));
  function rank(c) { return c.free ? 0 : (c.hot ? 1 : 2); }

  const quest = !questComplete() || !state.quest.rewardIssued;

  return {
    tab: 'home',
    html: `
      <div class="topbar">
        <h1 class="bups topbar__title" style="color:var(--mango)">кому дарим?</h1>
        <button class="iconbtn" id="quest" title="Заполни и получи">🎁</button>
      </div>
      ${storiesRow()}
      <div class="wrap">
        <div class="search" id="searchbox">
          <span>🔍</span><input placeholder="Найти идею подарка…" readonly>
        </div>

        ${quest ? `
        <div class="info" style="margin-top:14px;display:flex;gap:12px;align-items:center">
          <div style="flex:1">
            <div style="font-weight:800">Заполни и получи 🎁</div>
            <div class="small">Профиль и 3 даты — и откроем бонус</div>
          </div>
          <button class="btn btn--sm" id="questBtn">Открыть</button>
        </div>` : ''}

        <div class="section-title">Поводы</div>
        <div class="cats">
          ${cats.map(c => {
            const open = categoryOpen(c);
            const temp = !c.free && !isPremium() && state.tempCategories[c.id] > Date.now();
            return `
            <button class="cat ${open ? '' : 'cat--locked'} ${c.hot ? 'cat--season' : ''}" data-cat="${c.id}" style="background:${c.bg}">
              ${c.free ? '<span class="cat__badge">БЕСПЛАТНО</span>' : (open ? `<span class="cat__badge">${temp ? '24 ЧАСА' : 'ОТКРЫТО'}</span>` : '<span class="cat__lock">🔒</span>')}
              <div class="cat__emoji">${c.emoji}</div>
              <div class="cat__name">${esc(c.name).replace(/\n/g, '<br>')}</div>
            </button>`;
          }).join('')}
        </div>

        ${isPremium() ? '' : `
        <div class="card" style="margin-top:16px;display:flex;gap:12px;align-items:center">
          ${mascot('cool', 'mascot--sm')}
          <div style="flex:1">
            <div style="font-weight:800">Открыть все 13 поводов</div>
            <div class="small muted">Все фильтры, безлимит вишлистов и намёков</div>
          </div>
          <button class="btn btn--sm" id="pw">149 ₽</button>
        </div>`}
        <div class="spacer"></div>
      </div>`,
    mount(app) {
      bindStories(app);
      maybeShowTips('home');
      app.querySelector('#searchbox').onclick = () => go('search', {});
      app.querySelector('#quest').onclick = () => go('quest', {});
      app.querySelector('#questBtn')?.addEventListener('click', () => go('quest', {}));
      app.querySelector('#pw')?.addEventListener('click', () => go('paywall', { from: 'home' }));
      app.querySelectorAll('[data-cat]').forEach(b => {
        b.onclick = () => {
          const c = CATEGORIES.find(x => x.id === b.dataset.cat);
          tg.haptic('light');
          if (categoryOpen(c)) { track('category_opened', { cat: c.id }); go('cat', { id: c.id }); }
          else { track('locked_category_clicked', { cat: c.id }); openLockSheet(c.id); }
        };
      });
    }
  };
}
