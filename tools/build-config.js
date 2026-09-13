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
  localApiBase: 'http://127.0.0.1:8787', // 本机物理机后端调试地址
  defaultBackend: 'remote', // 底部“后端选择”的默认项
  // 底部“后端选择”卡片的选项定义（改这里即可启用/停用或调整文案，无需动前端代码）
  backends: [
    {
      id: 'remote',
      index: '①',
      name: '远端 API',
      enabled: true,
      hint:
        '由第三方公共接口代为探测，浏览器直接访问，不需要任何自有服务器。IPv4 / IPv6 都能检测，但拿不到网络延迟，且依赖第三方服务的可用性。展开后可选择具体接口。',
    },
    {
      id: 'server',
      index: '②',
      name: 'Imikufans后端',
      enabled: false, // 线上保持关闭（合规性考虑）；本地由 server.js 覆盖为启用
      disabledReason: '备案中，线上暂不可用',
      publicUrl: 'ipv6.swordsman.top:8787',
      hint:
        '在自有物理机上运行的 Node 服务，数据最完整（含网络延迟测量），探测全部在自有机器上完成。' +
        '按合规要求（对外提供 Web 服务需完成 ICP 备案），该方式目前仅在本机可用，线上版本暂不开放；' +
        '预计 2027 年 1 月左右完成备案后于 ipv6.swordsman.top:8787 对外开放。感谢 shen 的大力支持！',
    },
    {
      id: 'client',
      index: '③',
      name: '客户端访问（简单 ping）',
      enabled: true,
      warn: '结果可能不准确',
      hint:
        '在浏览器里做一次简单试探：解析域名后向目标端口发起 WebSocket 连接，看端口有没有响应。' +
        '浏览器无法执行标准 mcping（不能建立原始 TCP 连接），因此只能判断「端口是否有人应答」，拿不到版本、人数、MOTD。',
    },
  ],
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
