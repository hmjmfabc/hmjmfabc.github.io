/* ============================================================
 * MOTD 解析（前后端共用）
 *   - 浏览器：<script src="/motd.js"></script> → window.SGUMotd
 *   - Node  ：const { parseMotd } = require('./motd.js')
 *
 * 支持：
 *   1. 聊天组件对象（color / bold / italic / underlined / strikethrough / extra）
 *   2. § 传统颜色与格式代码（0-9 a-f l m n o k r）
 *   3. §x§R§R§G§G§B§B 十六进制颜色（BungeeCord 扩展）
 * ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SGUMotd = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** 传统 § 颜色代码 → 十六进制 */
  const LEGACY_COLORS = {
    0: '#000000', 1: '#0000AA', 2: '#00AA00', 3: '#00AAAA',
    4: '#AA0000', 5: '#AA00AA', 6: '#FFAA00', 7: '#AAAAAA',
    8: '#555555', 9: '#5555FF', a: '#55FF55', b: '#55FFFF',
    c: '#FF5555', d: '#FF55FF', e: '#FFFF55', f: '#FFFFFF',
  };

  /** JSON 组件中的具名颜色 → 十六进制 */
  const NAMED_COLORS = {
    black: '#000000', dark_blue: '#0000AA', dark_green: '#00AA00', dark_aqua: '#00AAAA',
    dark_red: '#AA0000', dark_purple: '#AA00AA', gold: '#FFAA00', gray: '#AAAAAA',
    grey: '#AAAAAA', dark_gray: '#555555', dark_grey: '#555555', blue: '#5555FF',
    green: '#55FF55', aqua: '#55FFFF', red: '#FF5555', light_purple: '#FF55FF',
    yellow: '#FFFF55', white: '#FFFFFF',
  };

  const FORMAT_KEYS = ['bold', 'italic', 'underlined', 'strikethrough', 'obfuscated'];
  const SECTION = '\u00a7';

  function normalizeColor(color) {
    if (typeof color !== 'string' || !color) return null;
    const named = NAMED_COLORS[color.toLowerCase()];
    if (named) return named;
    if (/^#[0-9a-fA-F]{6}$/.test(color)) return color.toUpperCase();
    if (/^[0-9a-fA-F]{6}$/.test(color)) return `#${color.toUpperCase()}`;
    return null;
  }

  function emptyStyle() {
    return { color: null, bold: false, italic: false, underlined: false, strikethrough: false, obfuscated: false };
  }

  function pushSegment(out, text, style) {
    if (!text) return;
    const segment = { t: text };
    if (style.color) segment.c = style.color;
    if (style.bold) segment.b = 1;
    if (style.italic) segment.i = 1;
    if (style.underlined) segment.u = 1;
    if (style.strikethrough) segment.s = 1;
    if (style.obfuscated) segment.k = 1;
    out.push(segment);
  }

  /** 解析字符串中的 § 传统颜色 / 格式代码 */
  function parseLegacy(text, style, out) {
    const str = String(text == null ? '' : text);
    let buffer = '';
    let current = Object.assign({}, style);
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch !== SECTION || i + 1 >= str.length) {
        buffer += ch;
        continue;
      }
      const code = str[i + 1].toLowerCase();

      // §x§R§R§G§G§B§B
      if (code === 'x' && i + 13 < str.length) {
        const hex = str.slice(i + 2, i + 14).replace(/\u00a7/gi, '');
        if (/^[0-9a-fA-F]{6}$/.test(hex)) {
          pushSegment(out, buffer, current);
          buffer = '';
          current = Object.assign({}, current, { color: `#${hex.toUpperCase()}` });
          i += 13;
          continue;
        }
      }

      if (LEGACY_COLORS[code]) {
        pushSegment(out, buffer, current);
        buffer = '';
        current = Object.assign({}, current, { color: LEGACY_COLORS[code] });
        i += 1;
        continue;
      }

      if (code === 'l' || code === 'm' || code === 'n' || code === 'o' || code === 'k') {
        pushSegment(out, buffer, current);
        buffer = '';
        current = Object.assign({}, current, {
          bold: code === 'l' ? true : current.bold,
          strikethrough: code === 'm' ? true : current.strikethrough,
          underlined: code === 'n' ? true : current.underlined,
          italic: code === 'o' ? true : current.italic,
          obfuscated: code === 'k' ? true : current.obfuscated,
        });
        i += 1;
        continue;
      }

      if (code === 'r') {
        pushSegment(out, buffer, current);
        buffer = '';
        current = emptyStyle();
        i += 1;
        continue;
      }

      buffer += ch;
    }
    pushSegment(out, buffer, current);
    return out;
  }

  /** 递归解析聊天组件 */
  function walkComponent(component, inherited, out) {
    if (component == null) return out;
    if (typeof component === 'string') return parseLegacy(component, inherited, out);
    if (Array.isArray(component)) {
      for (const item of component) walkComponent(item, inherited, out);
      return out;
    }
    if (typeof component !== 'object') return parseLegacy(String(component), inherited, out);

    const style = Object.assign({}, inherited);
    const color = normalizeColor(component.color);
    if (color) style.color = color;
    for (const key of FORMAT_KEYS) {
      if (typeof component[key] === 'boolean') style[key] = component[key];
    }

    if (typeof component.text === 'string') {
      parseLegacy(component.text, style, out);
    } else if (typeof component.translate === 'string') {
      parseLegacy(component.translate, style, out);
      if (Array.isArray(component.with)) {
        for (const item of component.with) walkComponent(item, style, out);
      }
    }
    if (Array.isArray(component.extra)) {
      for (const item of component.extra) walkComponent(item, style, out);
    }
    return out;
  }

  /**
   * 解析 MOTD
   * @param {string|object|Array} description 聊天组件、§ 字符串或字符串数组
   * @returns {{text:string, lines:string[], segments:Array}}
   */
  function parseMotd(description) {
    let input = description;
    if (Array.isArray(input) && input.every((x) => typeof x === 'string')) {
      input = input.join('\n'); // 静态接口按行返回，用换行还原
    }
    const segments = walkComponent(input, emptyStyle(), []);
    const text = segments.map((s) => s.t).join('');
    const lines = text
      .replace(/\r/g, '')
      .split('\n')
      .map((l) => l.replace(/\s+$/, ''))
      .slice(0, 4);
    return { text: text.replace(/^\s+|\s+$/g, ''), lines, segments };
  }

  return { parseMotd, parseLegacy, normalizeColor, LEGACY_COLORS, NAMED_COLORS };
});
