
/* ------------------------------------------------------------------ *
 * Time, UUIDs and passwords.
 * ------------------------------------------------------------------ */

var TIME_UNITS = [
  ['year', 31557600000], ['month', 2629800000], ['day', 86400000],
  ['hour', 3600000], ['minute', 60000], ['second', 1000]
];

function relativeTime(deltaMs) {
  var abs = Math.abs(deltaMs), i, size, n;
  if (abs < 1000) return deltaMs >= 0 ? 'now' : 'just now';
  for (i = 0; i < TIME_UNITS.length; i++) {
    size = TIME_UNITS[i][1];
    if (abs >= size || i === TIME_UNITS.length - 1) {
      n = Math.round(abs / size);
      return (deltaMs >= 0 ? 'in ' : '') + n + ' ' + TIME_UNITS[i][0] + (n === 1 ? '' : 's') + (deltaMs >= 0 ? '' : ' ago');
    }
  }
  return 'now';
}

function formatDuration(seconds) {
  var s = Math.floor(Math.abs(seconds)), parts = [];
  var d = Math.floor(s / 86400); s -= d * 86400;
  var h = Math.floor(s / 3600); s -= h * 3600;
  var m = Math.floor(s / 60); s -= m * 60;
  if (d) parts.push(d + 'd');
  if (h) parts.push(h + 'h');
  if (m) parts.push(m + 'm');
  if (s || !parts.length) parts.push(s + 's');
  return (seconds < 0 ? '-' : '') + parts.join(' ');
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

/* Digits are ambiguous: 1700000000 is seconds, 1700000000000 is
   milliseconds, and log lines carry both. Decide by magnitude, and say
   which reading was used rather than quietly picking one. */
function detectEpochUnit(digits) {
  var len = digits.replace('-', '').length;
  if (len <= 11) return { unit: 'seconds', factor: 1 };
  if (len <= 14) return { unit: 'milliseconds', factor: 1000 };
  if (len <= 17) return { unit: 'microseconds', factor: 1000000 };
  return { unit: 'nanoseconds', factor: 1000000000 };
}

function parseTimeInput(text, forced) {
  var s = String(text).trim();
  if (s === '') return { ok: false, error: 'Enter a timestamp or a date.' };
  if (/^-?[0-9]+(\.[0-9]+)?$/.test(s)) {
    var unit = forced && forced !== 'auto'
      ? { unit: forced, factor: { seconds: 1, milliseconds: 1000, microseconds: 1000000, nanoseconds: 1000000000 }[forced] }
      : detectEpochUnit(s.split('.')[0]);
    var ms = parseFloat(s) / unit.factor * 1000;
    if (!isFinite(ms) || Math.abs(ms) > 8.64e15) {
      return { ok: false, error: 'That is outside the range a date can represent (about +-273 000 years).' };
    }
    return { ok: true, ms: ms, unit: unit.unit, source: 'epoch' };
  }
  var parsed = Date.parse(s);
  if (isNaN(parsed)) {
    return { ok: false, error: 'Not a number and not a date this browser can parse. ISO 8601 (2024-03-01T12:00:00Z) always works.' };
  }
  return { ok: true, ms: parsed, unit: '', source: 'date' };
}

function timeInfo(ms, nowMs) {
  var d = new Date(ms);
  var now = typeof nowMs === 'number' ? nowMs : Date.now();
  var offsetMin = -d.getTimezoneOffset();
  var sign = offsetMin >= 0 ? '+' : '-';
  var startOfYear = Date.UTC(d.getUTCFullYear(), 0, 1);
  return {
    iso: d.toISOString(),
    utc: d.toUTCString(),
    local: d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
      pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()),
    offset: 'UTC' + sign + pad2(Math.floor(Math.abs(offsetMin) / 60)) + ':' + pad2(Math.abs(offsetMin) % 60),
    seconds: Math.floor(ms / 1000),
    millis: Math.floor(ms),
    micros: Math.floor(ms) * 1000,
    nanos: Math.floor(ms) * 1000000,
    relative: relativeTime(ms - now),
    weekday: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()],
    dayOfYear: Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - startOfYear) / 86400000) + 1,
    utcDate: d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()),
    utcTime: pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds())
  };
}

/* ---------- randomness ---------- */

/* No Math.random fallback anywhere below. A password or a token built from a
   predictable generator looks exactly as good as a real one, which is the
   whole problem - better to say the platform cannot do it. */
function randomBytes(n) {
  var g = typeof globalThis !== 'undefined' ? globalThis : null;
  var c = g && g.crypto;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error('This browser has no crypto.getRandomValues, so nothing random can be generated safely here.');
  }
  var buf = new Uint8Array(n);
  c.getRandomValues(buf);
  var out = [], i;
  for (i = 0; i < n; i++) out.push(buf[i]);
  return out;
}

/* Rejection sampling: taking a random byte modulo the alphabet size would
   make the first (256 % size) characters slightly more likely. */
function randomBelow(limit) {
  if (limit < 1 || limit > 256) throw new Error('randomBelow supports 1..256');
  var max = Math.floor(256 / limit) * limit, b;
  for (;;) {
    b = randomBytes(1)[0];
    if (b < max) return b % limit;
  }
}

/* ---------- UUID ---------- */

var UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function uuidFromBytes(b) {
  var h = bytesToHex(b);
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20, 32);
}

function uuidV4() {
  var b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return uuidFromBytes(b);
}

/* v7 sorts by creation time, which is what makes it a better database key
   than v4: 48 bits of Unix milliseconds, then 74 random bits. */
function uuidV7(nowMs) {
  var ms = Math.floor(typeof nowMs === 'number' ? nowMs : Date.now());
  var b = randomBytes(16), i;
  for (i = 0; i < 6; i++) b[5 - i] = Math.floor(ms / Math.pow(256, i)) & 0xff;
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  return uuidFromBytes(b);
}

function generateUuids(version, count, nowMs) {
  var out = [], i;
  var n = Math.max(1, Math.min(500, Math.floor(count) || 1));
  for (i = 0; i < n; i++) out.push(version === 7 ? uuidV7(nowMs) : uuidV4());
  return out;
}

function inspectUuid(text) {
  var s = String(text).trim().replace(/^urn:uuid:/i, '').replace(/^[{(]|[})]$/g, '');
  if (!UUID_RE.test(s)) return { ok: false, error: 'Not a UUID: expected 8-4-4-4-12 hexadecimal digits.' };
  var hex = s.replace(/-/g, '').toLowerCase();
  var version = parseInt(hex.charAt(12), 16);
  var variantNibble = parseInt(hex.charAt(16), 16);
  var variant = variantNibble >= 8 && variantNibble <= 11 ? 'RFC 4122' :
    (variantNibble >= 12 && variantNibble <= 13 ? 'Microsoft (reserved)' :
      (variantNibble >= 14 ? 'reserved for future use' : 'NCS (legacy)'));
  var out = {
    ok: true,
    canonical: s.toLowerCase(),
    version: version,
    variant: variant,
    nil: hex === '00000000000000000000000000000000',
    max: hex === 'ffffffffffffffffffffffffffffffff',
    hex: hex
  };
  if (version === 7) {
    var ms = parseInt(hex.slice(0, 12), 16);
    out.timestamp = new Date(ms).toISOString();
    out.timestampNote = 'v7 embeds the creation time, so it is not anonymous.';
  }
  if (version === 1) {
    var timeHex = hex.slice(13, 16) + hex.slice(8, 12) + hex.slice(0, 8);
    var intervals = parseInt(timeHex, 16);
    out.timestamp = new Date(intervals / 10000 - 12219292800000).toISOString();
    out.timestampNote = 'v1 embeds the creation time and, historically, the MAC address of the machine that made it.';
  }
  return out;
}

/* ---------- passwords ---------- */

var CHARSETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!#$%&()*+,-.:;<=>?@[]^_{|}~'
};
var AMBIGUOUS = 'Il1O0o';

function buildAlphabet(opts) {
  var set = '', k;
  for (k in CHARSETS) {
    if (opts[k]) set += CHARSETS[k];
  }
  if (opts.noAmbiguous) {
    set = set.split('').filter(function (c) { return AMBIGUOUS.indexOf(c) < 0; }).join('');
  }
  return set;
}

function entropyBits(alphabetSize, length) {
  return alphabetSize < 2 ? 0 : Math.round(length * (Math.log(alphabetSize) / Math.log(2)) * 10) / 10;
}

function strengthLabel(bits) {
  if (bits < 40) return 'weak - fine for a throwaway, not for anything that matters';
  if (bits < 60) return 'fair - acceptable behind rate limiting and MFA';
  if (bits < 80) return 'strong - suitable for an account password';
  return 'very strong - suitable for a service credential or a root key';
}

function generatePassword(opts) {
  var length = Math.max(4, Math.min(256, Math.floor(opts.length) || 20));
  var alphabet = buildAlphabet(opts);
  if (alphabet.length < 2) return { ok: false, error: 'Pick at least one character set.' };

  var required = [], k;
  for (k in CHARSETS) {
    if (!opts[k]) continue;
    var pool = opts.noAmbiguous
      ? CHARSETS[k].split('').filter(function (c) { return AMBIGUOUS.indexOf(c) < 0; }).join('')
      : CHARSETS[k];
    if (pool.length) required.push(pool);
  }
  if (required.length > length) {
    return { ok: false, error: 'Length ' + length + ' is too short to contain one character from each of the ' + required.length + ' selected sets.' };
  }

  /* Generate, then check the policy and start again if it is not met: the
     result stays uniform over the passwords that satisfy the policy, where
     patching characters into fixed positions would not. */
  var attempt, i, j, ok, out = '';
  for (attempt = 0; attempt < 1000; attempt++) {
    out = '';
    for (i = 0; i < length; i++) out += alphabet.charAt(randomBelow(alphabet.length));
    ok = true;
    for (j = 0; j < required.length; j++) {
      if (!new RegExp('[' + required[j].replace(/[\\\]^-]/g, '\\$&') + ']').test(out)) { ok = false; break; }
    }
    if (ok) break;
  }
  var bits = entropyBits(alphabet.length, length);
  return {
    ok: true,
    password: out,
    length: length,
    alphabetSize: alphabet.length,
    bits: bits,
    strength: strengthLabel(bits)
  };
}
