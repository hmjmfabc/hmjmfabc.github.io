'use strict';
/**
 * 监测核心：DNS 解析（含 SRV）→ Minecraft 状态探测 → 状态聚合 → 快照缓存 + 历史记录。
 */

const dns = require('dns');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { ping } = require('./mcping');
const config = require('./servers');

const resolver = new dns.promises.Resolver();
// 使用公共 DNS 解析，避免部分 Android/Termux 环境下系统解析器对 SRV 记录支持不完整
resolver.setServers(['223.5.5.5', '119.29.29.29', '1.1.1.1', '8.8.8.8']);

const HISTORY_FILE = path.join(__dirname, '..', 'data', 'history.json');
const HISTORY_LIMIT = 24; // 24 × 5 分钟 = 2 小时

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */

function withTimeout(promise, ms, onTimeoutMessage) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error(onTimeoutMessage || '操作超时'), { code: 'ETIMEDOUT' })), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

function formatIsoLocal(date) {
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const d = new Date(date);
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const oh = pad(Math.floor(Math.abs(offset) / 60));
  const om = pad(Math.abs(offset) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}${sign}${oh}:${om}`;
}

/* ------------------------------------------------------------------ *
 * DNS 解析（带缓存）
 * ------------------------------------------------------------------ */

const dnsCache = new Map(); // key -> { at, value }

async function cachedDns(key, fn) {
  const hit = dnsCache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < config.dnsCacheTtlMs) return hit.value;
  const value = await fn();
  dnsCache.set(key, { at: now, value });
  return value;
}

function dnsErrorHint(code) {
  switch (code) {
    case 'ENOTFOUND':
    case 'ENODATA':
    case 'NXDOMAIN':
      return '无此 DNS 记录';
    case 'ETIMEOUT':
    case 'ETIMEDOUT':
      return 'DNS 查询超时';
    case 'SERVFAIL':
      return 'DNS 服务器返回失败';
    default:
      return code || 'DNS 解析失败';
  }
}

/**
 * 解析一个入口的最终连接目标。
 * @returns {Promise<{ok:boolean, method?:string, connectHost?:string, connectPort?:number, address?:string, note?:string, error?:string, message?:string}>}
 */
async function resolveEndpoint(endpoint) {
  const { host, port, srv, family } = endpoint;
  const notes = [];

  if (srv) {
    let srvRecords = null;
    try {
      srvRecords = await withTimeout(
        cachedDns(`srv:${host}`, () => resolver.resolveSrv(`${config.srvService}.${host}`)),
        5000,
        'SRV 查询超时'
      );
    } catch (err) {
      srvRecords = null;
      notes.push(`SRV 记录不可用（${dnsErrorHint(err.code)}）`);
    }

    if (Array.isArray(srvRecords) && srvRecords.length > 0) {
      // 优先级最低者优先，同优先级按权重随机
      const sorted = [...srvRecords].sort((a, b) => a.priority - b.priority || b.weight - a.weight);
      const target = sorted[0];
      const targetHost = String(target.name || '').replace(/\.$/, '');
      if (targetHost) {
        let address = targetHost;
        try {
          const list = await withTimeout(
            cachedDns(`a:${targetHost}`, () => resolver.resolve4(targetHost)),
            5000,
            'A 记录查询超时'
          );
          if (Array.isArray(list) && list.length) address = list[0];
        } catch (err) {
          if (family === 4) {
            notes.push(`SRV 目标 A 记录解析失败（${dnsErrorHint(err.code)}）`);
          }
        }
        return {
          ok: true,
          method: 'SRV',
          connectHost: targetHost,
          connectPort: target.port || port,
          address,
          note: `SRV → ${targetHost}:${target.port || port}`,
        };
      }
    }

    // 回退：直接解析 A 记录 + 默认端口
    try {
      const list = await withTimeout(
        cachedDns(`a:${host}`, () => resolver.resolve4(host)),
        5000,
        'A 记录查询超时'
      );
      if (Array.isArray(list) && list.length) {
        notes.push('已回退为 A 记录直连');
        return {
          ok: true,
          method: 'A',
          connectHost: host,
          connectPort: port || config.defaultPort,
          address: list[0],
          note: `A → ${list[0]}:${port || config.defaultPort}（无 SRV 记录，回退）`,
        };
      }
    } catch (err) {
      notes.push(`A 记录不可用（${dnsErrorHint(err.code)}）`);
    }

    return {
      ok: false,
      method: 'SRV',
      error: 'DNS_ERROR',
      message: `域名解析失败：${notes.join('；') || '未找到可用记录'}`,
    };
  }

  // IPv6：直接解析 AAAA
  try {
    const list = await withTimeout(
      cachedDns(`aaaa:${host}`, () => resolver.resolve6(host)),
      5000,
      'AAAA 记录查询超时'
    );
    if (Array.isArray(list) && list.length) {
      return {
        ok: true,
        method: 'AAAA',
        connectHost: host,
        connectPort: port,
        address: list[0],
        note: `AAAA → [${list[0]}]:${port}`,
      };
    }
    return { ok: false, method: 'AAAA', error: 'DNS_ERROR', message: '域名没有 AAAA（IPv6）记录' };
  } catch (err) {
    return {
      ok: false,
      method: 'AAAA',
      error: 'DNS_ERROR',
      message: `IPv6 地址解析失败：${dnsErrorHint(err.code)}`,
    };
  }
}

/* ------------------------------------------------------------------ *
 * 服务器图标（MOTD favicon）缓存
 * 大体积的 base64 图标不放进状态 JSON，改由 /api/icon/:id 单独按需返回
 * ------------------------------------------------------------------ */

const icons = new Map(); // endpointId -> { buf, at }
const ICON_MAX_BYTES = 256 * 1024;

function rememberIcon(id, favicon) {
  if (typeof favicon !== 'string') return;
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/.exec(favicon.trim());
  if (!match) return;
  try {
    const buf = Buffer.from(match[1].replace(/\s+/g, ''), 'base64');
    if (buf.length > 0 && buf.length <= ICON_MAX_BYTES) {
      icons.set(id, { buf, at: Date.now() });
    }
  } catch (err) {
    // 忽略无法解码的图标
  }
}

function getIcon(id) {
  return icons.get(id) || null;
}

/* ------------------------------------------------------------------ *
 * 探测端自身联通性自检
 * 若本机没有 IPv6 出口，IPv6 线路必须标记为「未验证」而不是「离线」，
 * 否则会把「探测端网络问题」误报成「服务器掉线」。
 * ------------------------------------------------------------------ */

const IPV6_PROBE_TARGETS = [
  ['2400:3200::1', 443], // 阿里公共 DNS（IPv6）
  ['240c::6666', 53], // 中国电信 IPv6 DNS
  ['2001:4860:4860::8888', 443], // Google DNS（IPv6）
];

let hostIpv6Cache = { at: 0, ok: null };

function tcpProbe(host, port, timeout) {
  return new Promise((resolve) => {
    let socket;
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (socket) {
        socket.removeAllListeners();
        socket.destroy();
      }
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeout);
    try {
      socket = net.connect({ host, port, family: 6 });
    } catch (err) {
      done(false);
      return;
    }
    socket.on('connect', () => done(true));
    socket.on('error', () => done(false));
  });
}

/** 本机是否具备 IPv6 出口（结果缓存 60 秒） */
async function hostHasIpv6() {
  if (hostIpv6Cache.ok !== null && Date.now() - hostIpv6Cache.at < 60 * 1000) {
    return hostIpv6Cache.ok;
  }
  let ok = false;
  for (const [host, port] of IPV6_PROBE_TARGETS) {
    // eslint-disable-next-line no-await-in-loop
    if (await tcpProbe(host, port, 3000)) {
      ok = true;
      break;
    }
  }
  hostIpv6Cache = { at: Date.now(), ok };
  return ok;
}

/* ------------------------------------------------------------------ *
 * 单个入口检查
 * ------------------------------------------------------------------ */

async function checkEndpoint(endpoint) {
  const startedAt = Date.now();
  const base = {
    id: endpoint.id,
    kind: endpoint.kind,
    label: endpoint.label,
    host: endpoint.host,
    port: endpoint.port,
    srv: !!endpoint.srv,
  };

  // IPv6 线路：先确认探测端自己有 IPv6 出口，否则只能标记为「未验证」
  if ((endpoint.family || 0) === 6 && !(await hostHasIpv6())) {
    return {
      ...base,
      online: false,
      state: 'unknown',
      latency: null,
      address: null,
      resolvedFrom: null,
      note: null,
      error: 'NO_LOCAL_IPV6',
      message: '探测端（本机）当前没有 IPv6 网络，无法验证该线路',
      hasIcon: icons.has(endpoint.id),
      checkedAt: Date.now(),
      durationMs: Date.now() - startedAt,
    };
  }

  const resolved = await resolveEndpoint(endpoint);
  if (!resolved.ok) {
    return {
      ...base,
      online: false,
      state: 'offline',
      latency: null,
      address: null,
      resolvedFrom: null,
      note: resolved.message,
      error: resolved.error,
      message: resolved.message,
      hasIcon: icons.has(endpoint.id),
      checkedAt: Date.now(),
      durationMs: Date.now() - startedAt,
    };
  }

  const result = await ping({
    host: resolved.connectHost,
    port: resolved.connectPort,
    handshakeHost: endpoint.host,
    family: endpoint.family || 0,
    timeout: config.timeoutMs,
  });

  if (result.online) rememberIcon(endpoint.id, result.favicon);

  return {
    ...base,
    online: !!result.online,
    state: result.online ? 'online' : 'offline',
    latency: result.online ? result.latency : null,
    address: resolved.address,
    resolvedFrom: resolved.method,
    note: resolved.note,
    error: result.error || null,
    message: result.online ? null : result.message || '连接失败',
    version: result.version || null,
    protocol: result.protocol ?? null,
    motd: result.motd || null,
    motdLines: result.motdLines || [],
    motdSegments: result.motdSegments || [],
    players: result.players || null,
    hasIcon: icons.has(endpoint.id),
    checkedAt: Date.now(),
    durationMs: Date.now() - startedAt,
  };
}

/* ------------------------------------------------------------------ *
 * 状态聚合
 * ------------------------------------------------------------------ */

function aggregateServerStatus(endpoints) {
  const total = endpoints.length;
  const online = endpoints.filter((e) => e.state === 'online' || (e.state === undefined && e.online)).length;
  const offline = endpoints.filter((e) => e.state === 'offline' || (e.state === undefined && !e.online)).length;
  const unknown = total - online - offline;

  if (online === total) return 'up'; // 全部在线 → 绿色
  if (offline === total) return 'down'; // 全部掉线 → 红色
  if (online === 0 && unknown === total) return 'unknown'; // 全部无法验证
  if (offline === 0 && online > 0) return 'up'; // 有线路未验证但无掉线，仍视为正常
  return 'partial'; // 有掉线也有在线（或部分未验证） → 黄色
}

function aggregateOverallStatus(servers) {
  const total = servers.length;
  const up = servers.filter((s) => s.status === 'up').length;
  const down = servers.filter((s) => s.status === 'down').length;
  const unknown = servers.filter((s) => s.status === 'unknown').length;
  if (up === total) return 'up';
  if (down === total) return 'down';
  if (up === 0 && unknown === total) return 'unknown';
  return 'partial';
}

const STATUS_TEXT = {
  up: { overall: '所有服务运行正常', server: '运行正常' },
  partial: { overall: '部分服务出现异常', server: '部分异常' },
  down: { overall: '所有服务均不可用', server: '全部掉线' },
  unknown: { overall: '状态暂时无法确定', server: '未验证' },
};

/* ------------------------------------------------------------------ *
 * 历史记录（心跳条）
 * ------------------------------------------------------------------ */

let history = {};
try {
  if (fs.existsSync(HISTORY_FILE)) {
    history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) || {};
  }
} catch (err) {
  history = {};
}

let historyDirty = false;
let historyTimer = null;

function pushHistory(endpoints, at) {
  for (const ep of endpoints) {
    const list = Array.isArray(history[ep.id]) ? history[ep.id] : [];
    list.push({ t: at, ok: !!ep.online, ms: ep.latency ?? null });
    history[ep.id] = list.slice(-HISTORY_LIMIT);
  }
  historyDirty = true;
  if (!historyTimer) {
    historyTimer = setTimeout(() => {
      historyTimer = null;
      flushHistory();
    }, 1500);
    if (historyTimer.unref) historyTimer.unref();
  }
}

function flushHistory() {
  if (!historyDirty) return;
  historyDirty = false;
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    const tmp = `${HISTORY_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(history));
    fs.renameSync(tmp, HISTORY_FILE);
  } catch (err) {
    // 历史记录写入失败不影响主流程
  }
}

function getHistorySnapshot() {
  const out = {};
  for (const [id, list] of Object.entries(history)) {
    out[id] = Array.isArray(list) ? list.slice(-HISTORY_LIMIT) : [];
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 快照缓存 + 单飞
 * ------------------------------------------------------------------ */

let snapshot = null;
let inflight = null;
let lastForceAt = 0;

function nextBoundary(from = Date.now()) {
  const interval = config.refreshIntervalMs;
  return Math.ceil((from + 1) / interval) * interval;
}

async function runChecks(reason) {
  const startedAt = Date.now();
  const flat = config.servers.flatMap((s) => s.endpoints);

  const guard = new Promise((resolve) => {
    setTimeout(() => resolve(null), config.checkHardTimeoutMs).unref?.();
  });

  const checks = Promise.all(flat.map((ep) => checkEndpoint(ep).catch((err) => ({
    id: ep.id,
    kind: ep.kind,
    label: ep.label,
    host: ep.host,
    port: ep.port,
    srv: !!ep.srv,
    online: false,
    latency: null,
    address: null,
    note: null,
    error: 'INTERNAL',
    message: err && err.message ? err.message : '内部错误',
    checkedAt: Date.now(),
    durationMs: 0,
  }))));

  const results = (await Promise.race([checks, guard])) || null;
  const byId = new Map((results || []).map((r) => [r.id, r]));

  const servers = config.servers.map((server) => {
    const endpoints = server.endpoints.map((ep) => byId.get(ep.id) || {
      id: ep.id,
      kind: ep.kind,
      label: ep.label,
      host: ep.host,
      port: ep.port,
      srv: !!ep.srv,
      online: false,
      latency: null,
      error: 'TIMEOUT',
      message: '检查超时，未取得结果',
      checkedAt: Date.now(),
    });
    const status = aggregateServerStatus(endpoints);
    return {
      id: server.id,
      name: server.name,
      subtitle: server.subtitle || '',
      qq: server.qq || null,
      status,
      statusText: STATUS_TEXT[status].server,
      onlineCount: endpoints.filter((e) => e.state === 'online' || (e.state === undefined && e.online)).length,
      unknownCount: endpoints.filter((e) => e.state === 'unknown').length,
      totalCount: endpoints.length,
      endpoints,
    };
  });

  const overall = aggregateOverallStatus(servers);
  const updatedAt = Date.now();
  const localIpv6 = await hostHasIpv6();

  const allEndpoints = servers.flatMap((s) => s.endpoints);
  pushHistory(allEndpoints, updatedAt);

  snapshot = {
    ok: true,
    source: 'server',
    site: config.site,
    overall,
    overallText: STATUS_TEXT[overall].overall,
    hostIpv6: localIpv6,
    servers,
    summary: {
      servers: servers.length,
      serversUp: servers.filter((s) => s.status === 'up').length,
      serversPartial: servers.filter((s) => s.status === 'partial').length,
      serversDown: servers.filter((s) => s.status === 'down').length,
      endpoints: allEndpoints.length,
      endpointsOnline: allEndpoints.filter((e) => e.state === 'online' || (e.state === undefined && e.online)).length,
      endpointsUnknown: allEndpoints.filter((e) => e.state === 'unknown').length,
      playersOnline: allEndpoints.reduce((sum, e) => sum + (e.online && e.players && Number.isFinite(e.players.online) ? e.players.online : 0), 0),
    },
    history: getHistorySnapshot(),
    historyIntervalMs: config.refreshIntervalMs,
    historyLimit: HISTORY_LIMIT,
    refreshIntervalMs: config.refreshIntervalMs,
    nextUpdateAt: nextBoundary(updatedAt),
    updatedAt,
    updatedAtISO: formatIsoLocal(updatedAt),
    durationMs: Date.now() - startedAt,
    reason,
  };

  if (reason !== 'scheduled' && process.env.DEBUG) {
    console.log(`[check] ${reason} 用时 ${snapshot.durationMs} ms → ${overall}`);
  }
  return snapshot;
}

/** 组装对外响应：补上服务端当前时间与下一次刷新时刻 */
function present(snap, extra = {}) {
  const nowTs = Date.now();
  return {
    ...snap,
    ...extra,
    serverTime: nowTs,
    nextUpdateAt: nextBoundary(nowTs),
  };
}

/**
 * 获取当前状态快照。
 * @param {{force?: boolean, reason?: string}} opts
 */
async function getStatus(opts = {}) {
  const nowTs = Date.now();
  if (snapshot && !opts.force && nowTs - snapshot.updatedAt < config.cacheTtlMs) {
    return present(snapshot, { cached: true });
  }
  if (opts.force) {
    if (nowTs - lastForceAt < config.forceRefreshMinIntervalMs && snapshot) {
      return present(snapshot, { cached: true, forceThrottled: true });
    }
    lastForceAt = nowTs;
  }
  if (inflight) {
    const snap = await inflight;
    return present(snap, { cached: false });
  }
  inflight = runChecks(opts.reason || (opts.force ? 'forced' : 'request'))
    .then((snap) => {
      inflight = null;
      return snap;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });
  const snap = await inflight;
  return present(snap, { cached: false });
}

/** 后台定时检查：对齐到 5 分钟整点 */
function startScheduler() {
  const tick = async () => {
    try {
      await getStatus({ force: true, reason: 'scheduled' });
    } catch (err) {
      console.error('[scheduler] 检查失败：', err.message);
    }
    const delay = Math.max(1000, nextBoundary() - Date.now());
    const timer = setTimeout(tick, delay);
    if (timer.unref) timer.unref();
  };
  const delay = Math.max(1000, nextBoundary() - Date.now());
  const timer = setTimeout(tick, delay);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = {
  getStatus,
  startScheduler,
  flushHistory,
  getIcon,
  resolveEndpoint,
  checkEndpoint,
  nextBoundary,
  aggregateServerStatus,
  hostHasIpv6,
  aggregateOverallStatus,
  getSnapshot: () => snapshot,
};
