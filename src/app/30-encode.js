
/* ------------------------------------------------------------------ *
 * Base64, URL encoding, JWT.
 * ------------------------------------------------------------------ */

function encodeBase64(text, urlSafe, padded, wrap) {
  var out = bytesToB64(utf8Encode(String(text)), urlSafe, padded);
  if (wrap && wrap > 0) {
    var lines = [], i;
    for (i = 0; i < out.length; i += wrap) lines.push(out.slice(i, i + wrap));
    out = lines.join('\n');
  }
  return { ok: true, out: out, bytes: utf8Encode(String(text)).length };
}

function decodeBase64(text) {
  if (String(text).trim() === '') return { ok: false, error: 'Nothing to decode.' };
  var res = b64ToBytes(text);
  if (!res.ok) return res;
  var printable = isPrintableUtf8(res.bytes);
  return {
    ok: true,
    out: printable ? utf8Decode(res.bytes) : '',
    hex: bytesToHex(res.bytes),
    bytes: res.bytes.length,
    binary: !printable,
    warning: res.warning || (printable ? '' : 'The decoded bytes are not printable text, so only the hex dump is shown.')
  };
}

/* ---------- URL ---------- */

function urlEncode(text, mode) {
  try {
    if (mode === 'component') return { ok: true, out: encodeURIComponent(String(text)) };
    if (mode === 'full') return { ok: true, out: encodeURI(String(text)) };
    /* form: what a browser posts - space becomes +, and the RFC 3986 set
       that encodeURIComponent leaves alone is encoded too */
    return {
      ok: true,
      out: encodeURIComponent(String(text))
        .replace(/[!'()*]/g, function (c) { return '%' + c.charCodeAt(0).toString(16).toUpperCase(); })
        .replace(/%20/g, '+')
    };
  } catch (e) {
    return { ok: false, error: 'Could not encode: ' + e.message };
  }
}

function urlDecode(text, plusIsSpace) {
  var src = String(text);
  if (plusIsSpace) src = src.replace(/\+/g, ' ');
  try {
    return { ok: true, out: decodeURIComponent(src) };
  } catch (e) {
    return { ok: false, error: 'Not a valid percent-encoded string: a "%" is not followed by two hex digits, or the bytes are not valid UTF-8.' };
  }
}

/* A deliberately forgiving splitter: people paste half a URL, and the
   built-in URL parser refuses anything without a scheme. */
function parseUrlParts(input) {
  var text = String(input).trim();
  if (text === '') return { ok: false, error: 'Nothing to parse.' };
  var m = /^(?:([a-zA-Z][a-zA-Z0-9+.-]*):)?(?:\/\/)?([^\/?#]*)?([^?#]*)?(?:\?([^#]*))?(?:#(.*))?$/.exec(text);
  if (!m) return { ok: false, error: 'Could not split that into URL parts.' };
  var authority = m[2] || '';
  var userinfo = '', hostport = authority;
  var at = authority.lastIndexOf('@');
  if (at >= 0) { userinfo = authority.slice(0, at); hostport = authority.slice(at + 1); }
  var host = hostport, port = '';
  var colon = hostport.lastIndexOf(':');
  if (colon >= 0 && hostport.indexOf(']') < colon) { host = hostport.slice(0, colon); port = hostport.slice(colon + 1); }
  var query = m[4] || '';
  var params = [], i, pair, eq, k, v, pairs = query === '' ? [] : query.split('&');
  for (i = 0; i < pairs.length; i++) {
    pair = pairs[i];
    if (pair === '') continue;
    eq = pair.indexOf('=');
    k = eq < 0 ? pair : pair.slice(0, eq);
    v = eq < 0 ? '' : pair.slice(eq + 1);
    params.push({
      key: urlDecode(k, true).out || k,
      value: urlDecode(v, true).out || v,
      raw: pair
    });
  }
  return {
    ok: true,
    scheme: m[1] || '',
    userinfo: userinfo,
    host: host,
    port: port,
    path: m[3] || '',
    query: query,
    fragment: m[5] || '',
    params: params
  };
}

/* ---------- JWT ---------- */

var JWT_CLAIMS = {
  iss: 'issuer', sub: 'subject', aud: 'audience', exp: 'expires at',
  nbf: 'not valid before', iat: 'issued at', jti: 'token id',
  scope: 'scope', scp: 'scope', azp: 'authorised party', typ: 'type'
};

function jwtSegment(seg, name) {
  var res = b64ToBytes(seg);
  if (!res.ok) return { ok: false, error: 'The ' + name + ' is not valid base64url: ' + res.error };
  var text = utf8Decode(res.bytes), value;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: 'The ' + name + ' decoded, but it is not valid JSON: ' + e.message };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'The ' + name + ' is not a JSON object.' };
  }
  return { ok: true, value: value, text: text };
}

/* Decoding only. A JWT is signed, not encrypted: anything in it is readable
   by whoever holds it, and nothing here says the signature is genuine. */
function decodeJwt(token, nowMs) {
  var t = String(token).trim().replace(/^Bearer\s+/i, '').replace(/\s+/g, '');
  if (t === '') return { ok: false, error: 'Paste a token.' };
  var parts = t.split('.');
  if (parts.length === 5) {
    return { ok: false, error: 'That is a JWE (five segments): the payload is encrypted, so it cannot be read without the decryption key.' };
  }
  if (parts.length !== 3) {
    return { ok: false, error: 'A JWT has three dot-separated segments; this one has ' + parts.length + '.' };
  }
  var head = jwtSegment(parts[0], 'header');
  if (!head.ok) return head;
  var body = jwtSegment(parts[1], 'payload');
  if (!body.ok) return body;

  var now = typeof nowMs === 'number' ? nowMs : Date.now();
  var notes = [], times = [], k, claim;
  var alg = head.value.alg;

  if (alg === 'none' || alg === 'None' || alg === 'NONE') {
    notes.push('alg is "none": this token carries no signature at all. Any service that accepts it is trusting unverified input.');
  }
  if (parts[2] === '' && alg !== 'none') {
    notes.push('The signature segment is empty although alg is ' + JSON.stringify(alg) + '.');
  }

  ['iat', 'nbf', 'exp'].forEach(function (name) {
    var v = body.value[name];
    if (typeof v !== 'number') return;
    times.push({ claim: name, label: JWT_CLAIMS[name], epoch: v, iso: new Date(v * 1000).toISOString(), relative: relativeTime(v * 1000 - now) });
  });

  if (typeof body.value.exp === 'number') {
    if (body.value.exp * 1000 <= now) notes.push('Expired ' + relativeTime(body.value.exp * 1000 - now) + '.');
    else notes.push('Expires ' + relativeTime(body.value.exp * 1000 - now) + '.');
  } else {
    notes.push('No exp claim: this token does not expire on its own.');
  }
  if (typeof body.value.nbf === 'number' && body.value.nbf * 1000 > now) {
    notes.push('Not valid yet: nbf is ' + relativeTime(body.value.nbf * 1000 - now) + '.');
  }

  var claims = [];
  for (k in body.value) {
    if (!Object.prototype.hasOwnProperty.call(body.value, k)) continue;
    claim = body.value[k];
    claims.push({
      key: k,
      label: JWT_CLAIMS[k] || '',
      value: typeof claim === 'string' ? claim : JSON.stringify(claim)
    });
  }

  return {
    ok: true,
    alg: typeof alg === 'string' ? alg : '(missing)',
    typ: typeof head.value.typ === 'string' ? head.value.typ : '',
    kid: typeof head.value.kid === 'string' ? head.value.kid : '',
    header: JSON.stringify(head.value, null, 2),
    payload: JSON.stringify(body.value, null, 2),
    signature: parts[2],
    signatureBytes: parts[2] ? (b64ToBytes(parts[2]).bytes || []).length : 0,
    claims: claims,
    times: times,
    notes: notes,
    expired: typeof body.value.exp === 'number' && body.value.exp * 1000 <= now
  };
}
