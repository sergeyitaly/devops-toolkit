'use strict';

/* ------------------------------------------------------------------ *
 * Bytes, text and formatting. Everything below works on plain arrays
 * of byte values so the same code runs in a browser and under the
 * stub DOM the tests use - no TextEncoder, no Buffer, no btoa.
 * ------------------------------------------------------------------ */

var B64_STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
var B64_URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8Encode(str) {
  var out = [], i, c, c2, cp;
  for (i = 0; i < str.length; i++) {
    c = str.charCodeAt(i);
    if (c < 0x80) { out.push(c); continue; }
    if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 63)); continue; }
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      c2 = str.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) {
        cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
        i++;
        continue;
      }
    }
    if (c >= 0xd800 && c <= 0xdfff) { out.push(0xef, 0xbf, 0xbd); continue; } /* lone surrogate */
    out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

/* Lenient by design: a decoder that throws would turn "paste any base64" into
   an error message, and seeing the replacement character is more useful. */
function utf8Decode(bytes) {
  var out = '', i = 0, n = bytes.length, b, cp, need, j, ok;
  while (i < n) {
    b = bytes[i] & 0xff;
    if (b < 0x80) { out += String.fromCharCode(b); i++; continue; }
    if (b >= 0xc2 && b <= 0xdf) { cp = b & 0x1f; need = 1; }
    else if (b >= 0xe0 && b <= 0xef) { cp = b & 0x0f; need = 2; }
    else if (b >= 0xf0 && b <= 0xf4) { cp = b & 0x07; need = 3; }
    else { out += '\uFFFD'; i++; continue; }
    ok = i + need < n;
    for (j = 1; ok && j <= need; j++) {
      if ((bytes[i + j] & 0xc0) !== 0x80) { ok = false; break; }
      cp = (cp << 6) | (bytes[i + j] & 63);
    }
    if (!ok || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) { out += '\uFFFD'; i++; continue; }
    if (cp < 0x10000) out += String.fromCharCode(cp);
    else {
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023));
    }
    i += need + 1;
  }
  return out;
}

function isPrintableUtf8(bytes) {
  var i, b;
  for (i = 0; i < bytes.length; i++) {
    b = bytes[i] & 0xff;
    if (b === 0) return false;
    if (b < 0x09 || (b > 0x0d && b < 0x20)) return false;
  }
  return true;
}

function bytesToHex(bytes) {
  var out = '', i, h;
  for (i = 0; i < bytes.length; i++) {
    h = (bytes[i] & 0xff).toString(16);
    out += h.length === 1 ? '0' + h : h;
  }
  return out;
}

function bytesToB64(bytes, urlSafe, padded) {
  var alpha = urlSafe ? B64_URL : B64_STD;
  var out = '', i, a, b, c;
  for (i = 0; i < bytes.length; i += 3) {
    a = bytes[i] & 0xff;
    b = i + 1 < bytes.length ? bytes[i + 1] & 0xff : -1;
    c = i + 2 < bytes.length ? bytes[i + 2] & 0xff : -1;
    out += alpha.charAt(a >> 2);
    out += alpha.charAt(((a & 3) << 4) | (b < 0 ? 0 : b >> 4));
    if (b < 0) { out += padded ? '==' : ''; break; }
    out += alpha.charAt(((b & 15) << 2) | (c < 0 ? 0 : c >> 6));
    if (c < 0) { out += padded ? '=' : ''; break; }
    out += alpha.charAt(c & 63);
  }
  return out;
}

/* Accepts both alphabets, with or without padding, ignoring whitespace -
   which is what a pasted token or a wrapped PEM body actually looks like. */
function b64ToBytes(str) {
  var clean = String(str).replace(/[\s\r\n]+/g, '');
  var i, ch, v, bits = 0, acc = 0, out = [], seenPad = false, padCount = 0;
  for (i = 0; i < clean.length; i++) {
    ch = clean.charAt(i);
    if (ch === '=') { seenPad = true; padCount++; continue; }
    if (seenPad) return { ok: false, error: 'Padding "=" is not at the end (position ' + (i + 1) + ').' };
    v = B64_STD.indexOf(ch);
    if (v < 0) v = B64_URL.indexOf(ch);
    if (v < 0) return { ok: false, error: 'Character ' + JSON.stringify(ch) + ' at position ' + (i + 1) + ' is not valid base64.' };
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  if (padCount > 2) return { ok: false, error: 'Too much padding: ' + padCount + ' "=" characters.' };
  if (bits >= 6) return { ok: false, error: 'Truncated base64: the last group has a leftover character.' };
  if (bits > 0 && ((acc & ((1 << bits) - 1)) !== 0)) {
    return { ok: true, bytes: out, warning: 'Non-canonical base64: the final character carries bits that decode to nothing.' };
  }
  return { ok: true, bytes: out };
}

/* ---------- numbers ---------- */

function groupDigits(value) {
  var s = String(value), neg = s.charAt(0) === '-', out = '';
  if (neg) s = s.slice(1);
  while (s.length > 3) {
    out = ' ' + s.slice(-3) + out;
    s = s.slice(0, -3);
  }
  return (neg ? '-' : '') + s + out;
}

function formatSize(n) {
  var units = ['B', 'KB', 'MB', 'GB'], i = 0, v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return (i === 0 ? v : v.toFixed(v < 10 ? 2 : 1)) + ' ' + units[i];
}

function plural(n, one, many) {
  return groupDigits(n) + ' ' + (n === 1 ? one : (many || one + 's'));
}

/* Big powers of two are shown exactly, because "3.4e38 addresses" tells a
   network engineer nothing they can check. */
function pow2(exp) {
  return exp <= 53 ? String(Math.pow(2, exp)) : (BigInt(2) ** BigInt(exp)).toString();
}
