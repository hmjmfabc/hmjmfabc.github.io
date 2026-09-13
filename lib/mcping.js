'use strict';
/**
 * 轻量级 Minecraft Java 版 Server List Ping (SLP) 实现。
 * 仅依赖 Node.js 内置模块，无需任何第三方包。
 *
 * 流程：
 *   1. TCP 连接（可强制 IPv4 / IPv6）
 *   2. 发送 Handshake (packet id 0x00, next state = 1)
 *   3. 发送 Status Request (packet id 0x00)
 *   4. 读取 Status Response 中的 JSON
 *   5. 发送 Ping (0x01) 计算真实往返延迟
 */

const net = require('net');
const { parseMotd } = require('../public/motd.js');

const DEFAULT_TIMEOUT = 7000;

/* ------------------------------------------------------------------ *
 * VarInt 编解码
 * ------------------------------------------------------------------ */

function writeVarInt(value) {
  const bytes = [];
  let v = value >>> 0; // 当作无符号处理，兼容 -1 协议版本
  do {
    let temp = v & 0x7f;
    v >>>= 7;
    if (v !== 0) temp |= 0x80;
    bytes.push(temp);
  } while (v !== 0);
  return Buffer.from(bytes);
}

function readVarInt(buf, offset) {
  let result = 0;
  let shift = 0;
  let pos = offset;
  for (;;) {
    if (pos >= buf.length) return null; // 数据不足
    const byte = buf[pos++];
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) !== 0x80) break;
    shift += 7;
    if (shift > 35) throw new Error('VarInt 过长');
  }
  return { value: result | 0, size: pos - offset };
}

function writeString(str) {
  const data = Buffer.from(str, 'utf8');
  return Buffer.concat([writeVarInt(data.length), data]);
}

function packet(id, payload) {
  const body = Buffer.concat([writeVarInt(id), payload || Buffer.alloc(0)]);
  return Buffer.concat([writeVarInt(body.length), body]);
}

/* ------------------------------------------------------------------ *
 * MOTD 解析：与前端共用 public/motd.js 中的同一套实现
 * ------------------------------------------------------------------ */

/** 仅取纯文本（保留旧接口） */
function cleanMotd(description) {
  const parsed = parseMotd(description);
  return { text: parsed.text, lines: parsed.lines };
}

/* ------------------------------------------------------------------ *
 * 连接层
 * ------------------------------------------------------------------ */

/**
 * @param {object} opts
 * @param {string} opts.host        用于 TCP 连接的主机（域名或字面量 IP）
 * @param {number} opts.port        TCP 端口
 * @param {string} [opts.handshakeHost] 写入 Handshake 包的主机名（默认同 host）
 * @param {number} [opts.family]    4 / 6 / 0（0 = 自动）
 * @param {number} [opts.timeout]   超时毫秒
 * @returns {Promise<object>} 状态结果
 */
function ping(opts) {
  const {
    host,
    port,
    handshakeHost = host,
    family = 0,
    protocolVersion = 760, // 1.19.1+，绝大多数服务端均兼容
    timeout = DEFAULT_TIMEOUT,
  } = opts;

  return new Promise((resolve) => {
    let settled = false;
    let socket = null;
    let buffer = Buffer.alloc(0);
    let handshakeSentAt = 0;
    let latency = null;
    let result = null;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (socket) {
        socket.removeAllListeners();
        socket.destroy();
      }
      resolve(payload);
    };

    const timer = setTimeout(() => {
      finish({ online: false, error: 'TIMEOUT', message: `连接超时（${timeout} ms）` });
    }, timeout);

    try {
      socket = net.connect({ host, port, family, noDelay: true });
    } catch (err) {
      finish({ online: false, error: 'CONNECT_FAILED', message: err.message });
      return;
    }

    socket.on('connect', () => {
      handshakeSentAt = Date.now();
      const portBuf = Buffer.alloc(2);
      portBuf.writeUInt16BE(port, 0);
      const handshake = packet(
        0x00,
        Buffer.concat([
          writeVarInt(protocolVersion),
          writeString(handshakeHost),
          portBuf,
          writeVarInt(1),
        ])
      );
      const statusRequest = packet(0x00, Buffer.alloc(0));
      socket.write(Buffer.concat([handshake, statusRequest]));
    });

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      // 第一个包：Status Response
      if (result === null) {
        const lenInfo = readVarInt(buffer, 0);
        if (!lenInfo) return;
        if (buffer.length < lenInfo.size + lenInfo.value) return; // 等更多数据
        const bodyStart = lenInfo.size;
        const idInfo = readVarInt(buffer, bodyStart);
        if (!idInfo) return;
        if (idInfo.value !== 0x00) {
          finish({ online: false, error: 'PROTOCOL_ERROR', message: `意外的包 ID: ${idInfo.value}` });
          return;
        }
        const strStart = bodyStart + idInfo.size;
        const strLenInfo = readVarInt(buffer, strStart);
        if (!strLenInfo) return;
        const jsonStart = strStart + strLenInfo.size;
        const jsonEnd = jsonStart + strLenInfo.value;
        if (buffer.length < jsonEnd) return;

        try {
          result = JSON.parse(buffer.slice(jsonStart, jsonEnd).toString('utf8'));
        } catch (err) {
          finish({ online: false, error: 'BAD_JSON', message: '状态响应不是合法 JSON' });
          return;
        }
        buffer = buffer.slice(jsonEnd);

        // 发送 Ping 以测量延迟
        const payload = Buffer.alloc(8);
        payload.writeBigInt64BE(BigInt(Date.now()));
        socket.write(packet(0x01, payload));
        if (buffer.length === 0) return; // 等待 Pong
      }

      // 第二个包：Pong
      const lenInfo = readVarInt(buffer, 0);
      if (!lenInfo) return;
      if (buffer.length < lenInfo.size + lenInfo.value) return;
      latency = Date.now() - handshakeSentAt;
      finish(buildResult(result, latency));
    });

    socket.on('error', (err) => {
      const codes = {
        ECONNREFUSED: '服务器拒绝连接（端口未开放）',
        ENOTFOUND: '域名解析失败',
        EHOSTUNREACH: '主机不可达',
        ENETUNREACH: '网络不可达（本机可能没有 IPv6 出口）',
        ECONNRESET: '连接被重置',
        EPIPE: '连接中断',
        ETIMEDOUT: '连接超时',
      };
      finish({
        online: false,
        error: err.code || 'SOCKET_ERROR',
        message: codes[err.code] || err.message,
      });
    });

    socket.on('close', () => {
      if (!settled) {
        if (result !== null) {
          // 服务端没回 Pong，但状态已拿到
          finish(buildResult(result, Date.now() - handshakeSentAt));
        } else {
          finish({ online: false, error: 'CLOSED', message: '连接在收到响应前被关闭' });
        }
      }
    });
  });
}

/** 把原始状态响应整理为统一结构 */
function buildResult(result, latency) {
  const motd = parseMotd(result.description);
  const players = result.players || {};
  return {
    online: true,
    latency,
    version: (result.version && result.version.name) || null,
    protocol: (result.version && result.version.protocol) ?? null,
    motd: motd.text,
    motdLines: motd.lines,
    motdSegments: motd.segments,
    players: {
      online: Number.isFinite(players.online) ? players.online : null,
      max: Number.isFinite(players.max) ? players.max : null,
      sample: Array.isArray(players.sample)
        ? players.sample.slice(0, 12).map((p) => (p && p.name) || '').filter(Boolean)
        : [],
    },
    favicon: typeof result.favicon === 'string' ? result.favicon : null,
  };
}

module.exports = { ping, writeVarInt, readVarInt, writeString, packet, cleanMotd, parseMotd };
