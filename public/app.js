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
const MODE = CONFIG.mode || 'auto'; // auto | server | static
const API = `${API_BASE}/api/status`;
const THEME_KEY = 'sgu-theme';
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
};

let state = {
  nextUpdateAt: Date.now() + REFRESH_FALLBACK_MS,
  refreshIntervalMs: REFRESH_FALLBACK_MS,
  updatedAt: null,
  loading: false,
  forceOnce: false,
  lastError: null,
  source: 'server',
  serverClockOffset: 0,
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

function renderEndpoint(ep, history, limit, intervalMs) {
  const state = ep.state || (ep.online ? 'online' : 'offline');
  const statusClass = state === 'online' ? 'up' : state === 'offline' ? 'down' : 'unknown';
  const stateText = state === 'online' ? '在线' : state === 'offline' ? '离线' : '未验证';
  const metas = [];

  if (state === 'online') {
    if (ep.latency != null) metas.push(`<span>延迟 <span class="meta-strong">${ep.latency} ms</span></span>`);
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

/** 顶部说明数据来源，静态部署时明确告知由浏览器直连探测 */
function renderSource(data) {
  if (!el.sourceNote) return;
  if (data.source === 'static') {
    const name = data.sourceName ? escapeHtml(data.sourceName) : '第三方接口';
    el.sourceNote.innerHTML = `数据由浏览器实时探测（IPv4 / IPv6 均通过网络节点查询，节点：${name}）`;
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

/** 同源 / 指定地址的后端接口 */
async function fetchFromServer() {
  const res = await fetch(`${API}${state.forceOnce ? '?refresh=1' : ''}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data || data.ok === false) throw new Error('接口返回异常');
  return Object.assign(data, { source: 'server' });
}

/** 浏览器直连探测（静态部署） */
async function fetchFromProbe() {
  if (!window.SGUProbe) throw new Error('探测模块未加载');
  const data = await window.SGUProbe.fetchStatus();
  return Object.assign(data, { source: 'static' });
}

async function loadStatus(options = {}) {
  if (state.loading) return;
  state.loading = true;
  state.forceOnce = !!options.force;
  const requestedAt = Date.now();
  try {
    let data = null;
    let serverError = null;

    if (MODE !== 'static') {
      try {
        data = await fetchFromServer();
      } catch (err) {
        serverError = err;
        if (MODE === 'server') throw err;
      }
    }

    if (!data) {
      try {
        data = await fetchFromProbe();
      } catch (err) {
        throw serverError ? new Error(`${serverError.message}；浏览器探测同样失败：${err.message}`) : err;
      }
    }

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
loadStatus();
schedule();
