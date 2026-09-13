/* ============================================================
 * SGU 状态监测 —— 浏览器直连探测（静态部署用）
 *
 *  GitHub Pages 只能托管静态文件，无法运行 Node 后端，
 *  因此静态模式下由浏览器完成：
 *    1. DoH（阿里云公共 DNS）解析 SRV / A / AAAA，确定 IPv4 / IPv6 目标
 *    2. 调用公开的 Minecraft 状态接口完成 Server List Ping
 *    3. 本地汇总为与后端 /api/status 完全一致的数据结构
 *
 *  依赖：public/motd.js（MOTD 解析）、public/config.js（配置）
 * ============================================================ */
(function () {
  'use strict';

  const DEFAULT_CONFIG = {
    refreshIntervalMs: 5 * 60 * 1000,
    historyLimit: 24,
    probe: {
      doh: ['https://dns.alidns.com/resolve'],
      providers: [{ name: 'mcsrvstat.us', url: 'https://api.mcsrvstat.us/3/{address}' }],
      requestTimeoutMs: 9000,
      minIntervalMs: 1100,
    },
    servers: [],
  };

  const HISTORY_KEY = 'sgu-probe-history-v1';

  const STATUS_TEXT = {
    up: { overall: '所有服务运行正常', server: '运行正常' },
    partial: { overall: '部分服务出现异常', server: '部分异常' },
    down: { overall: '所有服务均不可用', server: '全部掉线' },
    unknown: { overall: '状态暂时无法确定', server: '未知' },
  };

  const config = () => Object.assign({}, DEFAULT_CONFIG, (typeof window !== 'undefined' && window.SGU_CONFIG) || {});
  const motdLib = () => (typeof window !== 'undefined' && window.SGUMotd) || null;

  /* ---------------- 基础工具 ---------------- */

  function withTimeout(promise, ms, message) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message || '请求超时')), ms);
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); }
      );
    });
  }

  async function getJson(url, ms) {
    const res = await withTimeout(fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' }), ms, '请求超时');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------------- DoH 解析（SRV / A / AAAA） ---------------- */

  async function dohQuery(name, type) {
    const { probe } = config();
    const servers = Array.isArray(probe.doh) ? probe.doh : [probe.doh];
    const wantType = type === 'SRV' ? 33 : type === 'AAAA' ? 28 : 1;
    let lastError = null;

    for (const server of servers) {
      if (!server) continue;
      const url = `${server}?name=${encodeURIComponent(name)}&type=${type}`;
      try {
        const res = await withTimeout(
          fetch(url, { headers: { Accept: 'application/dns-json' }, cache: 'no-store' }),
          probe.requestTimeoutMs,
          'DNS 查询超时'
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const answers = Array.isArray(data.Answer) ? data.Answer : [];
        const matched = answers.filter((a) => a.type === wantType).map((a) => String(a.data));
        if (matched.length) return matched;
        // 该解析通道可用但没有记录，直接返回空（换通道也是同样结果）
        if (typeof data.Status === 'number' && data.Status === 0) return [];
        lastError = `DNS 状态码 ${data.Status}`;
      } catch (err) {
        lastError = err.message;
      }
    }
    if (lastError) throw new Error(lastError);
    return [];
  }

  function parseSrv(data) {
    // 形如 "10 0 2779 nat.swordsman.top."
    const parts = String(data).trim().split(/\s+/);
    if (parts.length < 4) return null;
    return {
      priority: Number(parts[0]) || 0,
      weight: Number(parts[1]) || 0,
      port: Number(parts[2]) || 0,
      target: parts.slice(3).join(' ').replace(/\.$/, ''),
    };
  }

  function isIpv6(addr) {
    return typeof addr === 'string' && addr.includes(':');
  }

  /** 解析某个入口最终要探测的地址 */
  async function resolveEndpoint(endpoint) {
    const notes = [];
    if (endpoint.srv) {
      let records = [];
      try {
        records = await dohQuery(`_minecraft._tcp.${endpoint.host}`, 'SRV');
      } catch (err) {
        notes.push(`SRV 查询失败（${err.message}）`);
      }
      const parsed = records.map(parseSrv).filter(Boolean).sort((a, b) => a.priority - b.priority || b.weight - a.weight);
      if (parsed.length) {
        const target = parsed[0];
        let address = target.target;
        try {
          const list = await dohQuery(target.target, 'A');
          if (list.length) address = list[0];
        } catch (err) {
          notes.push(`A 记录查询失败（${err.message}）`);
        }
        return {
          ok: true,
          address: `${address}:${target.port}`,
          family: isIpv6(address) ? 6 : 4,
          note: `SRV → ${target.target}:${target.port}`,
        };
      }
      // 回退：A 记录 + 默认端口
      try {
        const list = await dohQuery(endpoint.host, 'A');
        if (list.length) {
          return {
            ok: true,
            address: `${list[0]}:${endpoint.port}`,
            family: 4,
            note: `A → ${list[0]}:${endpoint.port}（无 SRV 记录，回退）`,
          };
        }
      } catch (err) {
        notes.push(`A 记录查询失败（${err.message}）`);
      }
      return { ok: false, error: 'DNS_ERROR', message: `域名解析失败：${notes.join('；') || '未找到可用记录'}` };
    }

    // IPv6：解析 AAAA
    try {
      const list = await dohQuery(endpoint.host, 'AAAA');
      if (list.length) {
        const addr = list[0];
        return {
          ok: true,
          address: `[${addr}]:${endpoint.port}`,
          family: 6,
          note: `AAAA → [${addr}]:${endpoint.port}`,
        };
      }
      return { ok: false, error: 'DNS_ERROR', message: '域名没有 AAAA（IPv6）记录' };
    } catch (err) {
      return { ok: false, error: 'DNS_ERROR', message: `IPv6 地址解析失败：${err.message}` };
    }
  }

  /* ---------------- 第三方状态接口 ---------------- */

  /** 依次尝试各提供方，返回统一结构；onlyProvider 可指定只用某一个接口 */
  async function queryProvider(address, resolved, onlyProvider) {
    const { probe } = config();
    const list = (probe.providers || []).filter((p) => !onlyProvider || p.name === onlyProvider);
    const providers = list.length ? list : probe.providers || [];
    let lastError = null;
    for (const provider of providers) {
      const url = publicProviderUrl(provider, address);
      try {
        const data = await getJson(url, probe.requestTimeoutMs);
        return normalize(provider.name, data, resolved);
      } catch (err) {
        lastError = `${provider.name}: ${err.message}`;
      }
    }
    throw new Error(lastError || '所有探测接口均不可用');
  }

  /** 拼接接口地址：{address} 占位符替换，并保留 : 与 [ ] */
  function publicProviderUrl(provider, address) {
    return provider.url
      .replace('{address}', encodeURIComponent(address).replace(/%3A/gi, ':').replace(/%5B/gi, '[').replace(/%5D/gi, ']'));
  }

  /** 可用的远端接口列表（供“后端选择”界面展示） */
  function listProviders() {
    return (config().probe.providers || []).map((p) => ({
      name: p.name,
      url: p.url,
      note: p.note || PROVIDER_NOTES[p.name] || '',
    }));
  }

  const PROVIDER_NOTES = {
    'mcsrvstat.us': '国外公共接口，IPv4 / IPv6 均支持，返回版本、人数、彩色 MOTD 与服务器图标',
    'mcstatus.io': '国外公共接口，作为备用；对部分 IPv6 目标支持有限',
  };

  /** 把不同接口的返回统一成内部结构 */
  function normalize(provider, data, resolved) {
    if (provider === 'mcstatus.io') {
      const players = data.players || {};
      const online = !!data.online;
      return {
        provider,
        online,
        version: (data.version && (data.version.name_clean || data.version.name_raw)) || null,
        players: {
          online: Number.isFinite(players.online) ? players.online : null,
          max: Number.isFinite(players.max) ? players.max : null,
        },
        motdRaw: null,
        motdClean: null,
        icon: null,
        error: online ? null : 'OFFLINE',
        message: online ? null : '服务器未响应状态请求',
      };
    }

    // mcsrvstat.us v3
    const online = !!data.online;
    const players = data.players || {};
    const motd = data.motd || {};
    const debugError = (data.debug && data.debug.error) || {};
    let message = null;
    if (!online) {
      if (debugError.ip) {
        message = '域名解析失败（第三方解析不到该域名的 IP）';
      } else if (debugError.ping && /timed out|timeout/i.test(debugError.ping)) {
        message = '连接超时（端口无响应）';
      } else if (debugError.ping) {
        message = `连接失败：${String(debugError.ping).slice(0, 80)}`;
      } else {
        message = '服务器未响应状态请求';
      }
    }
    return {
      provider,
      online,
      version: data.version || null,
      players: {
        online: Number.isFinite(players.online) ? players.online : null,
        max: Number.isFinite(players.max) ? players.max : null,
      },
      motdRaw: motd.raw || null,
      motdClean: motd.clean || null,
      icon: typeof data.icon === 'string' ? data.icon : null,
      error: online ? null : 'OFFLINE',
      message,
      resolvedIp: data.ip || resolved.address,
    };
  }

  /**
   * 限速队列：只保证「两次请求的发起间隔」不小于 minIntervalMs，
   * 不等上一个请求返回，因此 6 条线路可以并发进行，整体耗时接近单次请求。
   */
  function createQueue(minIntervalMs) {
    let gate = Promise.resolve();
    let last = 0;
    return (task) => {
      const start = gate.then(async () => {
        const wait = Math.max(0, last + minIntervalMs - Date.now());
        if (wait > 0) await sleep(wait);
        last = Date.now();
      });
      gate = start.catch(() => {});
      return start.then(() => task());
    };
  }

  /* ---------------- 历史记录（浏览器本地） ---------------- */

  function readHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function pushHistory(endpoints, at) {
    const limit = config().historyLimit || 24;
    const history = readHistory();
    for (const ep of endpoints) {
      const list = Array.isArray(history[ep.id]) ? history[ep.id] : [];
      list.push({ t: at, ok: !!ep.online, ms: ep.latency == null ? null : ep.latency });
      history[ep.id] = list.slice(-limit);
    }
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (err) {
      // 隐私模式忽略
    }
    return history;
  }

  /* ---------------- 状态聚合 ---------------- */

  function aggregateEndpointStatus(endpoints) {
    const total = endpoints.length;
    const online = endpoints.filter((e) => e.online).length;
    const offline = endpoints.filter((e) => e.state === 'offline').length;
    const unknown = endpoints.filter((e) => e.state === 'unknown').length;
    if (online === total) return 'up';
    if (offline === total) return 'down';
    if (online === 0 && unknown === total) return 'unknown';
    if (online > 0 && offline === 0) return 'up'; // 其余为未知，视为正常但会额外标注
    if (online === 0 && offline > 0) return offline === total ? 'down' : 'partial';
    return 'partial';
  }

  function nextBoundary(from) {
    const interval = config().refreshIntervalMs || DEFAULT_CONFIG.refreshIntervalMs;
    return Math.ceil((from + 1) / interval) * interval;
  }

  /* ---------------- 主流程 ---------------- */

  async function fetchStatus(options = {}) {
    const conf = config();
    const onlyProvider = options.provider || null;
    const startedAt = Date.now();
    const flat = conf.servers.flatMap((s) => s.endpoints);
    const queue = createQueue((conf.probe && conf.probe.minIntervalMs) || 1100);

    const results = await Promise.all(
      flat.map((endpoint) =>
        queue(async () => {
          const base = {
            id: endpoint.id,
            kind: endpoint.kind,
            label: endpoint.label,
            host: endpoint.host,
            port: endpoint.port,
            srv: !!endpoint.srv,
            latency: null,
            checkedAt: Date.now(),
          };
          const resolved = await resolveEndpoint(endpoint);
          if (!resolved.ok) {
            return Object.assign(base, {
              online: false,
              state: 'offline',
              error: resolved.error,
              message: resolved.message,
              note: null,
            });
          }
          try {
            const result = await queryProvider(resolved.address, resolved, onlyProvider);
            const motd = result.motdRaw && motdLib() ? motdLib().parseMotd(result.motdRaw) : null;
            return Object.assign(base, {
              online: !!result.online,
              state: result.online ? 'online' : 'offline',
              version: result.version || null,
              players: result.players || null,
              motd: motd ? motd.text : null,
              motdSegments: motd ? motd.segments : [],
              iconData: result.icon || null,
              hasIcon: !!result.icon,
              error: result.error || null,
              message: result.message || null,
              note: null, // 按要求不展示任何地址信息
              provider: result.provider || onlyProvider || (conf.probe.providers[0] && conf.probe.providers[0].name),
            });
          } catch (err) {
            return Object.assign(base, {
              online: false,
              state: 'unknown',
              error: 'PROBE_FAILED',
              message: `第三方探测接口不可用：${err.message}`,
              note: null,
            });
          }
        })
      )
    );

    const byId = new Map(results.map((r) => [r.id, r]));
    const servers = conf.servers.map((server) => {
      const endpoints = server.endpoints.map((ep) => byId.get(ep.id)).filter(Boolean);
      const status = aggregateEndpointStatus(endpoints);
      return {
        id: server.id,
        name: server.name,
        subtitle: server.subtitle || '',
        qq: server.qq || null,
        status,
        statusText: (STATUS_TEXT[status] || STATUS_TEXT.unknown).server,
        onlineCount: endpoints.filter((e) => e.state === 'online').length,
        unknownCount: endpoints.filter((e) => e.state === 'unknown').length,
        totalCount: endpoints.length,
        endpoints,
      };
    });

    const upCount = servers.filter((s) => s.status === 'up').length;
    const downCount = servers.filter((s) => s.status === 'down').length;
    const overall = upCount === servers.length ? 'up' : downCount === servers.length ? 'down' : 'partial';

    const updatedAt = Date.now();
    const allEndpoints = servers.flatMap((s) => s.endpoints);
    const history = pushHistory(allEndpoints, updatedAt);

    return {
      ok: true,
      source: 'remote',
      sourceName: onlyProvider || (conf.probe.providers[0] && conf.probe.providers[0].name) || '远端接口',
      site: conf.site,
      overall,
      overallText: (STATUS_TEXT[overall] || STATUS_TEXT.unknown).overall,
      servers,
      summary: {
        servers: servers.length,
        serversUp: upCount,
        serversPartial: servers.filter((s) => s.status === 'partial').length,
        serversDown: downCount,
        endpoints: allEndpoints.length,
        endpointsOnline: allEndpoints.filter((e) => e.state === 'online').length,
        endpointsUnknown: allEndpoints.filter((e) => e.state === 'unknown').length,
        playersOnline: allEndpoints.reduce(
          (sum, e) => sum + (e.online && e.players && Number.isFinite(e.players.online) ? e.players.online : 0),
          0
        ),
      },
      history,
      historyIntervalMs: conf.refreshIntervalMs,
      historyLimit: conf.historyLimit || 24,
      refreshIntervalMs: conf.refreshIntervalMs,
      nextUpdateAt: nextBoundary(updatedAt),
      updatedAt,
      updatedAtISO: new Date(updatedAt).toISOString(),
      durationMs: Date.now() - startedAt,
    };
  }

  window.SGUProbe = { fetchStatus, resolveEndpoint, dohQuery, readHistory, listProviders, publicProviderUrl };
})();
