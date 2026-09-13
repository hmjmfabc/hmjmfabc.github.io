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

function makeEl(id) {
  const el = {
    id,
    dataset: {},
    style: {},
    attrs: {},
    textContent: '',
    _html: '',
    _inputs: [],
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
    querySelectorAll(sel) {
      const m = /input\[name="([^"]+)"\]/.exec(sel);
      if (m) return (el._inputs || []).filter((i) => i.name === m[1]);
      return [];
    },
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = String(v); el._inputs = parseInputs(el._html); },
  });
  return el;
}

const els = {};
const htmlEl = makeEl('html');
htmlEl.setAttribute('data-theme', 'light');
const storage = new Map();

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
  document: {
    hidden: false,
    documentElement: htmlEl,
    getElementById: (id) => els[id] || (els[id] = makeEl(id)),
    querySelector: () => null,
    addEventListener() {},
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const file of ['config.js', 'motd.js', 'probe.js', 'app.js']) {
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
  check(/①[\s\S]*?远端 API/.test(backendHtml) && /②[\s\S]*?本地后端/.test(backendHtml), '底部“后端选择”卡片已渲染');
  check(/使用中/.test(backendHtml), '卡片标注了当前实际生效的数据来源');
  check(/远端 API/.test(els['backend-active'].textContent), `本地后端不可用时自动切换到远端 API（当前：${els['backend-active'].textContent}）`);
  check(/已自动切换/.test(els['backend-note'].textContent), `卡片给出自动切换说明（${els['backend-note'].textContent.slice(0, 40)}…）`);
  check(/远端 API/.test(els['source-note'].innerHTML), '顶部说明同步为远端 API');

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
