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
const BACKEND_KEY = 'sgu-backend';
const THEME_COLOR = { light: '#d7b777', dark: '#0b0e13' };

const STATUS_TEXT = {
  up: '运行正常',
  partial: '部分异常',
  down: '全部掉线',
  unknown: '未验证',
};

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
};

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
  if (typeof WebSocket === 'undefined') return '当前浏览器不支持 WebSocket';
  if (typeof location !== 'undefined' && location.protocol !== 'http:') {
    return '当前页面是 HTTPS 打开的，浏览器会拦截到目标端口的连接，请改用 http:// 打开本页';
  }
  return '当前环境不支持';
}

function readBackendPref() {
  const fallback = { source: CONFIG.defaultBackend || 'server', provider: '' };
  try {
    const raw = localStorage.getItem(BACKEND_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.source === 'string') {
      return { source: parsed.source, provider: parsed.provider || '' };
    }
  } catch (err) {
    // 忽略损坏的配置
  }
  return fallback;
}

function saveBackendPref(pref) {
  try {
    localStorage.setItem(BACKEND_KEY, JSON.stringify(pref));
  } catch (err) {
    // 隐私模式忽略
  }
}

const BACKENDS = [
  {
    id: 'remote',
    index: '①',
    name: '远端 API',
    hint: '由第三方公共接口代为探测，浏览器直接访问，不需要本机后端。IPv4 / IPv6 都能检测，但拿不到延迟，且依赖第三方服务可用性。',
  },
  {
    id: 'server',
    index: '②',
    name: '本地后端',
    hint: '使用本机运行的 Node 后端（127.0.0.1:8787），数据最完整（含延迟），全部探测在本机完成。若本机没有 IPv6 出口，IPv6 线路会显示「未验证」。默认选项；若连不上会自动切换到远端 API。',
  },
  {
    id: 'client',
    index: '③',
    name: '客户端访问（简单 ping）',
    hint: '在浏览器里做一次简单试探：解析域名后向目标端口发起 WebSocket 连接，看端口有没有响应。浏览器无法执行标准 mcping（不能建立原始 TCP 连接），因此只能判断「端口是否有人应答」，拿不到版本、人数、MOTD。',
    warn: '结果可能不准确',
  },
];

function renderBackendCard() {
  if (!el.backendOptions) return;
  const pref = state.backend.pref;
  // API 列表以 config.js 为准（probe.js 只负责实现），保证界面与实际可用接口一致
  const providers =
    (CONFIG.probe && Array.isArray(CONFIG.probe.providers) && CONFIG.probe.providers) ||
    (window.SGUProbe && window.SGUProbe.listProviders ? window.SGUProbe.listProviders() : []);
  const activeProvider = state.backend.activeProvider || (providers[0] && providers[0].name) || '';

  el.backendOptions.innerHTML = BACKENDS.map((backend) => {
    const disabled = backend.id === 'client' && !clientPingAvailable();
    const checked = pref.source === backend.id;
    const subOptions =
      backend.id === 'remote' && providers.length
        ? `<div class="backend-suboptions">${providers
            .map(
              (p) => `
          <label class="backend-suboption${disabled ? ' is-disabled' : ''}">
            <input type="radio" name="backend-provider" value="${escapeHtml(p.name)}"${
                pref.provider === p.name || (!pref.provider && activeProvider === p.name) ? ' checked' : ''
              }>
            <span class="backend-sub-body">
              <span class="backend-sub-name">${escapeHtml(p.name)}</span>
              <span class="backend-sub-note">${escapeHtml(p.note || '')}</span>
            </span>
          </label>`
            )
            .join('')}</div>`
        : '';

    return `
      <label class="backend-option${checked ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}" data-backend="${backend.id}">
        <input type="radio" name="backend-source" value="${backend.id}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}>
        <span class="backend-body">
          <span class="backend-name">
            <span class="backend-index">${backend.index}</span>${escapeHtml(backend.name)}
            ${backend.id === 'server' && !pref.source ? '<span class="backend-tag">默认</span>' : ''}
            ${backend.warn ? `<span class="backend-tag tag-warn">${escapeHtml(backend.warn)}</span>` : ''}
            ${disabled ? `<span class="backend-tag tag-off">${escapeHtml(clientPingBlockReason())}</span>` : ''}
            ${state.backend.via === backend.id ? '<span class="backend-tag tag-live">使用中</span>' : ''}
          </span>
          <span class="backend-hint">${escapeHtml(backend.hint)}</span>
          ${
            backend.id === 'server'
              ? `<span class="backend-hint">未运行时页面会自动改用远端 API，不会影响查看。${
                  typeof location !== 'undefined' && location.protocol === 'https:'
                    ? '注意：当前页面是 HTTPS 打开的，浏览器会拦截对本机 HTTP 后端的访问，请改用 http://127.0.0.1:8787 打开本页。'
                    : ''
                }</span>`
              : ''
          }
          ${subOptions}
        </span>
      </label>`;
  }).join('');

  // 绑定事件
  el.backendOptions.querySelectorAll('input[name="backend-source"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      state.backend.pref = { source: input.value, provider: state.backend.pref.provider };
      saveBackendPref(state.backend.pref);
      renderBackendCard();
      loadStatus({ force: true });
    });
  });
  el.backendOptions.querySelectorAll('input[name="backend-provider"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      state.backend.pref = { source: 'remote', provider: input.value };
      saveBackendPref(state.backend.pref);
      renderBackendCard();
      loadStatus({ force: true });
    });
  });

  // 当前生效说明（首次获取完成前不猜测）
  if (el.backendActive) {
    const names = { server: '本地后端', remote: '远端 API', client: '客户端访问（简单 ping）' };
    const via = state.backend.via;
    if (!via) {
      el.backendActive.textContent = '正在检测…';
    } else {
      el.backendActive.textContent =
        names[via] + (via === 'remote' && state.backend.activeProvider ? `（${state.backend.activeProvider}）` : '');
    }
  }
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
  source: 'server',
  serverClockOffset: 0,
  backend: {
    pref: { source: 'server', provider: '' }, // 用户选择
    via: null, // 本次实际使用的数据来源
    activeProvider: null, // 远端模式下实际生效的接口
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
  el.overallText.textContent = data.overallText || STATUS_TEXT[overall] || '状态未知';

  const s = data.summary || {};
  const bits = [];
  if (typeof s.endpointsOnline === 'number') bits.push(`入口 ${s.endpointsOnline}/${s.endpoints} 在线`);
  if (typeof s.serversUp === 'number') bits.push(`服务器 ${s.serversUp}/${s.servers} 正常`);
  if (typeof s.playersOnline === 'number' && s.playersOnline > 0) bits.push(`在线玩家 ${s.playersOnline}`);
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
        return `<div class="beat" title="暂无数据"></div>`;
      }
      const cls = item.ok ? 'up' : 'down';
      const time = formatTimeShort(item.t);
      const latency = item.ms != null ? ` · ${item.ms} ms` : '';
      const title = `${time} ${item.ok ? '在线' : '离线'}${latency}`;
      return `<div class="beat ${cls}${isLast && item.ok ? ' now' : ''}" title="${escapeHtml(title)}"></div>`;
    })
    .join('');

  return `
    <div class="wrap">
      <div class="hp-bar-big" role="img" aria-label="最近 ${limit} 次检查记录">${bars}</div>
      <div class="word">
        <div>${escapeHtml(humanDuration(limit * intervalMs))}前</div>
        <div>现在</div>
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
  const stateText = state === 'online' ? '在线' : state === 'offline' ? '离线' : '未验证';
  const metas = [];

  const lowAccuracy = ep.accuracy === 'low' || state_isLowAccuracy();
  if (state === 'online') {
    if (ep.latency != null) metas.push(`<span>延迟 <span class="meta-strong">${ep.latency} ms</span></span>`);
    if (ep.responseMs != null) {
      metas.push(`<span>端口响应 <span class="meta-strong">${ep.responseMs} ms</span></span>`);
    }
    if (ep.version) metas.push(`<span>版本 <span class="meta-strong">${escapeHtml(ep.version)}</span></span>`);
    if (ep.players && (ep.players.online != null || ep.players.max != null)) {
      const online = ep.players.online ?? '-';
      const max = ep.players.max ?? '-';
      metas.push(`<span>玩家 <span class="meta-strong">${online}/${max}</span></span>`);
    }
  } else if (state === 'offline') {
    metas.push(`<span class="error-text">${escapeHtml(ep.message || '连接失败')}</span>`);
  } else {
    metas.push(`<span class="warn-text">${escapeHtml(ep.message || '暂时无法验证该线路状态')}</span>`);
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
            ${lowAccuracy ? '<span class="accuracy-tag">结果可能不准确</span>' : ''}
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
  const title = server.qq.title || '点我加入玩家交流群';
  return `
    <a class="item item-link" href="${escapeHtml(server.qq.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(
    title
  )}" data-endpoint="${escapeHtml(server.id)}-qq">
      <div class="row">
        <div class="col-left">
          <div class="info">
            <span class="badge kind-badge qq-badge">QQ群</span>
            <span class="group-link">${escapeHtml(title)}</span>
          </div>
          <div class="extra-info"><span>点击卡片任意位置即可加入该服务器的玩家交流群</span></div>
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
      const unknownNote = server.unknownCount ? ` · ${server.unknownCount} 条线路未验证` : '';
      return `
        <div class="group" data-server="${escapeHtml(server.id)}">
          <h2 class="group-title">
            <span class="badge status-${statusClass}">${escapeHtml(STATUS_TEXT[statusClass] || '未知')}</span>
            <span class="group-name">${escapeHtml(server.name)}${subtitle}</span>
            <span class="group-sub">${server.onlineCount}/${server.totalCount} 入口在线${unknownNote}</span>
          </h2>
          <div class="shadow-box monitor-list mt-4" data-status="${statusClass}">${items}${renderGroupLink(server)}</div>
        </div>`;
    })
    .join('');
}

function renderFooter(data) {
  const ts = data.updatedAt ? new Date(data.updatedAt).getTime() : Date.now();
  state.updatedAt = ts;
  el.lastUpdated.textContent = `最后更新于 ${formatDateTime(ts)}`;
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

/** 顶部说明数据来源：本地后端 / 远端 API */
function renderSource(data) {
  if (!el.sourceNote) return;
  if (data.source === 'remote') {
    const name = data.sourceName ? escapeHtml(data.sourceName) : '第三方接口';
    el.sourceNote.innerHTML = `数据由远端 API 代理探测（IPv4 / IPv6 均由网络节点查询，节点：${name}）`;
  } else if (data.source === 'server') {
    el.sourceNote.innerHTML = '数据由本机后端实时探测（含延迟测量）';
  } else if (data.source === 'client') {
    el.sourceNote.innerHTML =
      '数据来自浏览器「简单 ping」（仅探测端口是否有响应，<strong>结果可能不准确</strong>，仅供参考）';
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
    const nextLabel = theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';
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
    el.countdown.textContent = '正在刷新…';
    return;
  }
  const seconds = Math.floor(remain / 1000);
  const mm = pad2(Math.floor(seconds / 60));
  const ss = pad2(seconds % 60);
  el.countdown.textContent = `将于 ${mm}:${ss} 后刷新`;
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
      errors.push(`${provider} 不可用，已改用其它接口`);
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
      state.backend.notice = '当前使用「客户端简单 ping」：只检测域名解析与端口是否有响应，结果可能不准确，仅供参考。';
      return Object.assign(data, { source: 'client' });
    } catch (err) {
      errors.push(`客户端简单 ping 失败（${err.message}）`);
      state.backend.notice = `客户端简单 ping 不可用（${err.message}），已自动切换到远端 API。`;
      const data = await tryRemote(null);
      return data;
    }
  }
  if (pref.source === 'client') {
    state.backend.notice = `客户端简单 ping 暂不可用（${clientPingBlockReason()}），已自动切换到远端 API。`;
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
      state.backend.notice = `本地后端未运行或无法访问，已自动切换为远端 API${
        data.provider ? `（${data.provider}）` : ''
      }。`;
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
        state.backend.notice = '远端 API 不可用，已自动改用本地后端。';
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
    state.source = data.source || 'server';

    renderOverall(data);
    renderGroups(data);
    renderFooter(data);
    renderSource(data);
    renderBackendCard();
    renderBackendNote(state.backend.notice);
    // 本机（自建后端）没有 IPv6 出口时给出明确提示，避免把探测端问题误读为服务器掉线
    if (data.hostIpv6 === false) {
      showNotice('当前探测端（本机）没有 IPv6 网络，IPv6 线路无法验证，已标记为「未验证」而非离线。');
    } else {
      showNotice('');
    }
  } catch (err) {
    state.lastError = err;
    el.overall.dataset.status = 'unknown';
    el.overall.classList.remove('loading');
    el.overallText.textContent = '状态获取失败';
    showNotice(`无法获取服务器状态（${err.message}），将在 30 秒后重试。`);
    renderBackendCard();
    renderBackendNote('所有数据来源都不可用，请检查网络，或在页面底部切换“后端选择”。');
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

tickCountdown();
initThemeToggle();
state.backend.pref = readBackendPref();
renderBackendCard();
loadStatus();
schedule();
