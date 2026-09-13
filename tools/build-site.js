'use strict';
/**
 * 构建 GitHub Pages 静态站点产物到 dist/
 *
 *   1. 依据 lib/servers.js 重新生成 public/config.js
 *   2. 复制 public/ → dist/
 *   3. 给 index.html 中的本地资源加版本号（避免 Pages 缓存旧文件）
 *   4. 写入 CNAME（自定义域名）与 .nojekyll
 *
 * 用法：
 *   node tools/build-site.js                       # 输出到 dist/（Actions 部署用）
 *   node tools/build-site.js --out=docs            # 输出到 docs/（分支部署用，需提交）
 *   node tools/build-site.js --version=abc123      # 指定版本号（CI 里传 commit sha）
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DOMAIN = process.env.SITE_DOMAIN || 'status.yunmc.icu';
const ASSETS = ['/style.css', '/app.js', '/config.js', '/motd.js', '/probe.js', '/logo.png', '/favicon.png'];

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

// 输出目录：
//   dist（默认）——配合 GitHub Actions 部署（.github/workflows/pages.yml）
//   docs        ——配合「Deploy from a branch → main /docs」部署，随仓库一起提交
const OUT_NAME = argValue('out') || 'dist';
const DIST_DIR = path.join(ROOT, OUT_NAME);

// 1. 生成前端配置
execFileSync(process.execPath, [path.join(__dirname, 'build-config.js')], { stdio: 'inherit' });

// 2. 复制静态文件
fs.rmSync(DIST_DIR, { recursive: true, force: true });
fs.mkdirSync(DIST_DIR, { recursive: true });
for (const entry of fs.readdirSync(PUBLIC_DIR, { withFileTypes: true })) {
  const src = path.join(PUBLIC_DIR, entry.name);
  const dest = path.join(DIST_DIR, entry.name);
  if (entry.isDirectory()) {
    fs.cpSync(src, dest, { recursive: true });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// 3. 资源加版本号
const version = (argValue('version') || String(Date.now())).slice(0, 12);
let html = fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf8');
for (const asset of ASSETS) {
  html = html.split(`${asset}"`).join(`${asset}?v=${version}"`);
}
html = html.replace('<!DOCTYPE html>', `<!DOCTYPE html>\n<!-- SGU 状态监测 静态构建版本: ${version} -->`);
fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html);

// 4. CNAME / .nojekyll
fs.writeFileSync(path.join(DIST_DIR, 'CNAME'), `${DOMAIN}\n`);
fs.writeFileSync(path.join(DIST_DIR, '.nojekyll'), '');

// 统计
let bytes = 0;
let files = 0;
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else { bytes += fs.statSync(p).size; files += 1; }
  }
};
walk(DIST_DIR);

console.log(`\n静态站点已生成：${OUT_NAME}/`);
console.log(`  版本号   : ${version}`);
console.log(`  自定义域 : ${DOMAIN}`);
console.log(`  文件数量 : ${files}`);
console.log(`  总大小   : ${(bytes / 1024).toFixed(1)} KB`);
console.log(`  入口文件 : ${OUT_NAME}/index.html`);
