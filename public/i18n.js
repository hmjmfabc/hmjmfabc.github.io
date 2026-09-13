/* ============================================================
 * SGU 状态监测 —— 多语言支持
 *   简体中文（zh-CN，默认）、繁體中文（zh-TW）、English（en）、
 *   文言（华夏）（lzh）、日本語（ja）
 *
 * 用法：
 *   SGUI18n.t('status.up')                 → 取当前语言文案
 *   SGUI18n.t('footer.updated', {time:x})  → 带变量替换
 *   SGUI18n.setLang('en')                  → 切换语言（会写入 localStorage 并触发重渲染）
 * ============================================================ */
(function () {
  'use strict';

  const LANGS = [
    { code: 'zh-CN', label: '简体中文', short: '简' },
    { code: 'zh-TW', label: '繁體中文', short: '繁' },
    { code: 'en', label: 'English', short: 'EN' },
    { code: 'lzh', label: '文言（华夏）', short: '文' },
    { code: 'ja', label: '日本語', short: '日' },
  ];

  const DICT = {
    /* ---------------- 简体中文 ---------------- */
    'zh-CN': {
      'site.title': 'SGU 剑客群组服 状态监测',
      'site.description': 'SGU 剑客群组服 各服务状态监测',
      'site.footer': 'Copyright © 剑客群组服 2024～2026',
      'site.loading': '正在获取服务器状态…',
      'site.skeletonGroup': '正在获取状态…',
      'site.skeletonBadge': '载入中',
      'site.skeletonItem': '加载中…',
      'site.noscript': '本页面需要启用 JavaScript 才能显示实时状态。',

      'status.up': '运行正常',
      'status.partial': '部分异常',
      'status.down': '全部掉线',
      'status.unknown': '未验证',
      'overall.up': '所有服务运行正常',
      'overall.partial': '部分服务出现异常',
      'overall.down': '所有服务均不可用',
      'overall.unknown': '状态暂时无法确定',
      'overall.fetchFailed': '状态获取失败',
      'summary.endpoints': '入口 {online}/{total} 在线',
      'summary.unknown': ' · {n} 条线路未验证',
      'summary.servers': '服务器 {up}/{total} 正常',
      'summary.players': '在线玩家 {n}',

      'endpoint.online': '在线',
      'endpoint.offline': '离线',
      'endpoint.unknown': '未验证',
      'endpoint.latency': '延迟',
      'endpoint.version': '版本',
      'endpoint.players': '玩家',
      'endpoint.response': '端口响应',
      'endpoint.accuracyTag': '结果可能不准确',
      'endpoint.msg.timeout': '连接超时，端口无响应',
      'endpoint.msg.dns': '域名解析失败',
      'endpoint.msg.refused': '服务器拒绝连接（端口未开放）',
      'endpoint.msg.unreachable': '主机不可达',
      'endpoint.msg.noipv6': '探测端（本机）当前没有 IPv6 网络，无法验证该线路',
      'endpoint.msg.nolocalipv6': '探测端当前没有 IPv6 网络，无法验证该线路',
      'endpoint.msg.probeFailed': '探测接口不可用，暂时无法验证',
      'endpoint.msg.offline': '服务器未响应状态请求',
      'endpoint.msg.unknown': '暂时无法验证该线路状态',

      'heartbeat.before': '{time}前',
      'heartbeat.now': '现在',
      'heartbeat.empty': '暂无数据',
      'heartbeat.tip': '{time} {state}{latency}',
      'heartbeat.aria': '最近 {n} 次检查记录',

      'footer.updated': '最后更新于 {time}',
      'footer.countdown': '将于 {mm}:{ss} 后刷新',
      'footer.refreshing': '正在刷新…',

      'qq.badge': 'QQ群',
      'qq.hint': '点击卡片任意位置即可加入该服务器的玩家交流群',
      'qq.defaultTitle': '点我加入玩家交流群',

      'backend.title': '后端选择',
      'backend.subtitle': '选择状态数据的获取方式，设置会保存在本机浏览器中。当前生效：',
      'backend.detecting': '正在检测…',
      'backend.default': '默认',
      'backend.inUse': '使用中',
      'backend.subtoggle': '选择探测接口',
      'backend.remote.name': '远端 API',
      'backend.remote.hint':
        '由第三方公共接口代为探测，浏览器直接访问，不需要任何自有服务器。IPv4 / IPv6 都能检测，但拿不到网络延迟，且依赖第三方服务的可用性。展开后可选择具体接口。',
      'backend.server.name': 'Imikufans后端',
      'backend.server.hint':
        '在自有物理机上运行的 Node 服务，数据最完整（含网络延迟测量），探测全部在自有机器上完成。按合规要求（对外提供 Web 服务需完成 ICP 备案），该方式目前仅在本机可用，线上版本暂不开放；预计 2027 年 1 月左右完成备案后于 ipv6.swordsman.top:8787 对外开放。感谢 shen 的大力支持！',
      'backend.server.disabled': '备案中，线上暂不可用',
      'backend.client.name': '客户端访问（简单 ping）',
      'backend.client.hint':
        '在浏览器里做一次简单试探：解析域名后向目标端口发起 WebSocket 连接，看端口有没有响应。浏览器无法执行标准 mcping（不能建立原始 TCP 连接），因此只能判断「端口是否有人应答」，拿不到版本、人数、MOTD。',
      'backend.client.warn': '结果可能不准确',
      'backend.client.disabled': '请用 http:// 打开本页',
      'backend.notice.disabled': '「{name}」当前不可用（{reason}），已自动改用「{fallback}」。',
      'backend.notice.fallbackServer': '本地后端未运行或无法访问，已自动切换为远端 API{provider}。',
      'backend.notice.fallbackRemote': '远端 API 不可用，已自动改用本地后端。',
      'backend.notice.clientMode': '当前使用「客户端简单 ping」：只检测域名解析与端口是否有响应，结果可能不准确，仅供参考。',
      'backend.notice.clientFallback': '客户端简单 ping 暂不可用（{reason}），已自动切换到远端 API。',
      'backend.notice.providerFallback': '{provider} 不可用，已改用其它接口',
      'backend.notice.allDown': '所有数据来源都不可用，请检查网络，或在页面底部切换「后端选择」。',

      'source.server': '数据由{name}实时探测（含延迟测量）',
      'source.remote': '数据由远端 API 代理探测（IPv4 / IPv6 均由网络节点查询，节点：{name}）',
      'source.client': '数据来自浏览器「简单 ping」（仅探测端口是否有响应，<strong>结果可能不准确</strong>，仅供参考）',

      'notice.hostNoIpv6': '当前探测端（本机）没有 IPv6 网络，IPv6 线路无法验证，已标记为「未验证」而非离线。',
      'notice.fetchFailed': '无法获取服务器状态（{msg}），将在 30 秒后重试。',

      'ui.langTitle': '切换语言',
      'ui.themeToDark': '切换到深色模式',
      'ui.themeToLight': '切换到浅色模式',
      'ui.logoTitle': '点击前往剑客群组服官网',
    },

    /* ---------------- 繁體中文 ---------------- */
    'zh-TW': {
      'site.title': 'SGU 劍客群組服 狀態監測',
      'site.description': 'SGU 劍客群組服 各服務狀態監測',
      'site.footer': 'Copyright © 劍客群組服 2024～2026',
      'site.loading': '正在取得伺服器狀態…',
      'site.skeletonGroup': '正在取得狀態…',
      'site.skeletonBadge': '載入中',
      'site.skeletonItem': '載入中…',
      'site.noscript': '本頁面需要啟用 JavaScript 才能顯示即時狀態。',

      'status.up': '運作正常',
      'status.partial': '部分異常',
      'status.down': '全部離線',
      'status.unknown': '未驗證',
      'overall.up': '所有服務運作正常',
      'overall.partial': '部分服務出現異常',
      'overall.down': '所有服務均無法使用',
      'overall.unknown': '狀態暫時無法確定',
      'overall.fetchFailed': '狀態取得失敗',
      'summary.endpoints': '入口 {online}/{total} 在線',
      'summary.unknown': ' · {n} 條線路未驗證',
      'summary.servers': '伺服器 {up}/{total} 正常',
      'summary.players': '在線玩家 {n}',

      'endpoint.online': '在線',
      'endpoint.offline': '離線',
      'endpoint.unknown': '未驗證',
      'endpoint.latency': '延遲',
      'endpoint.version': '版本',
      'endpoint.players': '玩家',
      'endpoint.response': '連接埠回應',
      'endpoint.accuracyTag': '結果可能不準確',
      'endpoint.msg.timeout': '連線逾時，連接埠無回應',
      'endpoint.msg.dns': '網域名稱解析失敗',
      'endpoint.msg.refused': '伺服器拒絕連線（連接埠未開放）',
      'endpoint.msg.unreachable': '主機無法到達',
      'endpoint.msg.noipv6': '探測端（本機）目前沒有 IPv6 網路，無法驗證該線路',
      'endpoint.msg.nolocalipv6': '探測端目前沒有 IPv6 網路，無法驗證該線路',
      'endpoint.msg.probeFailed': '探測介面無法使用，暫時無法驗證',
      'endpoint.msg.offline': '伺服器未回應狀態請求',
      'endpoint.msg.unknown': '暫時無法驗證該線路狀態',

      'heartbeat.before': '{time}前',
      'heartbeat.now': '現在',
      'heartbeat.empty': '暫無資料',
      'heartbeat.tip': '{time} {state}{latency}',
      'heartbeat.aria': '最近 {n} 次檢查記錄',

      'footer.updated': '最後更新於 {time}',
      'footer.countdown': '將於 {mm}:{ss} 後重新整理',
      'footer.refreshing': '正在重新整理…',

      'qq.badge': 'QQ群',
      'qq.hint': '點擊卡片任意位置即可加入該伺服器的玩家交流群',
      'qq.defaultTitle': '點我加入玩家交流群',

      'backend.title': '後端選擇',
      'backend.subtitle': '選擇狀態資料的取得方式，設定會儲存在本機瀏覽器中。目前生效：',
      'backend.detecting': '正在偵測…',
      'backend.default': '預設',
      'backend.inUse': '使用中',
      'backend.subtoggle': '選擇探測介面',
      'backend.remote.name': '遠端 API',
      'backend.remote.hint':
        '由第三方公共介面代為探測，瀏覽器直接存取，不需要任何自有伺服器。IPv4 / IPv6 都能檢測，但拿不到網路延遲，且依賴第三方服務的可用性。展開後可選擇具體介面。',
      'backend.server.name': 'Imikufans 後端',
      'backend.server.hint':
        '在自有實體機上運作的 Node 服務，資料最完整（含網路延遲測量），探測全部在自有機器上完成。依合規要求（對外提供 Web 服務需完成 ICP 備案），該方式目前僅在本機可用，線上版本暫不開放；預計 2027 年 1 月左右完成備案後於 ipv6.swordsman.top:8787 對外開放。感謝 shen 的大力支持！',
      'backend.server.disabled': '備案中，線上暫不可用',
      'backend.client.name': '客戶端存取（簡單 ping）',
      'backend.client.hint':
        '在瀏覽器裡做一次簡單試探：解析網域後向目標連接埠發起 WebSocket 連線，看連接埠有沒有回應。瀏覽器無法執行標準 mcping（不能建立原始 TCP 連線），因此只能判斷「連接埠是否有人應答」，拿不到版本、人數、MOTD。',
      'backend.client.warn': '結果可能不準確',
      'backend.client.disabled': '請用 http:// 開啟本頁',
      'backend.notice.disabled': '「{name}」目前不可用（{reason}），已自動改用「{fallback}」。',
      'backend.notice.fallbackServer': '本機後端未運作或無法存取，已自動切換為遠端 API{provider}。',
      'backend.notice.fallbackRemote': '遠端 API 無法使用，已自動改用本機後端。',
      'backend.notice.clientMode': '目前使用「客戶端簡單 ping」：只檢測網域解析與連接埠是否有回應，結果可能不準確，僅供參考。',
      'backend.notice.clientFallback': '客戶端簡單 ping 暫時無法使用（{reason}），已自動切換到遠端 API。',
      'backend.notice.providerFallback': '{provider} 無法使用，已改用其它介面',
      'backend.notice.allDown': '所有資料來源都無法使用，請檢查網路，或在頁面底部切換「後端選擇」。',

      'source.server': '資料由{name}即時探測（含延遲測量）',
      'source.remote': '資料由遠端 API 代理探測（IPv4 / IPv6 均由網路節點查詢，節點：{name}）',
      'source.client': '資料來自瀏覽器「簡單 ping」（僅探測連接埠是否有回應，<strong>結果可能不準確</strong>，僅供參考）',

      'notice.hostNoIpv6': '目前探測端（本機）沒有 IPv6 網路，IPv6 線路無法驗證，已標記為「未驗證」而非離線。',
      'notice.fetchFailed': '無法取得伺服器狀態（{msg}），將於 30 秒後重試。',

      'ui.langTitle': '切換語言',
      'ui.themeToDark': '切換到深色模式',
      'ui.themeToLight': '切換到淺色模式',
      'ui.logoTitle': '點擊前往劍客群組服官網',
    },

    /* ---------------- English ---------------- */
    en: {
      'site.title': 'SGU Swordsman Group — Status Monitor',
      'site.description': 'Service status monitor for the SGU Swordsman Group',
      'site.footer': 'Copyright © Swordsman Group 2024–2026',
      'site.loading': 'Fetching server status…',
      'site.skeletonGroup': 'Fetching status…',
      'site.skeletonBadge': 'Loading',
      'site.skeletonItem': 'Loading…',
      'site.noscript': 'JavaScript is required to display live status.',

      'status.up': 'Operational',
      'status.partial': 'Degraded',
      'status.down': 'Offline',
      'status.unknown': 'Unverified',
      'overall.up': 'All services are operational',
      'overall.partial': 'Some services are experiencing issues',
      'overall.down': 'All services are unavailable',
      'overall.unknown': 'Status cannot be determined right now',
      'overall.fetchFailed': 'Failed to fetch status',
      'summary.endpoints': '{online}/{total} endpoints online',
      'summary.unknown': ' · {n} unverified',
      'summary.servers': '{up}/{total} servers healthy',
      'summary.players': '{n} players online',

      'endpoint.online': 'Online',
      'endpoint.offline': 'Offline',
      'endpoint.unknown': 'Unverified',
      'endpoint.latency': 'Latency',
      'endpoint.version': 'Version',
      'endpoint.players': 'Players',
      'endpoint.response': 'Port response',
      'endpoint.accuracyTag': 'May be inaccurate',
      'endpoint.msg.timeout': 'Connection timed out, no response on port',
      'endpoint.msg.dns': 'DNS resolution failed',
      'endpoint.msg.refused': 'Connection refused (port closed)',
      'endpoint.msg.unreachable': 'Host unreachable',
      'endpoint.msg.noipv6': 'The probe host has no IPv6 connectivity, cannot verify this line',
      'endpoint.msg.nolocalipv6': 'No IPv6 connectivity on the probe side, cannot verify this line',
      'endpoint.msg.probeFailed': 'Probe service unavailable, cannot verify right now',
      'endpoint.msg.offline': 'Server did not answer the status request',
      'endpoint.msg.unknown': 'This line cannot be verified right now',

      'heartbeat.before': '{time} ago',
      'heartbeat.now': 'now',
      'heartbeat.empty': 'No data',
      'heartbeat.tip': '{time} {state}{latency}',
      'heartbeat.aria': 'Last {n} checks',

      'footer.updated': 'Last updated {time}',
      'footer.countdown': 'Refreshing in {mm}:{ss}',
      'footer.refreshing': 'Refreshing…',

      'qq.badge': 'QQ Group',
      'qq.hint': 'Click anywhere on this card to join this server’s player community',
      'qq.defaultTitle': 'Click to join the player community',

      'backend.title': 'Data source',
      'backend.subtitle': 'Choose how status data is fetched. The setting is stored in this browser. Currently active: ',
      'backend.detecting': 'Detecting…',
      'backend.default': 'Default',
      'backend.inUse': 'In use',
      'backend.subtoggle': 'Choose probe API',
      'backend.remote.name': 'Remote API',
      'backend.remote.hint':
        'Probing is delegated to public third-party APIs called directly from your browser — no server of ours required. Both IPv4 and IPv6 are checked, but no network latency is available and availability depends on those third parties. Expand to pick a specific API.',
      'backend.server.name': 'Imikufans backend',
      'backend.server.hint':
        'A Node service running on our own physical machine — the most complete data, including latency, with all probing done on our own hardware. For compliance reasons (ICP filing is required to serve web content publicly) it is available only on this local machine for now and is not exposed publicly; it is expected to open around January 2027 at ipv6.swordsman.top:8787. Special thanks to shen for the generous support!',
      'backend.server.disabled': 'ICP filing in progress',
      'backend.client.name': 'Client-side (simple ping)',
      'backend.client.hint':
        'A lightweight probe from your browser: resolve the domain, then open a WebSocket to the target port to see whether anything answers. Browsers cannot speak the Minecraft protocol over raw TCP, so this only tells you whether the port responds — no version, player count or MOTD.',
      'backend.client.warn': 'May be inaccurate',
      'backend.client.disabled': 'Open this page over http://',
      'backend.notice.disabled': '“{name}” is currently unavailable ({reason}); switched to “{fallback}”.',
      'backend.notice.fallbackServer': 'The local backend is not running or unreachable; switched to the remote API{provider}.',
      'backend.notice.fallbackRemote': 'The remote API is unavailable; switched to the local backend.',
      'backend.notice.clientMode':
        'Using client-side simple ping: only DNS resolution and port responsiveness are checked. Results may be inaccurate — for reference only.',
      'backend.notice.clientFallback': 'Client-side simple ping is unavailable ({reason}); switched to the remote API.',
      'backend.notice.providerFallback': '{provider} is unavailable; switched to another API',
      'backend.notice.allDown': 'No data source is available. Check your network or pick another option under “Data source” at the bottom.',

      'source.server': 'Data probed live by {name} (including latency)',
      'source.remote': 'Data probed via a remote API (IPv4 / IPv6 resolved by a network node: {name})',
      'source.client': 'Data from the browser’s simple ping (port responsiveness only — <strong>may be inaccurate</strong>)',

      'notice.hostNoIpv6':
        'The probe host currently has no IPv6 connectivity, so IPv6 lines cannot be verified and are marked “Unverified” instead of offline.',
      'notice.fetchFailed': 'Could not fetch server status ({msg}). Retrying in 30 seconds.',

      'ui.langTitle': 'Switch language',
      'ui.themeToDark': 'Switch to dark mode',
      'ui.themeToLight': 'Switch to light mode',
      'ui.logoTitle': 'Open the Swordsman Group official website',
    },

    /* ---------------- 文言（华夏） ---------------- */
    lzh: {
      'site.title': 'SGU 劍客伺服器・機況察候',
      'site.description': 'SGU 劍客群組服諸務狀態之監',
      'site.footer': 'Copyright © 劍客群組服 2024～2026',
      'site.loading': '方探諸服之況…',
      'site.skeletonGroup': '方探其況…',
      'site.skeletonBadge': '載入中',
      'site.skeletonItem': '候之…',
      'site.noscript': '須啟 JavaScript 方可見實時之況。',

      'status.up': '安',
      'status.partial': '有闕',
      'status.down': '盡絕',
      'status.unknown': '未驗',
      'overall.up': '諸務咸寧',
      'overall.partial': '諸務有闕',
      'overall.down': '諸務盡絕',
      'overall.unknown': '其況未可考',
      'overall.fetchFailed': '探況未果',
      'summary.endpoints': '門戶 {online}/{total} 通',
      'summary.unknown': ' · {n} 道未驗',
      'summary.servers': '伺服 {up}/{total} 安',
      'summary.players': '遊者 {n} 人',

      'endpoint.online': '通',
      'endpoint.offline': '絕',
      'endpoint.unknown': '未驗',
      'endpoint.latency': '往還',
      'endpoint.version': '版次',
      'endpoint.players': '遊者',
      'endpoint.response': '埠應',
      'endpoint.accuracyTag': '其數恐未精',
      'endpoint.msg.timeout': '候之過時，埠無所應',
      'endpoint.msg.dns': '域名解析不成',
      'endpoint.msg.refused': '伺服拒接，埠未闢',
      'endpoint.msg.unreachable': '主機不可達',
      'endpoint.msg.noipv6': '探者（本機）今無 IPv6 之網，此道未可驗',
      'endpoint.msg.nolocalipv6': '探者今無 IPv6 之網，此道未可驗',
      'endpoint.msg.probeFailed': '探器不克用，暫未可驗',
      'endpoint.msg.offline': '伺服未應探問',
      'endpoint.msg.unknown': '此道暫未可驗',

      'heartbeat.before': '{time}之前',
      'heartbeat.now': '今',
      'heartbeat.empty': '尚無所記',
      'heartbeat.tip': '{time} {state}{latency}',
      'heartbeat.aria': '近 {n} 次之察',

      'footer.updated': '末次更於 {time}',
      'footer.countdown': '候 {mm}:{ss} 而復新',
      'footer.refreshing': '方復新…',

      'qq.badge': 'QQ 群',
      'qq.hint': '點此牌之任何處，即可入此服之遊者群',
      'qq.defaultTitle': '點而入遊者之群',

      'backend.title': '擇後端',
      'backend.subtitle': '擇取況之法，所擇存於本機之器。今所用者：',
      'backend.detecting': '方察…',
      'backend.default': '本預設',
      'backend.inUse': '今用',
      'backend.subtoggle': '擇探器',
      'backend.remote.name': '遠端 API',
      'backend.remote.hint':
        '假第三方之公器以代探，瀏覽器直往，不須自有之伺服。IPv4 與 IPv6 皆可察，然不得往還之數，且繫於第三方之存亡。展之可擇其器。',
      'backend.server.name': 'Imikufans 後端',
      'backend.server.hint':
        '行於自有實機之 Node 務，其數最備（含往還之測），探事皆在本機。然循合規之制（對外供 Web 之務須成 ICP 備案），此法今惟本機可用，線上未之開也；計 2027 年正月前後備案既成，乃於 ipv6.swordsman.top:8787 對外而開。感 shen 之鼎力相助！',
      'backend.server.disabled': '備案中，線上未可用',
      'backend.client.name': '客戶端訪問（略探）',
      'backend.client.hint':
        '於瀏覽器中略試：先解域名，乃以 WebSocket 叩其埠，觀其有應否。瀏覽器不能行標準 mcping（不得闢原始 TCP 之連），故惟知「埠有應否」，不得版次、人數、MOTD。',
      'backend.client.warn': '其數恐未精',
      'backend.client.disabled': '請以 http:// 開此頁',
      'backend.notice.disabled': '「{name}」今不可用（{reason}），已改「{fallback}」。',
      'backend.notice.fallbackServer': '本機後端未行或不可達，已易為遠端 API{provider}。',
      'backend.notice.fallbackRemote': '遠端 API 不可用，已改本機後端。',
      'backend.notice.clientMode': '今用「客戶端略探」：惟察域名之解與埠之有應，其數恐未精，聊備參考。',
      'backend.notice.clientFallback': '客戶端略探暫不可用（{reason}），已易為遠端 API。',
      'backend.notice.providerFallback': '{provider} 不可用，已易他器',
      'backend.notice.allDown': '諸源皆不可用，請察其網，或於頁末更「擇後端」。',

      'source.server': '其數由{name}實時探之（含往還之測）',
      'source.remote': '其數由遠端 API 代探（IPv4 / IPv6 皆假節點而詢，節點：{name}）',
      'source.client': '其數出於瀏覽器之略探（惟察埠之有應，<strong>恐未精</strong>，聊備參考）',

      'notice.hostNoIpv6': '今探者（本機）無 IPv6 之網，IPv6 之道未可驗，已記為「未驗」而非絕。',
      'notice.fetchFailed': '未能得伺服之況（{msg}），三十息後復試。',

      'ui.langTitle': '易語言',
      'ui.themeToDark': '易為深色',
      'ui.themeToLight': '易為淺色',
      'ui.logoTitle': '點而往劍客群組服之官網',
    },

    /* ---------------- 日本語 ---------------- */
    ja: {
      'site.title': 'SGU 剣客グループ服 ステータス監視',
      'site.description': 'SGU 剣客グループ服 各種サービスの稼働状況',
      'site.footer': 'Copyright © 剣客グループ服 2024～2026',
      'site.loading': 'サーバー状態を取得しています…',
      'site.skeletonGroup': '状態を取得中…',
      'site.skeletonBadge': '読込中',
      'site.skeletonItem': '読込中…',
      'site.noscript': 'リアルタイムの状態を表示するには JavaScript が必要です。',

      'status.up': '正常',
      'status.partial': '一部異常',
      'status.down': '全停止',
      'status.unknown': '未確認',
      'overall.up': 'すべてのサービスが正常です',
      'overall.partial': '一部のサービスに異常があります',
      'overall.down': 'すべてのサービスが停止しています',
      'overall.unknown': '現在、状態を判定できません',
      'overall.fetchFailed': '状態の取得に失敗しました',
      'summary.endpoints': '接続 {online}/{total} 正常',
      'summary.unknown': ' · {n} 件未確認',
      'summary.servers': 'サーバー {up}/{total} 正常',
      'summary.players': 'プレイヤー {n} 人',

      'endpoint.online': 'オンライン',
      'endpoint.offline': 'オフライン',
      'endpoint.unknown': '未確認',
      'endpoint.latency': '遅延',
      'endpoint.version': 'バージョン',
      'endpoint.players': '人数',
      'endpoint.response': 'ポート応答',
      'endpoint.accuracyTag': '結果が不正確な場合あり',
      'endpoint.msg.timeout': '接続がタイムアウトしました（ポート無応答）',
      'endpoint.msg.dns': 'ドメイン名の解決に失敗しました',
      'endpoint.msg.refused': '接続が拒否されました（ポート未開放）',
      'endpoint.msg.unreachable': 'ホストに到達できません',
      'endpoint.msg.noipv6': '計測側（本機）に IPv6 回線がないため、この接続は検証できません',
      'endpoint.msg.nolocalipv6': '計測側に IPv6 回線がないため、この接続は検証できません',
      'endpoint.msg.probeFailed': '計測 API が利用できないため、現在検証できません',
      'endpoint.msg.offline': 'サーバーが状態要求に応答しませんでした',
      'endpoint.msg.unknown': 'この接続の状態は現在検証できません',

      'heartbeat.before': '{time}前',
      'heartbeat.now': '現在',
      'heartbeat.empty': 'データなし',
      'heartbeat.tip': '{time} {state}{latency}',
      'heartbeat.aria': '直近 {n} 回のチェック',

      'footer.updated': '最終更新 {time}',
      'footer.countdown': '{mm}:{ss} 後に更新',
      'footer.refreshing': '更新中…',

      'qq.badge': 'QQグループ',
      'qq.hint': 'カードのどこかをクリックすると、このサーバーのプレイヤーグループに参加できます',
      'qq.defaultTitle': 'クリックしてプレイヤーグループに参加',

      'backend.title': 'バックエンド選択',
      'backend.subtitle': '状態データの取得方法を選択します。設定はこのブラウザに保存されます。現在有効：',
      'backend.detecting': '確認中…',
      'backend.default': '既定',
      'backend.inUse': '使用中',
      'backend.subtoggle': '計測 API を選択',
      'backend.remote.name': 'リモート API',
      'backend.remote.hint':
        '第三者の公開 API が代理で計測し、ブラウザから直接アクセスします。自前のサーバーは不要です。IPv4 / IPv6 の両方を確認できますが、遅延は取得できず、第三者サービスの可用性に依存します。展開すると個別の API を選べます。',
      'backend.server.name': 'Imikufans バックエンド',
      'backend.server.hint':
        '自前の物理マシンで動作する Node サービスで、データが最も完全（遅延測定を含む）です。コンプライアンス上の理由（Web サービス公開には ICP 備案が必要）により、現在は本機でのみ利用可能で、オンライン版では公開していません。2027 年 1 月頃に備案完了後、ipv6.swordsman.top:8787 で公開予定です。shen さんの多大なるご支援に感謝します！',
      'backend.server.disabled': '備案中・オンライン未公開',
      'backend.client.name': 'クライアント側（簡易 ping）',
      'backend.client.hint':
        'ブラウザ内で簡易的に試行します：ドメインを解決後、対象ポートへ WebSocket 接続を試みて応答の有無を調べます。ブラウザは生の TCP 接続を確立できないため、ポートが応答するかどうかだけが分かり、バージョン・人数・MOTD は取得できません。',
      'backend.client.warn': '結果が不正確な場合あり',
      'backend.client.disabled': 'http:// でこのページを開いてください',
      'backend.notice.disabled': '「{name}」は現在利用できません（{reason}）。「{fallback}」に切り替えました。',
      'backend.notice.fallbackServer': 'ローカル backend が未起動または到達不能のため、リモート API{provider} に切り替えました。',
      'backend.notice.fallbackRemote': 'リモート API が利用できないため、ローカル backend に切り替えました。',
      'backend.notice.clientMode': '現在は「クライアント側簡易 ping」を使用中です。ドメイン解決とポート応答のみを確認するため、結果は不正確な場合があります。',
      'backend.notice.clientFallback': 'クライアント側簡易 ping は利用できません（{reason}）。リモート API に切り替えました。',
      'backend.notice.providerFallback': '{provider} が利用できないため、別の API に切り替えました',
      'backend.notice.allDown': 'どのデータソースも利用できません。ネットワークを確認するか、ページ下部の「バックエンド選択」で切り替えてください。',

      'source.server': 'データは{name}がリアルタイムに計測（遅延測定を含む）',
      'source.remote': 'データはリモート API 経由で計測（IPv4 / IPv6 とも外部ノードが照会：{name}）',
      'source.client': 'データはブラウザの簡易 ping によるもの（ポート応答のみ・<strong>不正確な場合あり</strong>）',

      'notice.hostNoIpv6': '計測側（本機）に IPv6 回線がないため、IPv6 の接続は検証できず「未確認」と表示しています。',
      'notice.fetchFailed': 'サーバー状態を取得できませんでした（{msg}）。30 秒後に再試行します。',

      'ui.langTitle': '言語を切り替え',
      'ui.themeToDark': 'ダークモードに切り替え',
      'ui.themeToLight': 'ライトモードに切り替え',
      'ui.logoTitle': '剣客グループ服 公式サイトを開く',
    },
  };

  const STORE_KEY = 'sgu-lang';
  const DEFAULT_LANG = 'zh-CN';

  let current = DEFAULT_LANG;

  function normalize(code) {
    if (!code) return null;
    const c = String(code).toLowerCase();
    if (DICT[code]) return code;
    if (c.startsWith('zh')) {
      if (c.includes('tw') || c.includes('hk') || c.includes('hant')) return 'zh-TW';
      return 'zh-CN';
    }
    if (c.startsWith('ja')) return 'ja';
    if (c.startsWith('en')) return 'en';
    if (c.startsWith('lzh') || c.includes('wenyan')) return 'lzh';
    return null;
  }

  function detect() {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      const n = normalize(saved);
      if (n) return n;
    } catch (err) {
      /* 隐私模式忽略 */
    }
    const nav = (typeof navigator !== 'undefined' && (navigator.language || (navigator.languages || [])[0])) || '';
    return normalize(nav) || DEFAULT_LANG;
  }

  function t(key, vars) {
    const table = DICT[current] || {};
    let text = table[key];
    if (text === undefined) text = (DICT[DEFAULT_LANG] || {})[key];
    if (text === undefined) return key;
    if (vars) {
      text = text.replace(/\{(\w+)\}/g, (m, name) => (vars[name] === undefined ? m : String(vars[name])));
    }
    return text;
  }

  /** 切换语言：写入存储、更新 <html lang>、触发回调 */
  function setLang(code) {
    const n = normalize(code) || DEFAULT_LANG;
    current = n;
    try {
      localStorage.setItem(STORE_KEY, n);
    } catch (err) {
      /* 忽略 */
    }
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('lang', n === 'zh-CN' ? 'zh-CN' : n === 'zh-TW' ? 'zh-Hant' : n);
      document.documentElement.setAttribute('data-lang', n);
    }
    for (const fn of listeners) {
      try {
        fn(n);
      } catch (err) {
        /* 忽略单个回调错误 */
      }
    }
    return n;
  }

  const listeners = [];

  function onApply(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  current = detect();

  const api = {
    LANGS,
    DICT,
    DEFAULT_LANG,
    t,
    setLang,
    onApply,
    getLang: () => current,
    normalize,
  };

  if (typeof window !== 'undefined') window.SGUI18n = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
