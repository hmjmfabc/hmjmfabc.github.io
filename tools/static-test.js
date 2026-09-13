'use strict';
/**
 * 静态模式（GitHub Pages 用）端到端验证
 *
 * 在 Node 中模拟浏览器环境，真实执行 public/ 下的前端代码：
 *   config.js → motd.js → probe.js（DoH + 第三方接口）→ app.js（渲染）
 * 并模拟「没有后端接口」的 Pages 环境（/api/status 必然失败）。
 *
 * 用法：node tools/static-test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUB = path.join(__dirname, '..', 'public');

/* ---------------- 极简 DOM / 浏览器桩 ---------------- */

function matchSelector(tags, sel) {
  const s = String(sel).trim();
  const idMatch = /^#([\w-]+)$/.exec(s);
  if (idMatch) return tags.filter((x) => x.attrs.id === idMatch[1]);
  const m = /^(?:([a-zA-Z][\w-]*))?(?:\.([\w-]+))?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/.exec(s);
  if (!m) return [];
  const [, tag, cls, attr, val] = m;
  return tags.filter((x) => {
    if (tag && x.tag !== tag.toLowerCase()) return false;
    if (cls && !String(x.attrs.class || '').split(/\s+/).includes(cls)) return false;
    if (attr) {
      if (!Object.prototype.hasOwnProperty.call(x.attrs, attr)) return false;
      if (val !== undefined && x.attrs[attr] !== val) return false;
    }
    return true;
  });
}

function parseTags(html) {
  const out = [];
  const re = /<([a-zA-Z][\w-]*)\b([^>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = {};
    const attrRe = /([a-zA-Z-]+)(?:="([^"]*)")?/g;
    let a;
    while ((a = attrRe.exec(m[2]))) attrs[a[1]] = a[2] === undefined ? true : a[2];
    out.push({
      tag: m[1].toLowerCase(),
      attrs,
      handlers: {},
      addEventListener(type, fn) { this.handlers[type] = fn; },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
      },
      hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name); },
      click() {
        if (this.handlers.click) this.handlers.click({ preventDefault() {}, stopPropagation() {}, target: this });
      },
    });
  }
  return out;
}

function parseInputs(html) {
  const out = [];
  const re = /<input\b([^>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = {};
    const attrRe = /([a-zA-Z-]+)(?:="([^"]*)")?/g;
    let a;
    while ((a = attrRe.exec(m[1]))) attrs[a[1]] = a[2] === undefined ? true : a[2];
    out.push({
      name: attrs.name,
      value: attrs.value,
      checked: attrs.checked !== undefined,
      disabled: attrs.disabled !== undefined,
      handlers: {},
      addEventListener(type, fn) { this.handlers[type] = fn; },
      dispatchChange() { if (this.handlers.change) this.handlers.change({ target: this }); },
    });
  }
  return out;
}

function parseButtons(html) {
  const out = [];
  const re = /<button\b([^>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = {};
    const attrRe = /([a-zA-Z-]+)(?:="([^"]*)")?/g;
    let a;
    while ((a = attrRe.exec(m[1]))) attrs[a[1]] = a[2] === undefined ? true : a[2];
    out.push({
      attrs,
      handlers: {},
      addEventListener(type, fn) { this.handlers[type] = fn; },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
      },
      click() {
        if (this.handlers.click) this.handlers.click({ preventDefault() {}, stopPropagation() {}, target: this });
      },
    });
  }
  return out;
}

function makeEl(id) {
  const el = {
    id,
    dataset: {},
    style: {},
    attrs: {},
    textContent: '',
    _html: '',
    _inputs: [],
    _tags: [],
    handlers: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c, on) { if (on) this._s.add(c); else this._s.delete(c); },
    },
    addEventListener(type, fn) { this.handlers[type] = fn; },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    click() { if (this.handlers.click) this.handlers.click({ preventDefault() {} }); },
    querySelectorAll(sel) { return matchSelector(el._tags || [], sel); },
    querySelector(sel) { return matchSelector(el._tags || [], sel)[0] || null; },
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = String(v); el._inputs = parseInputs(el._html); el._tags = parseTags(el._html); },
  });
  return el;
}

const els = {};
const htmlEl = makeEl('html');
htmlEl.setAttribute('data-theme', 'light');
const storage = new Map();
storage.set('sgu-lang', 'zh-CN'); // 固定语言，保证断言稳定（Node 的 navigator.language 为 en-US）

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Date,
  Math,
  JSON,
  Number,
  String,
  Object,
  Array,
  Promise,
  Error,
  RegExp,
  isNaN,
  parseInt,
  parseFloat,
  encodeURIComponent,
  decodeURIComponent,
  // 模拟 Pages：不存在同源 /api/status，相对地址请求直接失败
  fetch: async (url, opts) => {
    if (typeof url === 'string' && url.startsWith('/')) {
      throw new TypeError('Failed to parse URL from ' + url);
    }
    return fetch(url, opts);
  },
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
  location: { protocol: 'http:', hostname: '127.0.0.1', port: '8787', href: 'http://127.0.0.1:8787/', origin: 'http://127.0.0.1:8787' },
  WebSocket: globalThis.WebSocket,
  AbortController: globalThis.AbortController,
  document: {
    hidden: false,
    title: '',
    documentElement: htmlEl,
    getElementById: (id) => els[id] || (els[id] = makeEl(id)),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const file of ['config.js', 'i18n.js', 'motd.js', 'probe.js', 'app.js']) {
  vm.runInContext(fs.readFileSync(path.join(PUB, file), 'utf8'), sandbox, { filename: file });
}

const failures = [];
function check(ok, label) {
  console.log(`  ${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failures.push(label);
}
/** 与当前服务器真实状态相关，不作为失败项 */
function warn(ok, label) {
  if (ok) console.log(`  ✅ ${label}`);
  else console.log(`  ⚠️  ${label}（本次探测到的实际状态如此，不算失败）`);
}

(async () => {
  console.log('模拟 GitHub Pages 环境（无后端接口），等待前端完成浏览器直连探测…\n');
  const deadline = Date.now() + 40000;
  while (!els.groups || !/class="group"/.test(els.groups.innerHTML) || els.overall.classList.contains('loading')) {
    if (Date.now() > deadline) throw new Error('等待超时，前端未渲染出结果');
    await new Promise((r) => setTimeout(r, 300));
  }

  const html = els.groups.innerHTML;
  const count = (re) => (html.match(re) || []).length;

  console.log(`总体状态：${els['overall-text'].textContent}（${els.overall.dataset.status}）`);
  console.log(`副标题：${els['overall-sub'].textContent}`);
  console.log(`页脚：${els['last-updated'].textContent} / ${els['countdown-text'].textContent}`);
  console.log(`数据来源：${els['source-note'].innerHTML || '(未标注)'}\n`);

  console.log('校验：');
  check(count(/class="group"/g) === 3, '渲染出 3 个服务器分组');
  check(count(/class="item"/g) === 6, '渲染出 6 条线路');
  check(count(/class="beat/g) === 6 * 24, '心跳条数量正确（6 × 24）');
  // 图标是 base64 数据，随机字符可能恰好包含 undefined / NaN，校验前先剔除
  const htmlNoIcon = html.replace(/src="data:image\/png;base64,[^"]*"/g, 'src="data:image/png;base64,..."');
  check(!/undefined|NaN/.test(htmlNoIcon), '渲染结果不含 undefined / NaN');
  check(!html.includes('swordsman.top'), '页面不出现任何域名');
  check(!/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(html), '页面不出现 IPv4 地址');
  check(!/\[[0-9a-f:]+\]/.test(html), '页面不出现 IPv6 地址');
  check(/class="motd"[\s\S]*?style="[^"]*color:#[0-9A-F]{6}/.test(html), 'MOTD 彩色渲染正常');
  check(count(/<a class="item item-link"/g) === 3, '三个交流群卡片为整块链接');
  check(/href="https:\/\/qun\.qq\.com/.test(html), '交流群链接指向 QQ 群');
  check(/data-status="(up|down|partial|unknown)"/.test(html), '线路状态标记正常');
  warn(/在线/.test(html), '存在在线线路');
  check(!!els['source-note'].innerHTML, '页面标注了数据来源（浏览器直连探测）');
  check(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(els['last-updated'].textContent.replace('最后更新于 ', '')), '页脚显示最后更新时间');
  check(/^将于 \d{2}:\d{2} 后刷新$/.test(els['countdown-text'].textContent), '页脚显示刷新倒计时');
  warn(els.overall.dataset.status !== 'unknown', '总体状态不是“未知”');

  // 默认选择「② 本地后端」，但该环境没有后端 → 应自动切换到远端 API
  const backendHtml = els['backend-options'].innerHTML;
  check(
    /id="backend-toggle"/.test(backendHtml) && /①/.test(backendHtml) && /远端 API/.test(backendHtml),
    '底部“后端选择”下拉已渲染（① 远端 API）'
  );
  check(/id="backend-menu"/.test(backendHtml), '下拉菜单容器存在');
  {
    const items = els['backend-options'].querySelectorAll('.backend-item[data-value]');
    check(items.length === 3, `下拉含 ①②③ 三项（实际 ${items.length}）`);
    const srv = items.find((i) => i.attrs['data-value'] === 'server');
    check(!!srv && srv.hasAttribute('disabled'), '②SGU物理机后端置灰不可选');
  }
  check(/使用中/.test(backendHtml), '卡片标注了当前实际生效的数据来源（使用中标签）');
  check(/远端 API/.test(els['backend-active'].textContent), `本地后端不可用时自动切换到远端 API（当前：${els['backend-active'].textContent}）`);
  check(/远端 API/.test(els['source-note'].innerHTML), '顶部说明同步为远端 API');
  check(
    /备案中，暂不可用/.test(backendHtml) && /2027 年 1 月/.test(backendHtml),
    '②SGU物理机后端标注备案中且不可点击'
  );
  check(/id="provider-toggle"/.test(backendHtml), '① 的探测接口下拉已渲染');
  check(/结果可能不准确/.test(backendHtml), '③标注结果可能不准确');

  console.log('\n校验选项③ 客户端简单 ping（真实执行 WebSocket 端口试探，约 5 秒）：');
  const ping = await sandbox.window.SGUProbe.simplePingStatus();
  const pings = ping.servers.flatMap((s2) => s2.endpoints);
  console.log(`  结果：${ping.overallText} · ${ping.summary.endpointsOnline}/${ping.summary.endpoints} 在线 · ${ping.summary.endpointsUnknown} 未验证（耗时 ${ping.durationMs} ms）`);
  for (const ep of pings) {
    console.log(`   - ${ep.label.padEnd(5)} ${String(ep.state).padEnd(8)} 响应 ${String(ep.responseMs ?? '-').padStart(5)} ms 参考 ${String(ep.referenceMs ?? '超时').padStart(6)}  ${ep.message || '端口有服务应答'}`);
  }
  check(ping.ok === true && ping.source === 'client', '客户端简单 ping 返回 ok 且来源为 client');
  check(ping.accuracy === 'low', '结果标记为低可信度（accuracy=low）');
  check(pings.length === 6, '覆盖全部 6 条线路');
  check(pings.every((e) => e.accuracy === 'low'), '每条线路都带低可信度标记');
  check(pings.every((e) => ['online', 'offline', 'unknown'].includes(e.state)), '每条线路状态合法');
  check(pings.some((e) => e.state === 'online'), '至少探测到一条在线线路');
  check(pings.every((e) => e.note === undefined || !e.note), '不输出任何地址信息');
  check(ping.durationMs < 15000, `耗时在可接受范围内（${ping.durationMs} ms）`);

  if (failures.length) {
    console.error(`\n❌ 静态模式校验未通过，失败 ${failures.length} 项\n`);
    process.exit(1);
  }
  console.log('\n✅ 静态模式全部校验通过（无后端也能出结果）\n');
  process.exit(0);
})().catch((err) => {
  console.error('静态模式测试异常：', err);
  process.exit(1);
});
