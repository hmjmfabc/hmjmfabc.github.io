/* 由 tools/build-config.js 依据 lib/servers.js 自动生成，请勿手工修改 */
window.SGU_CONFIG = {
  "mode": "auto",
  "apiBase": "",
  "localApiBase": "http://127.0.0.1:8787",
  "defaultBackend": "remote",
  "backends": [
    {
      "id": "remote",
      "index": "①",
      "name": "远端 API",
      "enabled": true,
      "hint": "由第三方公共接口代为探测，浏览器直接访问，不需要任何自有服务器。IPv4 / IPv6 都能检测，但拿不到网络延迟，且依赖第三方服务的可用性。展开后可选择具体接口。"
    },
    {
      "id": "server",
      "index": "②",
      "name": "Imikufans后端",
      "enabled": false,
      "disabledReason": "备案中，线上暂不可用",
      "publicUrl": "ipv6.swordsman.top:8787",
      "hint": "在自有物理机上运行的 Node 服务，数据最完整（含网络延迟测量），探测全部在自有机器上完成。按合规要求（对外提供 Web 服务需完成 ICP 备案），该方式目前仅在本机可用，线上版本暂不开放；预计 2027 年 1 月左右完成备案后于 ipv6.swordsman.top:8787 对外开放。感谢 shen 的大力支持！"
    },
    {
      "id": "client",
      "index": "③",
      "name": "客户端访问（简单 ping）",
      "enabled": true,
      "warn": "结果可能不准确",
      "hint": "在浏览器里做一次简单试探：解析域名后向目标端口发起 WebSocket 连接，看端口有没有响应。浏览器无法执行标准 mcping（不能建立原始 TCP 连接），因此只能判断「端口是否有人应答」，拿不到版本、人数、MOTD。"
    }
  ],
  "site": {
    "title": "SGU 剑客群组服 状态监测",
    "description": "SGU 剑客群组服 各服务状态监测",
    "footer": "Copyright © 剑客群组服 2024～2026",
    "themeColor": "#d7b777",
    "officialSite": "https://swordsman.top/"
  },
  "refreshIntervalMs": 300000,
  "historyLimit": 24,
  "probe": {
    "doh": [
      "https://dns.alidns.com/resolve",
      "https://cloudflare-dns.com/dns-query",
      "https://dns.google/resolve"
    ],
    "providers": [
      {
        "name": "mcsrvstat.us",
        "url": "https://api.mcsrvstat.us/3/{address}",
        "note": "国外公共接口，IPv4 / IPv6 均支持，返回版本、人数、彩色 MOTD 与服务器图标"
      },
      {
        "name": "mcstatus.io",
        "url": "https://api.mcstatus.io/v2/status/java/{address}",
        "note": "国外公共接口，作为备用；对部分 IPv6 目标支持有限"
      }
    ],
    "requestTimeoutMs": 9000,
    "minIntervalMs": 1100,
    "clientPing": {
      "timeoutMs": 4000
    }
  },
  "servers": [
    {
      "id": "main",
      "name": "主服务器",
      "subtitle": "Swordsman Group Uniform",
      "qq": {
        "title": "点我加入 ⚔️剑客群组服️⚔️ 玩家交流基地",
        "url": "https://qun.qq.com/universal-share/share?ac=1&authKey=GfoFKYjqOHlu%2BjTSAbUMRjvz9F5YmhNlty0ijfUUm9coMviOouKoz%2BLAglPCOvSN&busi_data=eyJncm91cENvZGUiOiIxMDI5NjQ5MTY3IiwidG9rZW4iOiJEcXk3R3VJSk9kdmlMM1EzVHBTdEVxKzRTc0NRV2JON2pQOUtsdUVTSWxRQ3gzNlFXTHJNUm5mWEZMdzBnd00vIiwidWluIjoiMTMwNTE3NzkyMSJ9&data=vwUDZg6hMd2SVcIYcPhdpr3iXD2azsqC7RJRR7hd0Yio1Yge847IajjY9-l9aizVfIumN0iGeUGf8ycqfuWk8w&svctype=4&tempid=h5_group_info"
      },
      "endpoints": [
        {
          "id": "main-ipv4",
          "kind": "ipv4",
          "label": "IPv4",
          "host": "mc.swordsman.top",
          "port": 25565,
          "srv": true,
          "family": 4
        },
        {
          "id": "main-ipv6",
          "kind": "ipv6",
          "label": "IPv6",
          "host": "ipv6.swordsman.top",
          "port": 25565,
          "srv": false,
          "family": 6
        }
      ]
    },
    {
      "id": "shuyouhui",
      "name": "术友汇",
      "subtitle": "VFH 术友汇 · 整合包服",
      "qq": {
        "title": "点我加入『𝐒𝐆𝐔*𝟐𝟕 | 𝐍𝐞𝐨𝐕𝐅𝐇』",
        "url": "https://qun.qq.com/universal-share/share?ac=1&authKey=EGFfIn4FQ2TCN%2FCf9ym8RLjbn0A3JyEwezEb60N9ZITGafiqFDUSoyNza9u6SRSz&busi_data=eyJncm91cENvZGUiOiIzMzc2MjYxNzkiLCJ0b2tlbiI6IkpvY3lxUWZqQW9ycVNDTmIwS1lZb3JXalZrWjNxU05seERnbmVjamU4a1JTVlhXNnpKVFd1OU1hVHNESktzS0YiLCJ1aW4iOiIxMzA1MTc3OTIxIn0%3D&data=OSk-Re8dFYDOf17NfsyqAPINK0iulheOliydJa04LtVzji0yXd576xWUTC6fMsnkwIP17oxxbm0vYgxO5ujh6A&svctype=4&tempid=h5_group_info"
      },
      "endpoints": [
        {
          "id": "shuyouhui-ipv4",
          "kind": "ipv4",
          "label": "IPv4",
          "host": "39miku.swordsman.top",
          "port": 25565,
          "srv": true,
          "family": 4
        },
        {
          "id": "shuyouhui-ipv6",
          "kind": "ipv6",
          "label": "IPv6",
          "host": "ipv6.swordsman.top",
          "port": 39831,
          "srv": false,
          "family": 6
        }
      ]
    },
    {
      "id": "holycreeper",
      "name": "圣苦力怕帝国",
      "subtitle": "Holy Creeper Empire",
      "qq": {
        "title": "点我加入『𝐒𝐆𝐔*𝟐𝟕 | Holy Creeper Empire』圣苦力怕帝国服务器",
        "url": "https://qun.qq.com/universal-share/share?ac=1&authKey=zJrEDrhSI%2BYDsCdrYetEHa199coJit6vRr1HRsjJPioCAGKSC98JLtErRYtUhuxB&busi_data=eyJncm91cENvZGUiOiIxNTMwNzI0MzIiLCJ0b2tlbiI6InBjQWZ5RGdRY2IvUExEUmwvSElSWUxCdzFacEVBTzRzRlhTaUNOdk5TMmt3eFU2YjRpbGVneUhob3g5K01tS1UiLCJ1aW4iOiIxMzA1MTc3OTIxIn0%3D&data=FysbE-DwN5EnN6zk6uCgcMKof60bqGHXuhF6gFHg2j0u5Qg6X00tBisEb1yEEq-MEuRTk_9li0-pOjfkG4FxrA&svctype=4&tempid=h5_group_info"
      },
      "endpoints": [
        {
          "id": "holycreeper-ipv4",
          "kind": "ipv4",
          "label": "IPv4",
          "host": "neohce.swordsman.top",
          "port": 25565,
          "srv": true,
          "family": 4
        },
        {
          "id": "holycreeper-ipv6",
          "kind": "ipv6",
          "label": "IPv6",
          "host": "ipv6.swordsman.top",
          "port": 10037,
          "srv": false,
          "family": 6
        }
      ]
    }
  ]
};
