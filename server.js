'use strict';
/**
 * SGU 剑客群组服 状态监测 —— 后端服务
 *
 * 零第三方依赖，仅使用 Node.js 内置模块。
 *
 * 启动：node server.js
 * 环境变量：
 *   PORT  监听端口（默认 8787）
 *   HOST  监听地址（默认 127.0.0.1，设为 0.0.0.0 可供局域网访问）
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./lib/servers');
const monitor = require('./lib/monitor');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// 可长期缓存的静态资源类型（这些资源在页面里都会带 ?v= 版本号，改动后 URL 随之变化）
const LONG_CACHE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff2']);

// index.html 中引用到的本地资源，服务端自动追加版本号，避免浏览器使用旧缓存
const VERSIONED_ASSETS = ['style.css', 'app.js', 'config.js', 'i18n.js', 'motd.js', 'probe.js', 'logo.png', 'favicon.png'];

/** 依据资源文件的最新修改时间生成版本号 */
function assetVersion() {
  let latest = 0;
  for (const asset of VERSIONED_ASSETS) {
    try {
      latest = Math.max(latest, fs.statSync(path.join(PUBLIC_DIR, asset)).mtimeMs);
    } catch (err) {
      // 文件不存在时忽略
    }
  }
  return Math.round(latest).toString(36);
}

let indexCache = { version: null, html: null };

/** 读取 index.html 并为本地资源加上 ?v= 版本号 */
function renderIndex() {
  const version = assetVersion();
  if (indexCache.html && indexCache.version === version) return indexCache.html;
  let html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  for (const asset of VERSIONED_ASSETS) {
    html = html.split(`${asset}"`).join(`${asset}?v=${version}"`);
  }
  html = html.replace('<!DOCTYPE html>', `<!DOCTYPE html>\n<!-- SGU 状态监测 前端资源版本: ${version} -->`);
  indexCache = { version, html };
  return html;
}

function sendHtml(res, req, html) {
  const body = Buffer.from(html, 'utf8');
  const etag = `W/"idx-${indexCache.version}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' });
    res.end();
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME['.html'],
    'Content-Length': body.length,
    'Cache-Control': 'no-cache',
    ETag: etag,
  });
  res.end(body);
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

/**
 * 本地页面专用的 config.js：
 * 线上受合规限制保持停用，但本机页面直接启用「Imikufans后端」（本机 Node 服务就是它），
 * 并把它设为默认项；连不上时会自动回退到远端 API。
 */
function renderLocalConfig() {
  const raw = fs.readFileSync(path.join(PUBLIC_DIR, 'config.js'), 'utf8');
  try {
    const body = raw.slice(raw.indexOf('{')).replace(/;\s*$/, '');
    const cfg = JSON.parse(body);
    cfg.defaultBackend = 'server';
    cfg.localBackendEnabled = true;
    if (Array.isArray(cfg.backends)) {
      const srv = cfg.backends.find((b) => b.id === 'server');
      if (srv) {
        srv.enabled = true;
        delete srv.disabledReason;
        srv.localEnabled = true;
      }
    }
    return `/* 本地服务器注入：已启用「${(cfg.backends.find((b) => b.id === 'server') || {}).name || '本地后端'}」（仅本机页面生效） */\nwindow.SGU_CONFIG = ${JSON.stringify(
      cfg,
      null,
      2
    )};\n`;
  } catch (err) {
    console.error('[server] 生成本地 config 失败，回退为原文件：', err.message);
    return raw;
  }
}

function serveStatic(req, res, urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, '');
  const target = path.join(PUBLIC_DIR, rel || 'index.html');
  if (!target.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { ok: false, error: 'Forbidden' });
    return;
  }
  if (path.basename(target) === 'index.html') {
    sendHtml(res, req, renderIndex());
    return;
  }
  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(target).toLowerCase();
    const etag = `W/"${stat.size}-${Number(stat.mtimeMs).toString(36)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' });
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      ETag: etag,
      // 图片等带版本号访问的资源可长期缓存；CSS / JS 每次都校验，避免改动后仍用旧文件
      'Cache-Control': LONG_CACHE_EXT.has(ext) ? 'public, max-age=86400' : 'no-cache',
    });
    fs.createReadStream(target).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    return;
  }

  try {
    if (pathname === '/api/status') {
      const force = ['1', 'true', 'yes'].includes(String(url.searchParams.get('refresh') || '').toLowerCase());
      const snapshot = await monitor.getStatus({ force, reason: force ? 'manual' : 'request' });
      sendJson(res, 200, snapshot);
      return;
    }

    if (pathname === '/api/servers') {
      sendJson(res, 200, {
        site: config.site,
        refreshIntervalMs: config.refreshIntervalMs,
        servers: config.servers.map((s) => ({
          id: s.id,
          name: s.name,
          subtitle: s.subtitle,
          endpoints: s.endpoints.map((e) => ({
            id: e.id,
            kind: e.kind,
            label: e.label,
            host: e.host,
            port: e.port,
            srv: !!e.srv,
          })),
        })),
      });
      return;
    }

    if (pathname === '/api/icon' || pathname.startsWith('/api/icon/')) {
      const id = decodeURIComponent(pathname.replace(/^\/api\/icon\/?/, ''));
      const icon = id ? monitor.getIcon(id) : null;
      if (!icon) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('404 Not Found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': icon.buf.length,
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(icon.buf);
      return;
    }

    if (pathname === '/api/health') {
      const snap = monitor.getSnapshot();
      sendJson(res, 200, {
        ok: true,
        uptimeSec: Math.round(process.uptime()),
        rssMb: Math.round(process.memoryUsage().rss / 1048576),
        lastCheck: snap ? snap.updatedAtISO : null,
        overall: snap ? snap.overall : null,
      });
      return;
    }

    if (pathname === '/' || pathname === '/index.html') {
      sendHtml(res, req, renderIndex());
      return;
    }

    if (pathname === '/config.js') {
      const body = Buffer.from(renderLocalConfig(), 'utf8');
      res.writeHead(200, {
        'Content-Type': MIME['.js'],
        'Content-Length': body.length,
        'Cache-Control': 'no-cache',
      });
      res.end(body);
      return;
    }

    if (pathname === '/api/version') {
      sendJson(res, 200, { ok: true, assetVersion: assetVersion(), startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString() });
      return;
    }

    serveStatic(req, res, pathname);
  } catch (err) {
    console.error('[server] 请求处理失败：', err);
    sendJson(res, 500, { ok: false, error: 'Internal Server Error', message: err.message });
  }
});

server.listen(PORT, HOST, () => {
  const snap = monitor.getSnapshot();
  console.log(`${config.site.title}`);
  console.log(`服务已启动：http://${HOST}:${PORT}/`);
  console.log(`自动刷新间隔：${config.refreshIntervalMs / 60000} 分钟`);
  console.log('本地已启用「Imikufans后端」为默认数据来源（线上版本仍为备案中不可用）');
  monitor.startScheduler();
  monitor.getStatus({ force: true, reason: 'startup' }).then((s) => {
    console.log(
      `首次检查完成：${s.overallText}（${s.summary.endpointsOnline}/${s.summary.endpoints} 个入口在线，用时 ${s.durationMs} ms）`
    );
  }).catch((err) => {
    console.error('首次检查失败：', err.message);
  });
  void snap;
});

function shutdown(signal) {
  console.log(`\n收到 ${signal}，正在退出…`);
  monitor.flushHistory();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
