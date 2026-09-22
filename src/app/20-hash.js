
/* ------------------------------------------------------------------ *
 * MD5, SHA-1 and SHA-256, written out rather than called from
 * crypto.subtle: WebCrypto is unavailable on file:// and its API is
 * asynchronous, and these three are wanted for checksums, not secrets.
 *
 * MD5 and SHA-1 are here because artefact checksums and old Git object
 * ids still use them, not because they are safe to sign anything with.
 * ------------------------------------------------------------------ */

function rotl32(x, n) {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function rotr32(x, n) {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function hex32be(n) {
  var s = (n >>> 0).toString(16);
  while (s.length < 8) s = '0' + s;
  return s;
}

function hex32le(n) {
  var s = '', i, b;
  for (i = 0; i < 4; i++) {
    b = ((n >>> (8 * i)) & 0xff).toString(16);
    s += b.length === 1 ? '0' + b : b;
  }
  return s;
}

/* Message padding: 0x80, zeros to 56 mod 64, then the bit length as a
   64-bit integer - little-endian for MD5, big-endian for the SHA family. */
function padMessage(bytes, littleEndian) {
  var msg = bytes.slice(), bits = bytes.length * 8, i;
  var lo = bits >>> 0;
  var hi = Math.floor(bits / 4294967296);
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  if (littleEndian) {
    for (i = 0; i < 4; i++) msg.push((lo >>> (8 * i)) & 0xff);
    for (i = 0; i < 4; i++) msg.push((hi >>> (8 * i)) & 0xff);
  } else {
    for (i = 3; i >= 0; i--) msg.push((hi >>> (8 * i)) & 0xff);
    for (i = 3; i >= 0; i--) msg.push((lo >>> (8 * i)) & 0xff);
  }
  return msg;
}

var MD5_SHIFT = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
];

var MD5_K = (function () {
  var k = [], i;
  for (i = 0; i < 64; i++) k.push(Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);
  return k;
})();

function md5(bytes) {
  var msg = padMessage(bytes, true);
  var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  var off, i, j, m = [], a, b, c, d, f, g, tmp;
  for (off = 0; off < msg.length; off += 64) {
    for (j = 0; j < 16; j++) {
      m[j] = (msg[off + 4 * j]) | (msg[off + 4 * j + 1] << 8) |
        (msg[off + 4 * j + 2] << 16) | (msg[off + 4 * j + 3] << 24);
    }
    a = a0; b = b0; c = c0; d = d0;
    for (i = 0; i < 64; i++) {
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      tmp = d;
      d = c;
      c = b;
      b = (b + rotl32((f + a + MD5_K[i] + m[g]) >>> 0, MD5_SHIFT[i])) | 0;
      a = tmp;
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
  }
  return hex32le(a0) + hex32le(b0) + hex32le(c0) + hex32le(d0);
}

function sha1(bytes) {
  var msg = padMessage(bytes, false);
  var h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  var w = [], off, t, a, b, c, d, e, f, k, tmp;
  for (off = 0; off < msg.length; off += 64) {
    for (t = 0; t < 16; t++) {
      w[t] = ((msg[off + 4 * t] << 24) | (msg[off + 4 * t + 1] << 16) |
        (msg[off + 4 * t + 2] << 8) | msg[off + 4 * t + 3]) >>> 0;
    }
    for (t = 16; t < 80; t++) w[t] = rotl32(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    a = h[0]; b = h[1]; c = h[2]; d = h[3]; e = h[4];
    for (t = 0; t < 80; t++) {
      if (t < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (t < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (t < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      tmp = (rotl32(a, 5) + (f >>> 0) + e + k + w[t]) >>> 0;
      e = d; d = c; c = rotl32(b, 30); b = a; a = tmp;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0; h[4] = (h[4] + e) >>> 0;
  }
  return h.map(hex32be).join('');
}

var SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function sha256(bytes) {
  var msg = padMessage(bytes, false);
  var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var w = [], off, t, a, b, c, d, e, f, g, hh, s0, s1, ch, maj, t1, t2;
  for (off = 0; off < msg.length; off += 64) {
    for (t = 0; t < 16; t++) {
      w[t] = ((msg[off + 4 * t] << 24) | (msg[off + 4 * t + 1] << 16) |
        (msg[off + 4 * t + 2] << 8) | msg[off + 4 * t + 3]) >>> 0;
    }
    for (t = 16; t < 64; t++) {
      s0 = rotr32(w[t - 15], 7) ^ rotr32(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      s1 = rotr32(w[t - 2], 17) ^ rotr32(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    a = h[0]; b = h[1]; c = h[2]; d = h[3]; e = h[4]; f = h[5]; g = h[6]; hh = h[7];
    for (t = 0; t < 64; t++) {
      s1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      ch = (e & f) ^ (~e & g);
      t1 = (hh + s1 + (ch >>> 0) + SHA256_K[t] + w[t]) >>> 0;
      s0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      maj = (a & b) ^ (a & c) ^ (b & c);
      t2 = (s0 + (maj >>> 0)) >>> 0;
      hh = g; g = f; f = e;
      e = (d + t1) >>> 0;
      d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  return h.map(hex32be).join('');
}

function hashAll(bytes) {
  return { md5: md5(bytes), sha1: sha1(bytes), sha256: sha256(bytes) };
}

function hashText(text) {
  return hashAll(utf8Encode(String(text)));
}
