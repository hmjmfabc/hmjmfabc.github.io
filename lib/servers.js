'use strict';
/**
 * 站点与监测目标配置。
 *
 * 说明：
 *  - IPv4 入口全部为 SRV 解析（_minecraft._tcp.<host>），拿到 target/port 后再连接；
 *    Handshake 包中仍写入原始域名，避免 BungeeCord / Velocity 的 forced-host 匹配失败。
 *  - IPv6 入口直接使用给定主机与端口，并强制 IPv6 连接。
 *  - 每个服务器由 IPv4、IPv6 两个部分组成，状态聚合规则见 lib/monitor.js。
 */

const servers = [
  {
    id: 'main',
    name: '主服务器',
    subtitle: 'Swordsman Group Uniform',
    qq: {
      title: '点我加入 ⚔️剑客群组服️⚔️ 玩家交流基地',
      url: 'https://qun.qq.com/universal-share/share?ac=1&authKey=GfoFKYjqOHlu%2BjTSAbUMRjvz9F5YmhNlty0ijfUUm9coMviOouKoz%2BLAglPCOvSN&busi_data=eyJncm91cENvZGUiOiIxMDI5NjQ5MTY3IiwidG9rZW4iOiJEcXk3R3VJSk9kdmlMM1EzVHBTdEVxKzRTc0NRV2JON2pQOUtsdUVTSWxRQ3gzNlFXTHJNUm5mWEZMdzBnd00vIiwidWluIjoiMTMwNTE3NzkyMSJ9&data=vwUDZg6hMd2SVcIYcPhdpr3iXD2azsqC7RJRR7hd0Yio1Yge847IajjY9-l9aizVfIumN0iGeUGf8ycqfuWk8w&svctype=4&tempid=h5_group_info',
    },
    endpoints: [
      {
        id: 'main-ipv4',
        kind: 'ipv4',
        label: 'IPv4',
        host: 'mc.swordsman.top',
        port: 25565,
        srv: true,
        family: 4,
      },
      {
        id: 'main-ipv6',
        kind: 'ipv6',
        label: 'IPv6',
        host: 'ipv6.swordsman.top',
        port: 25565,
        srv: false,
        family: 6,
      },
    ],
  },
  {
    id: 'shuyouhui',
    name: '术友汇',
    subtitle: 'VFH 术友汇 · 整合包服',
    qq: {
      title: '点我加入『𝐒𝐆𝐔*𝟐𝟕 | 𝐍𝐞𝐨𝐕𝐅𝐇』',
      url: 'https://qun.qq.com/universal-share/share?ac=1&authKey=EGFfIn4FQ2TCN%2FCf9ym8RLjbn0A3JyEwezEb60N9ZITGafiqFDUSoyNza9u6SRSz&busi_data=eyJncm91cENvZGUiOiIzMzc2MjYxNzkiLCJ0b2tlbiI6IkpvY3lxUWZqQW9ycVNDTmIwS1lZb3JXalZrWjNxU05seERnbmVjamU4a1JTVlhXNnpKVFd1OU1hVHNESktzS0YiLCJ1aW4iOiIxMzA1MTc3OTIxIn0%3D&data=OSk-Re8dFYDOf17NfsyqAPINK0iulheOliydJa04LtVzji0yXd576xWUTC6fMsnkwIP17oxxbm0vYgxO5ujh6A&svctype=4&tempid=h5_group_info',
    },
    endpoints: [
      {
        id: 'shuyouhui-ipv4',
        kind: 'ipv4',
        label: 'IPv4',
        host: '39miku.swordsman.top',
        port: 25565,
        srv: true,
        family: 4,
      },
      {
        id: 'shuyouhui-ipv6',
        kind: 'ipv6',
        label: 'IPv6',
        host: 'ipv6.swordsman.top',
        port: 39831,
        srv: false,
        family: 6,
      },
    ],
  },
  {
    id: 'holycreeper',
    name: '圣苦力怕帝国',
    subtitle: 'Holy Creeper Empire',
    qq: {
      title: '点我加入『𝐒𝐆𝐔*𝟐𝟕 | Holy Creeper Empire』圣苦力怕帝国服务器',
      url: 'https://qun.qq.com/universal-share/share?ac=1&authKey=zJrEDrhSI%2BYDsCdrYetEHa199coJit6vRr1HRsjJPioCAGKSC98JLtErRYtUhuxB&busi_data=eyJncm91cENvZGUiOiIxNTMwNzI0MzIiLCJ0b2tlbiI6InBjQWZ5RGdRY2IvUExEUmwvSElSWUxCdzFacEVBTzRzRlhTaUNOdk5TMmt3eFU2YjRpbGVneUhob3g5K01tS1UiLCJ1aW4iOiIxMzA1MTc3OTIxIn0%3D&data=FysbE-DwN5EnN6zk6uCgcMKof60bqGHXuhF6gFHg2j0u5Qg6X00tBisEb1yEEq-MEuRTk_9li0-pOjfkG4FxrA&svctype=4&tempid=h5_group_info',
    },
    endpoints: [
      {
        id: 'holycreeper-ipv4',
        kind: 'ipv4',
        label: 'IPv4',
        host: 'neohce.swordsman.top',
        port: 25565,
        srv: true,
        family: 4,
      },
      {
        id: 'holycreeper-ipv6',
        kind: 'ipv6',
        label: 'IPv6',
        host: 'ipv6.swordsman.top',
        port: 10037,
        srv: false,
        family: 6,
      },
    ],
  },
];

module.exports = {
  site: {
    title: 'SGU 剑客群组服 状态监测',
    description: 'SGU 剑客群组服 各服务状态监测',
    footer: 'Copyright © 剑客群组服 2024～2026',
    themeColor: '#d7b777',
    officialSite: 'https://swordsman.top/', // 点击标题徽标跳转的官网地址
  },
  /** 前端自动刷新间隔：5 分钟 */
  refreshIntervalMs: 5 * 60 * 1000,
  /** 后端快照缓存时间：60 秒（避免高频点击反复探测） */
  cacheTtlMs: 60 * 1000,
  /** DNS 记录缓存时间 */
  dnsCacheTtlMs: 60 * 1000,
  /** 单次连接超时 */
  timeoutMs: 5000,
  /** 单次全量检查的硬超时（保护：即使探测层异常也能返回） */
  checkHardTimeoutMs: 12000,
  /** 强制刷新最小间隔（毫秒），防止被刷 */
  forceRefreshMinIntervalMs: 10 * 1000,
  srvService: '_minecraft._tcp',
  defaultPort: 25565,
  servers,
};
