'use strict';
/**
 * 端到端冒烟测试
 *   1. 校验 /api/status 的数据结构与状态聚合规则
 *   2. 用极简 DOM 桩执行 public/app.js，验证前端渲染不报错且内容完整
 *
 * 用法：先启动服务，再执行
 *   node tools/smoke-test.js [http://127.0.0.1:8787]
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE = process.argv[2] || `http://127.0.0.1:${process.env.PORT || 8787}`;

function fetchText(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        resolve(body);
      });
    }).on('error', reject);
  });
}

function fetchJson(url) {
  return fetchText(url).then((body) => JSON.parse(body));
}

/** 取响应头（用于校验缓存策略） */
function fetchHeaders(url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'HEAD' }, (res) => {
      res.resume();
      resolve({ status: res.statusCode, headers: res.headers });
    });
    req.on('error', reject);
    req.end();
  });
}

function makeEl(id) {
  return {
    id,
    dataset: {},
    style: {},
    attrs: {},
    textContent: '',
    innerHTML: '',
    handlers: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    addEventListener(type, fn) { this.handlers[type] = fn; },
    setAttribute(name, value) { this.attrs[name] = value; },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
    click() { if (this.handlers.click) this.handlers.click({ preventDefault() {} }); },
  };
}

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

const failures = [];
const warnings = [];
function check(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
  } else {
    console.log(`  ❌ ${label}`);
    failures.push(label);
  }
}
/** 与环境相关、不作为失败项的检查 */
function warn(condition, label) {
  if (condition) console.log(`  ✅ ${label}`);
  else {
    console.log(`  ⚠️  ${label}（本次环境不满足，跳过）`);
    warnings.push(label);
  }
}

/** 与后端 lib/monitor.js 完全一致的状态判定规则 */
function expectServerStatus(endpoints) {
  const total = endpoints.length;
  const online = endpoints.filter((e) => (e.state || (e.online ? 'online' : 'offline')) === 'online').length;
  const offline = endpoints.filter((e) => (e.state || (e.online ? 'online' : 'offline')) === 'offline').length;
  const unknown = total - online - offline;
  if (online === total) return 'up';
  if (offline === total) return 'down';
  if (online === 0 && unknown === total) return 'unknown';
  if (offline === 0 && online > 0) return 'up';
  return 'partial';
}

(async () => {
  console.log(`\n[1/6] 拉取状态接口 ${BASE}/api/status`);
  const data = await fetchJson(`${BASE}/api/status`);
  check(data.ok === true, '接口返回 ok');
  check(data.servers && data.servers.length === 3, `监测服务器数量为 3（实际 ${data.servers && data.servers.length}）`);
  check(data.refreshIntervalMs === 300000, `刷新间隔为 5 分钟（实际 ${data.refreshIntervalMs} ms）`);
  check(typeof data.serverTime === 'number' && data.nextUpdateAt > data.serverTime, '携带服务端时间与下次刷新时刻');
  check(typeof data.updatedAtISO === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(data.updatedAtISO), `最后更新时间格式正确（${data.updatedAtISO}）`);

  const endpoints = data.servers.flatMap((s) => s.endpoints);
  check(endpoints.filter((e) => e.kind === 'ipv4').length === 3, 'IPv4 入口 3 个');
  check(endpoints.filter((e) => e.kind === 'ipv6').length === 3, 'IPv6 入口 3 个');
  check(endpoints.filter((e) => e.kind === 'ipv4').every((e) => e.srv === true), '全部 IPv4 入口均标记为 SRV 解析');

  console.log('\n[2/6] 校验状态聚合规则');
  for (const server of data.servers) {
    const expected = expectServerStatus(server.endpoints);
    const detail = server.endpoints
      .map((e) => `${e.label}=${e.state || (e.online ? 'online' : 'offline')}`)
      .join(' ');
    check(server.status === expected, `${server.name}：${detail} → ${server.status}（期望 ${expected}）`);
  }
  const upCount = data.servers.filter((s) => s.status === 'up').length;
  const downCount = data.servers.filter((s) => s.status === 'down').length;
  const unknownCount = data.servers.filter((s) => s.status === 'unknown').length;
  const expectedOverall =
    upCount === data.servers.length ? 'up'
      : downCount === data.servers.length ? 'down'
        : upCount === 0 && unknownCount === data.servers.length ? 'unknown'
          : 'partial';
  check(data.overall === expectedOverall, `总览状态 ${data.overall}（期望 ${expectedOverall}）`);
  warn(data.hostIpv6 !== false || data.summary.endpointsUnknown > 0, '探测端无 IPv6 时，IPv6 线路被标记为「未验证」而非离线');
  warn(data.hostIpv6 === false || data.summary.endpointsUnknown === 0, '探测端有 IPv6 时，所有线路均得到确定状态');

  console.log('\n[3/6] 前端渲染测试（极简 DOM 桩）');
  const els = {};
  const htmlEl = makeEl('html');
  htmlEl.setAttribute('data-theme', 'light');
  global.document = {
    hidden: false,
    documentElement: htmlEl,
    getElementById: (id) => els[id] || (els[id] = makeEl(id)),
    querySelector: () => null,
    addEventListener() {},
  };
  global.localStorage = makeStorage();
  global.fetch = async () => ({ ok: true, status: 200, json: async () => data });

  const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  eval(code);
  await new Promise((r) => setTimeout(r, 500));

  const html = els.groups.innerHTML;
  check((html.match(/class="group"/g) || []).length === 3, '渲染出 3 个服务器分组');
  check((html.match(/class="item"/g) || []).length === 6, '渲染出 6 个入口条目');
  check((html.match(/class="beat/g) || []).length === 6 * (data.historyLimit || 24), '心跳条数量正确');
  check(!/undefined|NaN/.test(html), '渲染结果不含 undefined / NaN');
  for (const server of data.servers) {
    check(html.includes(server.name), `包含服务器名称「${server.name}」`);
  }
  check(els['last-updated'].textContent.startsWith('最后更新于'), `页脚显示最后更新时间（${els['last-updated'].textContent}）`);
  check(/^将于 \d{2}:\d{2} 后刷新$/.test(els['countdown-text'].textContent), `页脚显示刷新倒计时（${els['countdown-text'].textContent}）`);
  check(els.overall.dataset.status === data.overall, '顶部总览状态与接口一致');

  console.log('\n[4/6] 检查隐藏 IP、彩色 MOTD、交流群第三栏与页脚');
  const page = await fetchText(`${BASE}/`);
  const css = await fetchText(`${BASE}/style.css`);
  const ipPattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
  const ipv6Pattern = /(?:[0-9a-f]{0,4}:){3,}[0-9a-f]{0,4}/i;
  check(!html.includes('swordsman.top'), '页面不出现任何域名（swordsman.top）');
  check(!ipPattern.test(html), '页面不出现 IPv4 地址');
  check(!ipv6Pattern.test(html.replace(/data-endpoint="[^"]*"/g, '')), '页面不出现 IPv6 地址');
  check(!/<div class="note"/.test(html), '不渲染灰色小字解析说明（含 SRV/AAAA 信息）');
  const colored = data.servers
    .flatMap((s) => s.endpoints)
    .some((e) => (e.motdSegments || []).some((seg) => seg.c));
  if (colored) {
    check(/class="motd"[\s\S]*?style="[^"]*color:#[0-9A-F]{6}/.test(html), 'MOTD 以彩色分段渲染');
  } else {
    warn(false, '本轮无在线彩色 MOTD，跳过彩色渲染校验');
  }
  const motdRule = /\.motd\s*\{([^}]*)\}/.exec(css);
  check(!!motdRule && /background:\s*(var\(--card-bg\)|#fff\b|#ffffff|white)/i.test(motdRule[1]), 'MOTD 背景为白色');
  check(!!motdRule && !/background:\s*#(2|1|0)[0-9a-f]{2}/i.test(motdRule[1]), 'MOTD 不再使用深色背景');

  const links = html.match(/<a class="item item-link"[^>]*>/g) || [];
  check(links.length === 3, `每个服务器各有一个交流群卡片（实际 ${links.length} 个）`);
  check((html.match(/<a\s/g) || []).length === 3, '整页只有 3 个链接（卡片本身即链接，无嵌套）');
  check(
    (html.match(/<a class="item item-link"[\s\S]*?<\/a>/g) || []).every((card) => /QQ群/.test(card) && /class="group-link"/.test(card) && /点我加入/.test(card)),
    '每张卡片的整块区域都包在链接内（含徽章、标题与提示文字）'
  );
  check(/class="link-arrow"/.test(html), '卡片右侧有跳转指示箭头');
  const linkCardRule = /a\.item-link\s*\{([^}]*)\}/.exec(css);
  check(!!linkCardRule && /display:\s*block/.test(linkCardRule[1]) && /cursor:\s*pointer/.test(linkCardRule[1]), '卡片被设为整块可点击的链接');
  check(/\.item-link:hover \.group-link/.test(css) && /\.item-link:hover \.link-arrow/.test(css), '悬停整张卡片有下划线与箭头反馈');
  const hrefs = (html.match(/href="([^"]*qun\.qq\.com[^"]*)"/g) || [])
    .map((h) => h.slice(6, -1).replace(/&amp;/g, '&'));
  check(hrefs.length === 3 && hrefs.every((h) => h.includes('/universal-share/share')), '三个入口均指向 QQ 群分享链接');
  const expectedTitles = data.servers.map((s) => s.qq && s.qq.title);
  check(expectedTitles.every((t) => t && html.includes(t.replace(/&/g, '&amp;').replace(/</g, '&lt;'))), '交流群标题与配置一致（从上到下依次为三台服务器）');
  check(!/【|】/.test(html), '交流群标题不带中括号【】');
  check(expectedTitles.every((t) => t.startsWith('点我加入')), '交流群标题以「点我加入」开头');
  check(expectedTitles.length === 3 && hrefs[0] === data.servers[0].qq.url && hrefs[1] === data.servers[1].qq.url && hrefs[2] === data.servers[2].qq.url, '交流群链接顺序与服务器顺序一致');
  check(/target="_blank" rel="noopener noreferrer"/.test(html), '交流群链接使用安全的新窗口打开方式');

  check(/<div class="footer-copyright">Copyright © 剑客群组服 2024～2026<\/div>/.test(page), '页脚第一行为版权信息');
  check(/footer\s*\{[^}]*text-align:\s*center/.test(css), '页脚整体居中');
  check(/footer \.footer-copyright\s*\{[^}]*color:\s*var\(--copyright\)/.test(css), '版权行颜色跟随主题变量');
  check(/--copyright:\s*#000000/i.test(css), '浅色（默认）模式下版权行为黑色');
  check(/footer \.footer-copyright\s*\{[^}]*font-size:\s*1[5-9]px/.test(css), '版权行字号大于其它页脚文字');
  check(/id="last-updated"/.test(page) && /id="countdown-text"/.test(page), '页脚保留最后更新时间与刷新倒计时两行');

  console.log('\n[5/6] 校验静态资源缓存策略（防止浏览器继续使用旧页面）');
  check(/\/style\.css\?v=[0-9a-z]+/.test(page), 'CSS 引用带版本号');
  check(/\/app\.js\?v=[0-9a-z]+/.test(page), 'JS 引用带版本号');
  check(!/href="\/style\.css"/.test(page) && !/src="\/app\.js"/.test(page), '不存在无版本号的资源引用');
  for (const asset of ['/style.css', '/app.js', '/']) {
    const { headers } = await fetchHeaders(`${BASE}${asset}`);
    const cache = String(headers['cache-control'] || '');
    const longLived = /max-age=(\d+)/.exec(cache);
    check(!longLived || Number(longLived[1]) <= 300, `${asset} 不会被长期缓存（${cache || '无'}）`);
  }
  const version = await fetchJson(`${BASE}/api/version`);
  check(version.ok === true && typeof version.assetVersion === 'string', `资源版本接口可用（${version.assetVersion}）`);
  check(page.includes(version.assetVersion), '页面资源版本与接口一致');

  console.log('\n[6/6] 校验深色模式与右上角切换按钮');
  check(/<button id="theme-toggle"/.test(page), '页面存在主题切换按钮');
  check(/class="icon-sun"/.test(page) && /class="icon-moon"/.test(page), '按钮含太阳 / 月亮两个图标');
  const toggleRule = /\.theme-toggle\s*\{([^}]*)\}/.exec(css);
  check(!!toggleRule && /position:\s*fixed/.test(toggleRule[1]), '按钮使用固定定位');
  check(!!toggleRule && /top:\s*\d+px/.test(toggleRule[1]) && /right:\s*\d+px/.test(toggleRule[1]), '按钮固定在右上角（top + right）');
  check(!!toggleRule && /z-index:\s*\d+/.test(toggleRule[1]), '按钮层级高于内容');
  const darkRule = /html\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(css);
  check(!!darkRule, 'CSS 定义了深色主题变量');
  check(!!darkRule && /--bg:\s*#0[0-9a-f]{5}/i.test(darkRule[1]) && /--card-bg:\s*#0[0-9a-f]{5}/i.test(darkRule[1]), '深色主题使用深色背景');
  check(!!darkRule && /--copyright:\s*#ffffff/i.test(darkRule[1]), '深色模式下版权行转为白色（保持可读）');
  check(/\.motd\s*\{[^}]*background:\s*var\(--card-bg\)/.test(css), 'MOTD 背景跟随主题');
  check(/localStorage\.getItem\('sgu-theme'\)/.test(page), '首屏脚本读取已保存的主题偏好');
  check(/prefers-color-scheme:\s*dark/.test(page), '首次访问时跟随系统深色偏好');
  check(/THEME_KEY = 'sgu-theme'/.test(code), '前端记录主题偏好键名');

  // 模拟点击切换按钮
  const before = htmlEl.getAttribute('data-theme');
  check(before === 'light', `初始主题为浅色（${before}）`);
  if (els['theme-toggle'] && els['theme-toggle'].handlers.click) {
    els['theme-toggle'].click();
    check(htmlEl.getAttribute('data-theme') === 'dark', `点击后切换为深色（${htmlEl.getAttribute('data-theme')}）`);
    check(global.localStorage.getItem('sgu-theme') === 'dark', '切换结果写入 localStorage');
    check(els['theme-toggle'].getAttribute('aria-label') === '切换到浅色模式', '按钮无障碍标签随状态更新');
    els['theme-toggle'].click();
    check(htmlEl.getAttribute('data-theme') === 'light', '再次点击切回浅色');
    check(global.localStorage.getItem('sgu-theme') === 'light', '再次切换同样写入 localStorage');
  } else {
    check(false, '切换按钮已绑定点击事件');
  }

  if (failures.length) {
    console.error(`\n❌ 冒烟测试未通过，失败 ${failures.length} 项\n`);
    process.exit(1);
  }
  console.log('\n✅ 全部检查通过\n');
  process.exit(0);
})().catch((err) => {
  console.error('冒烟测试异常：', err.message);
  process.exit(1);
});
