/* 由 tools/build-config.js 依据 lib/servers.js 自动生成，请勿手工修改 */
window.SGU_CONFIG = {
  "mode": "auto",
  "apiBase": "",
  "localApiBase": "http://127.0.0.1:8787",
  "defaultBackend": "server",
  "site": {
    "title": "SGU 剑客群组服 状态监测",
    "description": "SGU 剑客群组服 各服务状态监测",
    "footer": "Copyright © 剑客群组服 2024～2026",
    "themeColor": "#d7b777"
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
    "minIntervalMs": 1100
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
