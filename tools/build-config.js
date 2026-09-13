'use strict';
/**
 * 由 lib/servers.js 生成前端配置 public/config.js
 *
 * 静态部署（GitHub Pages）时浏览器需要自己知道要监测哪些服务器，
 * 这里把服务端配置导出成一份前端可读的配置，避免两处手工维护。
 *
 * 用法：node tools/build-config.js
 */

const fs = require('fs');
const path = require('path');
const config = require('../lib/servers');

const OUT = path.join(__dirname, '..', 'public', 'config.js');

const payload = {
  mode: 'auto', // auto：优先同源 /api/status，失败则用浏览器直连探测；也可写死 server / static
  apiBase: '', // 后端地址，例如 https://api.status.swordsman.top；留空表示同源
  localApiBase: 'http://127.0.0.1:8787', // 「本地后端」选项使用的地址
  defaultBackend: 'server', // 底部“后端选择”的默认项：server（本地后端）/ remote（远端 API）
  site: config.site,
  refreshIntervalMs: config.refreshIntervalMs,
  historyLimit: 24,
  probe: {
    // 浏览器端 DNS 解析（DoH，按顺序尝试）：阿里云公共 DNS 国内可访问且支持 SRV，
    // 后两个作为境外访客的备用解析通道
    doh: [
      'https://dns.alidns.com/resolve',
      'https://cloudflare-dns.com/dns-query',
      'https://dns.google/resolve',
    ],
    // 状态探测接口，按顺序尝试；{address} 会被替换为 域名 / IP:端口
    providers: [
      {
        name: 'mcsrvstat.us',
        url: 'https://api.mcsrvstat.us/3/{address}',
        note: '国外公共接口，IPv4 / IPv6 均支持，返回版本、人数、彩色 MOTD 与服务器图标',
      },
      {
        name: 'mcstatus.io',
        url: 'https://api.mcstatus.io/v2/status/java/{address}',
        note: '国外公共接口，作为备用；对部分 IPv6 目标支持有限',
      },
    ],
    requestTimeoutMs: 9000,
    minIntervalMs: 1100, // 第三方接口限速（约 1 次/秒）
    // 客户端“简单 ping”：向目标端口发起 WebSocket 试探的等待时间
    clientPing: { timeoutMs: 4000 },
  },
  servers: config.servers.map((server) => ({
    id: server.id,
    name: server.name,
    subtitle: server.subtitle,
    qq: server.qq || null,
    endpoints: server.endpoints.map((ep) => ({
      id: ep.id,
      kind: ep.kind,
      label: ep.label,
      host: ep.host,
      port: ep.port,
      srv: !!ep.srv,
      family: ep.family || 0,
    })),
  })),
};

const banner = `/* 由 tools/build-config.js 依据 lib/servers.js 自动生成，请勿手工修改 */\n`;
const body = `window.SGU_CONFIG = ${JSON.stringify(payload, null, 2)};\n`;
fs.writeFileSync(OUT, banner + body);
console.log(`已生成 ${path.relative(path.join(__dirname, '..'), OUT)}（${Buffer.byteLength(banner + body)} 字节）`);
