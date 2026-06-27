'use strict';
// public/app.js — Vanilla JS client for surgut-go. No framework, no bundler.

const SURGUT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5

// ── Date helpers ──────────────────────────────────────────────────────────────

/**
 * Shift a UTC date to Surgut local time (UTC+5) by returning a Date whose
 * UTC fields reflect local Surgut time. Used with .toISOString() slice tricks.
 */
function surgutDate(utcDate) {
  return new Date(new Date(utcDate).getTime() + SURGUT_OFFSET_MS);
}

/**
 * Human-readable date string in Russian. Returns "Сегодня", "Завтра", or
 * "пн, 4 июл, 20:00". Omits time for date-only events.
 *
 * hasTime: explicit flag from SerializedEvent (may be undefined for cached data).
 * When hasTime is undefined, falls back to UTC-midnight inference:
 *   UTC 00:00:00 → date-only (no "05:00" artefact). (UX-01 Tier 1)
 */
function humanizeDate(isoString, hasTime) {
  var rawUtcDate = new Date(isoString);
  var isDateOnly = hasTime === false
    || (hasTime === undefined
        && rawUtcDate.getUTCHours() === 0
        && rawUtcDate.getUTCMinutes() === 0);

  const d   = surgutDate(isoString);
  const now = surgutDate(new Date());

  const todayStr    = now.toISOString().slice(0, 10);
  const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  const dStr        = d.toISOString().slice(0, 10);

  const RU_DAYS   = ['вс','пн','вт','ср','чт','пт','сб'];
  const RU_MONTHS = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const timeStr = isDateOnly
    ? ''
    : `, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  if (dStr === todayStr)    return `Сегодня${timeStr}`;
  if (dStr === tomorrowStr) return `Завтра${timeStr}`;

  const day = RU_DAYS[d.getUTCDay()];
  const mon = RU_MONTHS[d.getUTCMonth()];
  return `${day}, ${d.getUTCDate()} ${mon}${timeStr}`;
}

// ── XSS safety ────────────────────────────────────────────────────────────────

/**
 * Escape a string for safe insertion into HTML attribute values or text content.
 * Applied to every event field — including the CTA href — before innerHTML use.
 */
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Module-level state ────────────────────────────────────────────────────────

/** Last loaded recommendation items: Array<{ event: SerializedEvent, reason: string }> */
let currentItems = [];

/** Currently active mood key or null. */
let activeMood = null;

/** Active date chip value: '' | 'today' | 'tomorrow' | 'weekend' | 'week' */
let activeDateChip = '';

/** True when the free-only toggle is checked. */
let freeOnly = false;

/** Active category value or '' for all. */
let activeCategory = '';

/**
 * Map from event.sourceName -> source status fetched from /api/sources/status.
 * Used by renderCard() to decide whether to show a "Кэш" badge.
 */
let sourceStatusByName = {};

// ── Client-side filter ────────────────────────────────────────────────────────

/**
 * Filter currentItems according to the active chip, free toggle, and category.
 * Never makes a network request.
 */
function applyFilters() {
  const now         = Date.now();
  const nowSurgut   = surgutDate(new Date());
  const todayStr    = nowSurgut.toISOString().slice(0, 10);
  const tomorrowStr = surgutDate(new Date(now + 86400000)).toISOString().slice(0, 10);

  return currentItems.filter(function (item) {
    var e = item.event;

    if (freeOnly && !e.isFree) return false;
    if (activeCategory && e.category !== activeCategory) return false;

    if (!activeDateChip) return true;

    var dStr = surgutDate(e.startDate).toISOString().slice(0, 10);
    var wd   = surgutDate(new Date(e.startDate)).getUTCDay();

    if (activeDateChip === 'today')    return dStr === todayStr;
    if (activeDateChip === 'tomorrow') return dStr === tomorrowStr;
    if (activeDateChip === 'weekend')  return wd === 0 || wd === 6;
    if (activeDateChip === 'week') {
      var eventMs = new Date(e.startDate).getTime();
      return eventMs >= now && eventMs < now + 7 * 86400000;
    }
    return true;
  });
}

// ── CTA text helper ───────────────────────────────────────────────────────────

function ctaText(sourceName) {
  var ticketing = ['kassa-ugra', 'kassir', 'tbank'];
  return ticketing.indexOf(sourceName) !== -1 ? 'Купить билет' : 'Открыть';
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * Render a single event item into an <article> HTML string.
 *
 * Honesty:
 *   - isSeed === true  → "Демо" badge (orange)
 *   - else source has status "cached" → "Кэш" badge (amber)
 *
 * XSS: every event field is passed through escHtml() before innerHTML use,
 * including the CTA href (escHtml(e.sourceUrl)).
 */
function renderCard(item) {
  var e = item.event;

  // Honesty badge: Демо for seed, Кэш for cached source
  var badge;
  if (e.isSeed) {
    badge = '<div class="badge badge--demo">Демо</div>';
  } else if (sourceStatusByName[e.sourceName] === 'cached') {
    badge = '<div class="badge badge--cached">Кэш</div>';
  } else {
    badge = '';
  }

  var cta = ctaText(e.sourceName);

  // Omit price line when sentinel value is present
  var priceHtml = e.priceText !== 'Цена не указана'
    ? '<p class="card__price">' + escHtml(e.priceText) + '</p>'
    : '';

  var reasonEmoji = { drink: '🍸', dance: '💃', learn: '🧠', music: '🎵' }[activeMood] || '✨';

  // Date attributes used by applyFilters (client-side only)
  var dateAttr     = surgutDate(e.startDate).toISOString().slice(0, 10);
  var categoryAttr = escHtml(e.category);

  return (
    '<article class="card"' +
    ' data-seed="' + e.isSeed + '"' +
    ' data-category="' + categoryAttr + '"' +
    ' data-date="' + dateAttr + '"' +
    ' data-free="' + e.isFree + '">' +
    badge +
    '<h3 class="card__title">' + escHtml(e.title) + '</h3>' +
    '<time class="card__date" datetime="' + escHtml(e.startDate) + '">' +
      humanizeDate(e.startDate, e.hasTime) +
    '</time>' +
    '<p class="card__venue">' + escHtml(e.venue) + '</p>' +
    priceHtml +
    '<p class="card__reason">' + reasonEmoji + ' ' + escHtml(item.reason) + '</p>' +
    '<footer class="card__footer">' +
      '<span class="card__source">' + escHtml(e.sourceName) + '</span>' +
      '<a class="card__cta" href="' + escHtml(e.sourceUrl) + '"' +
        ' target="_blank" rel="noopener noreferrer">' + cta + '</a>' +
    '</footer>' +
    '</article>'
  );
}

/**
 * Render a list of items into #results. Shows an empty-state message when empty.
 */
function renderCards(items) {
  var results = document.getElementById('results');
  if (items.length === 0) {
    results.innerHTML = '<p class="empty">Нет мероприятий по выбранным фильтрам</p>';
    return;
  }
  results.innerHTML = items.map(renderCard).join('');
}

// ── Mood fetch ────────────────────────────────────────────────────────────────

/**
 * Fetch recommendations for the given mood and render cards.
 * Resets all filters to their defaults.
 */
async function loadMood(mood) {
  activeMood      = mood;
  activeDateChip  = '';
  freeOnly        = false;
  activeCategory  = '';

  // Highlight active mood button
  document.querySelectorAll('.mood-btn').forEach(function (b) {
    b.classList.toggle('mood-btn--active', b.dataset.mood === mood);
  });

  // Show filter section
  document.getElementById('filters').classList.remove('hidden');

  // Reset chips to "Все"
  document.querySelectorAll('.chip').forEach(function (c) {
    c.classList.toggle('chip--active', c.dataset.date === '');
  });
  document.getElementById('free-toggle').checked = false;
  document.getElementById('category-filter').value = '';

  // Show loading state
  document.getElementById('results').innerHTML = '<p class="loading">Загружаем…</p>';

  try {
    var res = await fetch('/api/recommendations?mood=' + encodeURIComponent(mood));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    currentItems = data.items;
    renderCards(applyFilters());
  } catch (err) {
    document.getElementById('results').innerHTML =
      '<p class="error">Не удалось загрузить события. Попробуйте позже.</p>';
    console.error('loadMood error:', err);
  }
}

// ── Source status ─────────────────────────────────────────────────────────────

/**
 * Fetch /api/sources/status once on page load.
 * Populates sourceStatusByName so renderCard() can show "Кэш" badges.
 * Re-renders visible cards so badges reflect freshness immediately.
 */
async function loadSources() {
  try {
    var res     = await fetch('/api/sources/status');
    var sources = await res.json();

    // Populate the name→status map used by renderCard()
    sourceStatusByName = {};
    sources.forEach(function (src) {
      sourceStatusByName[src.name] = src.status;
    });

    var statusLabel = {
      live:    { dot: 'live',    text: 'Обновлено' },
      cached:  { dot: 'cached',  text: 'Кэш' },
      error:   { dot: 'error',   text: 'Ошибка' },
      blocked: { dot: 'blocked', text: 'Недоступен' },
      seed:    { dot: 'seed',    text: 'Демо-данные' },
    };

    var list = document.getElementById('source-list');
    list.innerHTML = sources.map(function (src) {
      var s   = statusLabel[src.status] || { dot: 'error', text: src.status };
      var age = src.fetchedAt
        ? ' · ' + Math.round((Date.now() - new Date(src.fetchedAt)) / 60000) + ' мин назад'
        : '';
      return (
        '<li>' +
        '<span class="dot dot--' + s.dot + '"></span>' +
        escHtml(src.displayName) + ': ' + src.eventCount + ' событий' + age +
        '</li>'
      );
    }).join('');

    // Re-render any already-loaded cards so Кэш badges appear immediately
    if (currentItems.length > 0) {
      renderCards(applyFilters());
    }
  } catch (err) {
    console.warn('Source status unavailable:', err);
  }
}

// ── Event bindings ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
  // Mood buttons
  document.querySelectorAll('.mood-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      loadMood(btn.dataset.mood);
    });
  });

  // Date chips
  document.querySelectorAll('.chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      activeDateChip = chip.dataset.date;
      document.querySelectorAll('.chip').forEach(function (c) {
        c.classList.toggle('chip--active', c === chip);
      });
      renderCards(applyFilters());
    });
  });

  // Free toggle
  document.getElementById('free-toggle').addEventListener('change', function (e) {
    freeOnly = e.target.checked;
    renderCards(applyFilters());
  });

  // Category filter
  document.getElementById('category-filter').addEventListener('change', function (e) {
    activeCategory = e.target.value;
    renderCards(applyFilters());
  });

  // Load source status once on page load
  loadSources();
});
