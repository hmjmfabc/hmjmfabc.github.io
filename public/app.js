/* ============================================================
   SGU 剑客群组服 状态监测 —— 前端逻辑
   - 深色 / 浅色模式切换（右上角按钮，选择记录在 localStorage）
   - 每 5 分钟自动刷新一次状态（与服务端整点对齐）
   - 页脚显示最后刷新时间与下次刷新倒计时
   ============================================================ */
'use strict';

const REFRESH_FALLBACK_MS = 5 * 60 * 1000;
const CONFIG = (typeof window !== 'undefined' && window.SGU_CONFIG) || {};
const API_BASE = String(CONFIG.apiBase || '').replace(/\/+$/, '');
const LOCAL_API_BASE = String(CONFIG.localApiBase || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const MODE = CONFIG.mode || 'auto'; // auto | server | static
const API = `${API_BASE}/api/status`;
const THEME_KEY = 'sgu-theme';
const I18N = (typeof window !== 'undefined' && window.SGUI18n) || null;
/** 取当前语言文案；i18n 未加载时退回键名，保证不白屏 */
function t(key, vars) {
  return I18N ? I18N.t(key, vars) : key;
}
const BACKEND_KEY = 'sgu-backend';
const THEME_COLOR = { light: '#d7b777', dark: '#0b0e13' };

const STATUS_TEXT = {
  get up() { return t('status.up'); },
  get partial() { return t('status.partial'); },
  get down() { return t('status.down'); },
  get unknown() { return t('status.unknown'); },
};

/** 探测/解析错误码 → 可翻译文案 */
const ERROR_KEYS = {
  TIMEOUT: 'endpoint.msg.timeout',
  ETIMEDOUT: 'endpoint.msg.timeout',
  DNS_ERROR: 'endpoint.msg.dns',
  ENOTFOUND: 'endpoint.msg.dns',
  ENODATA: 'endpoint.msg.dns',
  ECONNREFUSED: 'endpoint.msg.refused',
  EHOSTUNREACH: 'endpoint.msg.unreachable',
  ENETUNREACH: 'endpoint.msg.unreachable',
  NO_LOCAL_IPV6: 'endpoint.msg.noipv6',
  NO_RESPONSE: 'endpoint.msg.unknown',
  PROBE_FAILED: 'endpoint.msg.probeFailed',
  OFFLINE: 'endpoint.msg.offline',
  CLOSED: 'endpoint.msg.unknown',
  CONNECT_FAILED: 'endpoint.msg.unreachable',
};

function endpointMessage(ep) {
  const key = ERROR_KEYS[ep && ep.error];
  if (key) return t(key);
  return (ep && ep.message) || t('endpoint.msg.unknown');
}

const el = {
  overall: document.getElementById('overall'),
  overallText: document.getElementById('overall-text'),
  overallSub: document.getElementById('overall-sub'),
  groups: document.getElementById('groups'),
  notice: document.getElementById('notice'),
  sourceNote: document.getElementById('source-note'),
  lastUpdated: document.getElementById('last-updated'),
  countdown: document.getElementById('countdown-text'),
  backendCard: document.getElementById('backend-card'),
  backendOptions: document.getElementById('backend-options'),
  backendActive: document.getElementById('backend-active'),
  backendNote: document.getElementById('backend-note'),
  langToggle: document.getElementById('lang-toggle'),
  langMenu: document.getElementById('lang-menu'),
  langCurrent: document.getElementById('lang-current'),
};

/* ---------------- 语言切换 ---------------- */

/** 替换静态文案（index.html 中带 data-i18n 的节点） */
function applyStaticI18n() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-title]').forEach((node) => {
    node.setAttribute('title', t(node.getAttribute('data-i18n-title')));
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((node) => {
    node.setAttribute('aria-label', t(node.getAttribute('data-i18n-aria')));
  });
  document.title = t('site.title');
}

function renderLangPicker() {
  if (!el.langMenu) return;
  const langs = (I18N && I18N.LANGS) || [];
  const current = (I18N && I18N.getLang && I18N.getLang()) || 'zh-CN';
  el.langMenu.innerHTML = langs
    .map(
      (l) => `
      <button type="button" class="lang-item${l.code === current ? ' is-active' : ''}" role="option"
              aria-selected="${l.code === current}" data-lang="${escapeHtml(l.code)}">
        <span class="lang-item-label">${escapeHtml(l.label)}</span>
        <span class="lang-item-short">${escapeHtml(l.short)}</span>
      </button>`
    )
    .join('');
  el.langMenu.querySelectorAll('.lang-item').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (I18N) I18N.setLang(btn.getAttribute('data-lang'));
      closeLangMenu();
      applyI18n();
    });
  });
  const cur = langs.find((l) => l.code === current);
  if (el.langCurrent) el.langCurrent.textContent = cur ? cur.short : '文';
}

function openLangMenu() {
  if (!el.langMenu) return;
  el.langMenu.hidden = false;
  el.langMenu.classList.add('show');
  if (el.langToggle) el.langToggle.setAttribute('aria-expanded', 'true');
}

function closeLangMenu() {
  if (!el.langMenu) return;
  el.langMenu.hidden = true;
  el.langMenu.classList.remove('show');
  if (el.langToggle) el.langToggle.setAttribute('aria-expanded', 'false');
}

function initLangPicker() {
  if (!el.langToggle) return;
  renderLangPicker();
  el.langToggle.setAttribute('title', t('ui.langTitle'));
  el.langToggle.setAttribute('aria-label', t('ui.langTitle'));
  el.langToggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (el.langMenu && el.langMenu.hidden) openLangMenu();
    else closeLangMenu();
  });
  document.addEventListener('click', (event) => {
    if (!el.langMenu || el.langMenu.hidden) return;
    if (el.langMenu.contains(event.target) || (el.langToggle && el.langToggle.contains(event.target))) return;
    closeLangMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeLangMenu();
  });
}

/** 语言变化后整体重刷（不重新请求数据） */
function applyI18n() {
  applyStaticI18n();
  renderLangPicker();
  initLogoLink();
  applyTheme(currentTheme(), false);
  if (state.lastData) {
    renderOverall(state.lastData);
    renderGroups(state.lastData);
    renderFooter(state.lastData);
    renderSource(state.lastData);
  }
  renderBackendCard();
  renderBackendNote(state.backend.notice);
  tickCountdown();
}

/* ---------------- 后端（数据来源）选择 ---------------- */

/**
 * 客户端简单 ping 是否可用：
 *  - 需要 WebSocket 支持
 *  - 页面必须是 http:// 打开（HTTPS 页面会被浏览器以混合内容拦截，结果不可信）
 * 注意：浏览器无法执行标准 mcping（不能建立原始 TCP 连接），
 *       这里只做「域名解析 + 端口是否有响应」的粗略试探，结果可能不准确。
 */
function clientPingAvailable() {
  if (typeof WebSocket === 'undefined') return false;
  if (typeof location === 'undefined') return false;
  return location.protocol === 'http:';
}

function clientPingBlockReason() {
  if (typeof WebSocket === 'undefined') return t('backend.client.disabled');
  return t('backend.client.disabled');
}

function readBackendPref() {
  const fallback = { source: CONFIG.defaultBackend || 'remote', provider: '' };
  let pref = fallback;
  try {
    const raw = localStorage.getItem(BACKEND_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.source === 'string') {
        pref = { source: parsed.source, provider: parsed.provider || '' };
      }
    }
  } catch (err) {
    // 忽略损坏的配置
  }
  // 已保存的选项若被停用（例如“SGU物理机后端”因备案暂时关闭），自动回退到默认项
  const chosen = backendById(pref.source);
  if (!chosen || backendDisabledReason(chosen)) {
    return { source: fallback.source, provider: pref.provider || '' };
  }
  return pref;
}

function saveBackendPref(pref) {
  try {
    localStorage.setItem(BACKEND_KEY, JSON.stringify(pref));
  } catch (err) {
    // 隐私模式忽略
  }
}

// 选项定义来自 config.js（由 lib/servers.js / tools/build-config.js 生成）
const BACKENDS =
  Array.isArray(CONFIG.backends) && CONFIG.backends.length
    ? CONFIG.backends
    : [
        { id: 'remote', index: '①', name: '远端 API', enabled: true, hint: '由第三方公共接口代为探测。' },
        {
          id: 'server',
          index: '②',
          name: 'SGU物理机后端',
          enabled: false,
          disabledReason: '备案中，暂不可用',
          hint: '预计 2027 年 1 月左右完成 ICP 备案后开放，届时地址为 ipv6.swordsman.top:8787。',
        },
        {
          id: 'client',
          index: '③',
          name: '客户端访问（简单 ping）',
          enabled: true,
          warn: '结果可能不准确',
          hint: '浏览器只做端口是否应答的粗略试探。',
        },
      ];

function backendById(id) {
  return BACKENDS.find((b) => b.id === id) || null;
}

/** 选项是否可用（配置停用，或运行环境不支持客户端试探） */
function backendDisabledReason(backend) {
  if (backend.enabled === false) return backend.disabledReason || '暂不可用';
  if (backend.id === 'client' && !clientPingAvailable()) return clientPingBlockReason();
  return null;
}

function renderBackendCard() {
  if (!el.backendOptions) return;
  const pref = state.backend.pref;
  // API 列表以 config.js 为准（probe.js 只负责实现），保证界面与实际可用接口一致
  const providers =
    (CONFIG.probe && Array.isArray(CONFIG.probe.providers) && CONFIG.probe.providers) ||
    (window.SGUProbe && window.SGUProbe.listProviders ? window.SGUProbe.listProviders() : []);
  const activeProvider = state.backend.activeProvider || (providers[0] && providers[0].name) || '';

  const backendName = (b) => {
    const v = t(`backend.${b.id}.name`);
    return v === `backend.${b.id}.name` ? b.name : v;
  };
  const backendText = (b, key, fallback) => {
    const v = t(`backend.${b.id}.${key}`);
    return v === `backend.${b.id}.${key}` ? fallback : v;
  };
  const tag = (text, cls) => `<span class="backend-tag${cls ? ' ' + cls : ''}">${escapeHtml(text)}</span>`;

  const current = backendById(pref.source) || BACKENDS[0];
  const currentName = backendName(current);
  const currentHint = backendText(current, 'hint', current.hint);
  const currentDisabled = backendDisabledReason(current);
  const isDefault = (id) => id === (CONFIG.defaultBackend || 'remote');

  // ---------- 主下拉：选项 ①②③ ----------
  const menuItems = BACKENDS.map((backend) => {
    const disabledReason = backendDisabledReason(backend);
    const disabled = !!disabledReason;
    const selected = backend.id === pref.source;
    return `
      <button type="button" class="backend-item${selected ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}"
              role="option" aria-selected="${selected}" data-value="${escapeHtml(backend.id)}"${
      disabled ? ' disabled' : ''
    }>
        <span class="backend-item-head">
          <span class="backend-index">${escapeHtml(backend.index || '')}</span>
          <span class="backend-item-name">${escapeHtml(backendName(backend))}</span>
          ${isDefault(backend.id) ? tag(t('backend.default')) : ''}
          ${backend.warn ? tag(backendText(backend, 'warn', backend.warn), 'tag-warn') : ''}
          ${disabled ? tag(backendText(backend, 'disabled', disabledReason), 'tag-off') : ''}
          ${state.backend.via === backend.id ? tag(t('backend.inUse'), 'tag-live') : ''}
        </span>
        <span class="backend-item-hint">${escapeHtml(backendText(backend, 'hint', backend.hint))}</span>
      </button>`;
  }).join('');

  // ---------- 次级下拉：远端 API 的具体接口（仅选中①时出现） ----------
  let providerBlock = '';
  if (pref.source === 'remote' && providers.length) {
    const chosen = pref.provider || activeProvider;
    const items = providers
      .map(
        (p) => `
        <button type="button" class="backend-item${p.name === chosen ? ' is-selected' : ''}"
                role="option" aria-selected="${p.name === chosen}" data-provider="${escapeHtml(p.name)}">
          <span class="backend-item-head">
            <span class="backend-item-name mono">${escapeHtml(p.name)}</span>
            ${p.name === chosen ? tag(t('backend.inUse'), 'tag-live') : ''}
          </span>
          <span class="backend-item-hint">${escapeHtml(p.note || '')}</span>
        </button>`
      )
      .join('');
    providerBlock = `
      <div class="backend-field backend-field-sub">
        <span class="backend-field-label">${escapeHtml(t('backend.subtoggle'))}</span>
        <div class="backend-dropdown">
          <button type="button" class="backend-select backend-select-sm" id="provider-toggle"
                  aria-haspopup="listbox" aria-expanded="${state.backend.providerMenuOpen ? 'true' : 'false'}">
            <span class="backend-select-value"><span class="mono">${escapeHtml(chosen || '—')}</span></span>
            <span class="caret" aria-hidden="true">▾</span>
          </button>
          <div class="backend-menu backend-menu-sub" id="provider-menu" role="listbox"${
            state.backend.providerMenuOpen ? '' : ' hidden'
          }>${items}</div>
        </div>
      </div>`;
  }

  el.backendOptions.innerHTML = `
    <div class="backend-field">
      <div class="backend-dropdown">
        <button type="button" class="backend-select" id="backend-toggle"
                aria-haspopup="listbox" aria-expanded="${state.backend.menuOpen ? 'true' : 'false'}">
          <span class="backend-select-value">
            <span class="backend-index">${escapeHtml(current.index || '')}</span>
            <span class="backend-select-name">${escapeHtml(currentName)}</span>
            ${isDefault(current.id) ? tag(t('backend.default')) : ''}
            ${state.backend.via === current.id ? tag(t('backend.inUse'), 'tag-live') : ''}
            ${currentDisabled ? tag(currentDisabled, 'tag-off') : ''}
          </span>
          <span class="caret" aria-hidden="true">▾</span>
        </button>
        <div class="backend-menu" id="backend-menu" role="listbox"${
          state.backend.menuOpen ? '' : ' hidden'
        }>${menuItems}</div>
      </div>
    </div>
    <p class="backend-current-hint">${escapeHtml(currentHint)}</p>
    ${providerBlock}`;

  // ---------- 事件绑定 ----------
  const mainToggle = el.backendOptions.querySelector('#backend-toggle');
  if (mainToggle) {
    mainToggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.backend.menuOpen = !state.backend.menuOpen;
      state.backend.providerMenuOpen = false;
      renderBackendCard();
    });
  }
  const providerToggle = el.backendOptions.querySelector('#provider-toggle');
  if (providerToggle) {
    providerToggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.backend.providerMenuOpen = !state.backend.providerMenuOpen;
      renderBackendCard();
    });
  }

  el.backendOptions.querySelectorAll('.backend-item[data-value]').forEach((item) => {
    item.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const value = item.getAttribute('data-value');
      const chosen = backendById(value);
      if (!chosen || backendDisabledReason(chosen)) return; // 停用项不可选
      state.backend.menuOpen = false;
      state.backend.pref = { source: value, provider: state.backend.pref.provider };
      saveBackendPref(state.backend.pref);
      renderBackendCard();
      loadStatus({ force: true });
    });
  });

  el.backendOptions.querySelectorAll('.backend-item[data-provider]').forEach((item) => {
    item.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.backend.providerMenuOpen = false;
      state.backend.pref = { source: 'remote', provider: item.getAttribute('data-provider') };
      saveBackendPref(state.backend.pref);
      renderBackendCard();
      loadStatus({ force: true });
    });
  });

  // 当前生效说明
  if (el.backendActive) {
    const via = state.backend.via;
    if (!via) {
      el.backendActive.textContent = t('backend.detecting');
    } else {
      const b = backendById(via);
      el.backendActive.textContent =
        (b ? backendName(b) : via) +
        (via === 'remote' && state.backend.activeProvider ? `（${state.backend.activeProvider}）` : '');
    }
  }
}

/**
 * 标题徽标：点击跳转官网
 * 地址取自 config.js 的 site.officialSite（由 lib/servers.js 生成）
 */
function initLogoLink() {
  const link = document.getElementById('logo-link');
  if (!link) return;
  const url = CONFIG.site && CONFIG.site.officialSite;
  if (typeof url === 'string' && /^https?:\/\//.test(url)) {
    link.setAttribute('href', url);
  }
  link.setAttribute('title', t('ui.logoTitle'));
  link.setAttribute('aria-label', t('ui.logoTitle'));
}

function renderBackendNote(text) {
  if (!el.backendNote) return;
  el.backendNote.textContent = text || '';
  el.backendNote.classList.toggle('show', !!text);
}

let state = {
  nextUpdateAt: Date.now() + REFRESH_FALLBACK_MS,
  refreshIntervalMs: REFRESH_FALLBACK_MS,
  updatedAt: null,
  loading: false,
  forceOnce: false,
  lastError: null,
  lastData: null,
  source: 'server',
  serverClockOffset: 0,
  backend: {
    pref: { source: 'remote', provider: '' }, // 用户选择（默认远端 API）
    via: null, // 本次实际使用的数据来源
    activeProvider: null, // 远端模式下实际生效的接口
    menuOpen: false, // 主下拉（①②③）是否展开
    providerMenuOpen: false, // 接口下拉是否展开
    notice: '', // 自动切换等提示
  },
};

/* ---------------- 工具函数 ---------------- */

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDateTime(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}:${pad2(d.getSeconds())}`;
}

function formatTimeShort(ts) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 服务端时钟（用于倒计时对齐） */
function now() {
  return Date.now() + state.serverClockOffset;
}

function humanDuration(ms) {
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h${minutes}m` : `${hours}h`;
}

/* ---------------- 渲染 ---------------- */

function renderOverall(data) {
  const overall = data.overall || 'partial';
  el.overall.dataset.status = overall;
  el.overall.classList.remove('loading');
  el.overallText.textContent = t(`overall.${overall}`);

  const sum = data.summary || {};
  const bits = [];
  if (typeof sum.endpointsOnline === 'number') {
    bits.push(t('summary.endpoints', { online: sum.endpointsOnline, total: sum.endpoints }));
  }
  if (typeof sum.serversUp === 'number') {
    bits.push(t('summary.servers', { up: sum.serversUp, total: sum.servers }));
  }
  if (typeof sum.playersOnline === 'number' && sum.playersOnline > 0) {
    bits.push(t('summary.players', { n: sum.playersOnline }));
  }
  el.overallSub.textContent = bits.join(' · ');
}

function renderBeats(endpointId, history, limit, intervalMs) {
  const list = Array.isArray(history) ? history.slice(-limit) : [];
  const slots = [];
  for (let i = 0; i < limit - list.length; i++) slots.push(null);
  for (const item of list) slots.push(item);

  const bars = slots
    .map((item, index) => {
      const isLast = index === slots.length - 1;
      if (!item) {
        return `<div class="beat" title="${escapeHtml(t('heartbeat.empty'))}"></div>`;
      }
      const cls = item.ok ? 'up' : 'down';
      const time = formatTimeShort(item.t);
      const latency = item.ms != null ? ` · ${item.ms} ms` : '';
      const title = t('heartbeat.tip', {
        time,
        state: item.ok ? t('endpoint.online') : t('endpoint.offline'),
        latency,
      });
      return `<div class="beat ${cls}${isLast && item.ok ? ' now' : ''}" title="${escapeHtml(title)}"></div>`;
    })
    .join('');

  return `
    <div class="wrap">
      <div class="hp-bar-big" role="img" aria-label="${escapeHtml(t('heartbeat.aria', { n: limit }))}">${bars}</div>
      <div class="word">
        <div>${escapeHtml(t('heartbeat.before', { time: humanDuration(limit * intervalMs) }))}</div>
        <div>${escapeHtml(t('heartbeat.now'))}</div>
      </div>
    </div>`;
}

/* ---------------- 彩色 MOTD ---------------- */

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** 把服务端解析好的 MOTD 分段渲染为带颜色的 HTML（不显示任何地址信息） */
function renderMotd(ep) {
  const segments = Array.isArray(ep.motdSegments) ? ep.motdSegments : [];
  if (!segments.length) return '';

  const html = segments
    .map((seg) => {
      const text = seg && typeof seg.t === 'string' ? seg.t : '';
      if (!text) return '';
      const styles = [];
      if (typeof seg.c === 'string' && HEX_COLOR.test(seg.c)) styles.push(`color:${seg.c.toUpperCase()}`);
      if (seg.b) styles.push('font-weight:700');
      if (seg.i) styles.push('font-style:italic');
      const deco = [];
      if (seg.u) deco.push('underline');
      if (seg.s) deco.push('line-through');
      if (deco.length) styles.push(`text-decoration:${deco.join(' ')}`);
      const attr = styles.length ? ` style="${styles.join(';')}"` : '';
      return `<span${attr}>${escapeHtml(text)}</span>`;
    })
    .join('');

  const plain = escapeHtml(ep.motd || '');
  return `<div class="motd" title="${plain}">${html}</div>`;
}

function state_isLowAccuracy() {
  return state.source === 'client';
}

function renderEndpoint(ep, history, limit, intervalMs) {
  const state = ep.state || (ep.online ? 'online' : 'offline');
  const statusClass = state === 'online' ? 'up' : state === 'offline' ? 'down' : 'unknown';
  const stateText = t(
    state === 'online' ? 'endpoint.online' : state === 'offline' ? 'endpoint.offline' : 'endpoint.unknown'
  );
  const metas = [];

  const lowAccuracy = ep.accuracy === 'low' || state_isLowAccuracy();
  if (state === 'online') {
    if (ep.latency != null) {
      metas.push(`<span>${escapeHtml(t('endpoint.latency'))} <span class="meta-strong">${ep.latency} ms</span></span>`);
    }
    if (ep.responseMs != null) {
      metas.push(
        `<span>${escapeHtml(t('endpoint.response'))} <span class="meta-strong">${ep.responseMs} ms</span></span>`
      );
    }
    if (ep.version) {
      metas.push(
        `<span>${escapeHtml(t('endpoint.version'))} <span class="meta-strong">${escapeHtml(ep.version)}</span></span>`
      );
    }
    if (ep.players && (ep.players.online != null || ep.players.max != null)) {
      const online = ep.players.online ?? '-';
      const max = ep.players.max ?? '-';
      metas.push(`<span>${escapeHtml(t('endpoint.players'))} <span class="meta-strong">${online}/${max}</span></span>`);
    }
  } else if (state === 'offline') {
    metas.push(`<span class="error-text">${escapeHtml(endpointMessage(ep))}</span>`);
  } else {
    metas.push(`<span class="warn-text">${escapeHtml(endpointMessage(ep))}</span>`);
  }

  const iconSrc = ep.iconData || (ep.hasIcon ? `/api/icon/${encodeURIComponent(ep.id)}?v=${ep.checkedAt || 0}` : null);
  const icon = iconSrc ? `<img class="server-icon" src="${iconSrc}" alt="" loading="lazy" onerror="this.style.display='none'">` : '';

  // 按要求：不展示任何 IP / 域名 / SRV 解析信息
  return `
    <div class="item" data-status="${statusClass}" data-endpoint="${escapeHtml(ep.id)}">
      <div class="row">
        <div class="col-left">
          <div class="info">
            ${icon}
            <span class="badge kind-badge">${escapeHtml(ep.label)}</span>
            <span class="line-name"><span class="dot"></span>${stateText}</span>
            ${lowAccuracy ? `<span class="accuracy-tag">${escapeHtml(t('endpoint.accuracyTag'))}</span>` : ''}
          </div>
          <div class="extra-info">${metas.join('')}</div>
          ${renderMotd(ep)}
        </div>
        <div class="col-right">
          ${renderBeats(ep.id, history, limit, intervalMs)}
        </div>
      </div>
    </div>`;
}

/** 每个服务器下方的第三栏：玩家交流群（整张卡片均可点击跳转） */
function renderGroupLink(server) {
  if (!server.qq || !server.qq.url) return '';
  const title = server.qq.title || t('qq.defaultTitle');
  return `
    <a class="item item-link" href="${escapeHtml(server.qq.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(
    title
  )}" data-endpoint="${escapeHtml(server.id)}-qq">
      <div class="row">
        <div class="col-left">
          <div class="info">
            <span class="badge kind-badge qq-badge">${escapeHtml(t('qq.badge'))}</span>
            <span class="group-link">${escapeHtml(title)}</span>
          </div>
          <div class="extra-info"><span>${escapeHtml(t('qq.hint'))}</span></div>
        </div>
        <span class="link-arrow" aria-hidden="true">↗</span>
      </div>
    </a>`;
}

function renderGroups(data) {
  const limit = data.historyLimit || 24;
  const intervalMs = data.historyIntervalMs || REFRESH_FALLBACK_MS;
  const history = data.history || {};

  el.groups.innerHTML = (data.servers || [])
    .map((server) => {
      const statusClass = server.status || 'partial';
      const items = (server.endpoints || [])
        .map((ep) => renderEndpoint(ep, history[ep.id], limit, intervalMs))
        .join('');
      const subtitle = server.subtitle ? ` · ${escapeHtml(server.subtitle)}` : '';
      const unknownNote = server.unknownCount ? t('summary.unknown', { n: server.unknownCount }) : '';
      return `
        <div class="group" data-server="${escapeHtml(server.id)}">
          <h2 class="group-title">
            <span class="badge status-${statusClass}">${escapeHtml(STATUS_TEXT[statusClass] || STATUS_TEXT.unknown)}</span>
            <span class="group-name">${escapeHtml(server.name)}${subtitle}</span>
            <span class="group-sub">${escapeHtml(
              t('summary.endpoints', { online: server.onlineCount, total: server.totalCount })
            )}${escapeHtml(unknownNote)}</span>
          </h2>
          <div class="shadow-box monitor-list mt-4" data-status="${statusClass}">${items}${renderGroupLink(server)}</div>
        </div>`;
    })
    .join('');
}

function renderFooter(data) {
  const ts = data.updatedAt ? new Date(data.updatedAt).getTime() : Date.now();
  state.updatedAt = ts;
  el.lastUpdated.textContent = t('footer.updated', { time: formatDateTime(ts) });
}

function showNotice(message) {
  if (!message) {
    el.notice.classList.remove('show');
    el.notice.textContent = '';
    return;
  }
  el.notice.textContent = message;
  el.notice.classList.add('show');
}

/** 顶部说明数据来源：本地后端 / 远端 API / 客户端简单 ping */
function renderSource(data) {
  if (!el.sourceNote) return;
  if (data.source === 'remote') {
    el.sourceNote.innerHTML = t('source.remote', { name: escapeHtml(data.sourceName || '—') });
  } else if (data.source === 'server') {
    const b = backendById('server');
    const v = t('backend.server.name');
    const name = v === 'backend.server.name' ? (b ? b.name : 'SGU 物理机后端') : v;
    el.sourceNote.innerHTML = t('source.server', { name: escapeHtml(name) });
  } else if (data.source === 'client') {
    el.sourceNote.innerHTML = t('source.client');
  } else {
    el.sourceNote.textContent = '';
  }
}

/* ---------------- 深色模式切换 ---------------- */

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme, persist) {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.getElementById('theme-color');
  if (meta) meta.setAttribute('content', THEME_COLOR[theme] || THEME_COLOR.light);

  const button = document.getElementById('theme-toggle');
  if (button) {
    const nextLabel = theme === 'dark' ? t('ui.themeToLight') : t('ui.themeToDark');
    button.setAttribute('aria-label', nextLabel);
    button.setAttribute('title', nextLabel);
    button.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  }
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (err) {
      // 隐私模式下无法写入，忽略
    }
  }
}

function initThemeToggle() {
  const button = document.getElementById('theme-toggle');
  applyTheme(currentTheme(), false);
  if (!button) return;
  button.addEventListener('click', () => {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
  });
}

/* ---------------- 倒计时 ---------------- */

function tickCountdown() {
  const remain = state.nextUpdateAt - now();
  if (remain <= 0) {
    el.countdown.textContent = t('footer.refreshing');
    return;
  }
  const seconds = Math.floor(remain / 1000);
  const mm = pad2(Math.floor(seconds / 60));
  const ss = pad2(seconds % 60);
  el.countdown.textContent = t('footer.countdown', { mm, ss });
}

/* ---------------- 数据获取 ---------------- */

/** 带超时的 JSON 请求（本地后端探测需要快速失败，才能及时回退） */
async function fetchJsonWithTimeout(url, ms) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => {
    if (controller) controller.abort();
  }, ms);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller ? controller.signal : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || data.ok === false) throw new Error('接口返回异常');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** 本地 / 自建后端接口 */
async function fetchFromServer() {
  const suffix = state.forceOnce ? '?refresh=1' : '';
  const urls = API_BASE ? [`${API_BASE}/api/status${suffix}`] : [`/api/status${suffix}`];
  // 页面不是由本机后端提供时（例如从 GitHub Pages 打开），额外尝试本机地址
  if (!API_BASE && typeof location !== 'undefined' && location.protocol !== 'file:') {
    const sameOrigin =
      (location.hostname === '127.0.0.1' || location.hostname === 'localhost') &&
      location.port === new URL(LOCAL_API_BASE).port;
    if (!sameOrigin) urls.push(`${LOCAL_API_BASE}/api/status${suffix}`);
  }

  let lastError = null;
  for (const url of urls) {
    try {
      const data = await fetchJsonWithTimeout(url, 5000);
      return Object.assign(data, { source: 'server' });
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(lastError ? lastError.message : '本地后端不可用');
}

/** 远端 API（浏览器直连第三方接口）/ 静态模式探测 */
async function fetchFromProbe(provider) {
  if (!window.SGUProbe) throw new Error('探测模块未加载');
  const data = await window.SGUProbe.fetchStatus(provider ? { provider } : {});
  return Object.assign(data, { source: 'remote' });
}

/**
 * 按用户选择获取数据。
 * ② 本地后端失败时自动切换到 ① 远端 API（若指定接口也失败，则依次尝试其它接口）。
 */
async function fetchByBackend() {
  const pref = state.backend.pref;
  const errors = [];
  state.backend.notice = '';

  // 选中项被停用时（例如因备案关闭的物理机后端），回退到默认项
  const chosen = backendById(pref.source);
  const blocked = chosen ? backendDisabledReason(chosen) : null;
  if (blocked) {
    const fallbackId = CONFIG.defaultBackend || 'remote';
    const nameOf = (b) => {
      const v = t(`backend.${b.id}.name`);
      return v === `backend.${b.id}.name` ? b.name : v;
    };
    state.backend.notice = t('backend.notice.disabled', {
      name: nameOf(chosen),
      reason: blocked,
      fallback: nameOf(backendById(fallbackId) || BACKENDS[0]),
    });
    state.backend.pref = { source: fallbackId, provider: pref.provider };
    return fetchByBackend();
  }

  const tryServer = async () => {
    const data = await fetchFromServer();
    state.backend.via = 'server';
    state.backend.activeProvider = null;
    return data;
  };

  const tryRemote = async (provider) => {
    let data;
    try {
      data = await fetchFromProbe(provider);
    } catch (err) {
      if (!provider) throw err;
      // 指定的接口不可用时，退回自动选择
      data = await fetchFromProbe(null);
      errors.push(t('backend.notice.providerFallback', { provider }));
    }
    if (!data.provider) {
      const first = (data.servers || [])
        .flatMap((s) => s.endpoints)
        .map((e) => e.provider)
        .find(Boolean);
      if (first) data.provider = first;
    }
    state.backend.via = 'remote';
    state.backend.activeProvider = data.provider || provider || null;
    return data;
  };

  if (pref.source === 'client' && clientPingAvailable()) {
    try {
      const data = await window.SGUProbe.simplePingStatus();
      state.backend.via = 'client';
      state.backend.activeProvider = null;
      state.backend.notice = t('backend.notice.clientMode');
      return Object.assign(data, { source: 'client' });
    } catch (err) {
      errors.push(`客户端简单 ping 失败（${err.message}）`);
      state.backend.notice = t('backend.notice.clientFallback', { reason: err.message });
      const data = await tryRemote(null);
      return data;
    }
  }
  if (pref.source === 'client') {
    state.backend.notice = t('backend.notice.clientFallback', { reason: clientPingBlockReason() });
  }

  if (pref.source === 'server') {
    try {
      return await tryServer();
    } catch (err) {
      errors.push(`本地后端不可用（${err.message}）`);
      const data = await tryRemote(null).catch((e) => {
        errors.push(`远端 API 也不可用（${e.message}）`);
        throw new Error(errors.join('；'));
      });
      state.backend.notice = t('backend.notice.fallbackServer', {
        provider: data.provider ? `（${data.provider}）` : '',
      });
      return data;
    }
  }

  // ① 远端 API（默认路径 / ③ 的兜底路径）
  try {
    return await tryRemote(pref.provider || null);
  } catch (err) {
    errors.push(`远端 API 不可用（${err.message}）`);
    // 远端也失败时，最后再试一次本地后端
    if (MODE !== 'static') {
      try {
        const data = await tryServer();
        state.backend.notice = t('backend.notice.fallbackRemote');
        return data;
      } catch (e) {
        errors.push(`本地后端也不可用（${e.message}）`);
      }
    }
    throw new Error(errors.join('；'));
  }
}

async function loadStatus(options = {}) {
  if (state.loading) return;
  state.loading = true;
  state.forceOnce = !!options.force;
  const requestedAt = Date.now();
  try {
    const data = await fetchByBackend();

    // 用响应中携带的服务端时间校正客户端时钟差，保证倒计时与刷新时刻一致
    const roundTrip = Math.max(0, Date.now() - requestedAt);
    if (typeof data.serverTime === 'number') {
      state.serverClockOffset = data.serverTime + roundTrip / 2 - Date.now();
    } else {
      state.serverClockOffset = 0;
    }

    state.refreshIntervalMs = data.refreshIntervalMs || REFRESH_FALLBACK_MS;
    const next = data.nextUpdateAt || Date.now() + state.refreshIntervalMs;
    // 兜底：若服务端给出的刷新时刻已过，避免陷入每秒请求的死循环
    state.nextUpdateAt = Math.max(next, now() + 1000);
    state.lastError = null;
    state.lastData = data;
    state.source = data.source || 'server';

    renderOverall(data);
    renderGroups(data);
    renderFooter(data);
    renderSource(data);
    renderBackendCard();
    renderBackendNote(state.backend.notice);
    // 本机（自建后端）没有 IPv6 出口时给出明确提示，避免把探测端问题误读为服务器掉线
    if (data.hostIpv6 === false) {
      showNotice(t('notice.hostNoIpv6'));
    } else {
      showNotice('');
    }
  } catch (err) {
    state.lastError = err;
    el.overall.dataset.status = 'unknown';
    el.overall.classList.remove('loading');
    el.overallText.textContent = '状态获取失败';
    showNotice(t('notice.fetchFailed', { msg: err.message }));
    renderBackendCard();
    renderBackendNote(t('backend.notice.allDown'));
    state.nextUpdateAt = Date.now() + 30 * 1000;
  } finally {
    state.loading = false;
    state.forceOnce = false;
    tickCountdown();
  }
}

/* ---------------- 调度 ---------------- */

function schedule() {
  setInterval(() => {
    tickCountdown();
    if (now() >= state.nextUpdateAt && !state.loading) {
      loadStatus({ force: true });
    }
  }, 1000);
}

// 页面重新可见时，如果已过刷新时间则立即刷新
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && now() >= state.nextUpdateAt && !state.loading) {
    loadStatus({ force: true });
  }
});

applyStaticI18n();
initLangPicker();
tickCountdown();
initThemeToggle();
initLogoLink();
state.backend.pref = readBackendPref();
renderBackendCard();
loadStatus();
schedule();
