
/* ------------------------------------------------------------------ *
 * IPv4 and IPv6 address maths.
 *
 * IPv4 uses 32-bit integers kept unsigned with >>> 0; IPv6 uses BigInt,
 * because 128 bits does not fit anywhere else without a library.
 * ------------------------------------------------------------------ */

var V4_SPECIAL = [
  ['0.0.0.0/8', 'this network', 'RFC 1122'],
  ['10.0.0.0/8', 'private', 'RFC 1918'],
  ['100.64.0.0/10', 'carrier-grade NAT', 'RFC 6598'],
  ['127.0.0.0/8', 'loopback', 'RFC 1122'],
  ['169.254.0.0/16', 'link-local', 'RFC 3927'],
  ['172.16.0.0/12', 'private', 'RFC 1918'],
  ['192.0.0.0/24', 'IETF protocol assignments', 'RFC 6890'],
  ['192.0.2.0/24', 'documentation (TEST-NET-1)', 'RFC 5737'],
  ['192.88.99.0/24', '6to4 relay anycast', 'RFC 7526'],
  ['192.168.0.0/16', 'private', 'RFC 1918'],
  ['198.18.0.0/15', 'benchmarking', 'RFC 2544'],
  ['198.51.100.0/24', 'documentation (TEST-NET-2)', 'RFC 5737'],
  ['203.0.113.0/24', 'documentation (TEST-NET-3)', 'RFC 5737'],
  ['224.0.0.0/4', 'multicast', 'RFC 5771'],
  ['240.0.0.0/4', 'reserved', 'RFC 1112'],
  ['255.255.255.255/32', 'limited broadcast', 'RFC 8190']
];

/* Leading zeros are rejected: 010.1.1.1 is octal to some resolvers and
   decimal to others, and that ambiguity has been an exploit more than once. */
function parseIPv4(str) {
  var parts = String(str).trim().split('.'), out = [], i, p, n;
  if (parts.length !== 4) return null;
  for (i = 0; i < 4; i++) {
    p = parts[i];
    if (!/^[0-9]{1,3}$/.test(p)) return null;
    if (p.length > 1 && p.charAt(0) === '0') return null;
    n = parseInt(p, 10);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

function v4ToInt(octets) {
  return ((octets[0] * 16777216) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0;
}

function intToV4(n) {
  n = n >>> 0;
  return [Math.floor(n / 16777216) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.');
}

function v4Mask(prefix) {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

function v4PrefixFromMask(n) {
  var i, first = -1;
  for (i = 31; i >= 0; i--) {
    if (((n >>> i) & 1) === 0) { first = 31 - i; break; }
  }
  if (first < 0) return 32;
  /* every remaining bit must be zero, or the mask is not contiguous */
  if ((n >>> 0) !== v4Mask(first)) return null;
  return first;
}

function v4Binary(n) {
  var s = (n >>> 0).toString(2);
  while (s.length < 32) s = '0' + s;
  return s.slice(0, 8) + '.' + s.slice(8, 16) + '.' + s.slice(16, 24) + '.' + s.slice(24);
}

/* Accepts 10.0.0.0/22, 10.0.0.0/255.255.252.0 and "10.0.0.0 255.255.252.0". */
function parseCidr4(input) {
  var text = String(input).trim().replace(/\s+/g, '/');
  var slash = text.indexOf('/');
  var addrPart = slash < 0 ? text : text.slice(0, slash);
  var maskPart = slash < 0 ? '' : text.slice(slash + 1);
  var octets = parseIPv4(addrPart), prefix, maskOctets;
  if (!octets) return { ok: false, error: 'Not a valid IPv4 address: ' + JSON.stringify(addrPart) + '.' };
  if (maskPart === '') prefix = 32;
  else if (/^[0-9]{1,2}$/.test(maskPart)) {
    prefix = parseInt(maskPart, 10);
    if (prefix > 32) return { ok: false, error: 'An IPv4 prefix must be between /0 and /32.' };
  } else {
    maskOctets = parseIPv4(maskPart);
    if (!maskOctets) return { ok: false, error: 'Not a valid mask: ' + JSON.stringify(maskPart) + '.' };
    prefix = v4PrefixFromMask(v4ToInt(maskOctets));
    if (prefix === null) return { ok: false, error: 'Mask ' + maskPart + ' is not contiguous, so it has no prefix length.' };
  }
  return { ok: true, addr: v4ToInt(octets), prefix: prefix };
}

function v4InRange(addr, cidr) {
  var parsed = parseCidr4(cidr);
  var mask = v4Mask(parsed.prefix);
  return ((addr & mask) >>> 0) === ((parsed.addr & mask) >>> 0);
}

function v4Scope(addr) {
  var i, hit = [];
  for (i = 0; i < V4_SPECIAL.length; i++) {
    if (v4InRange(addr, V4_SPECIAL[i][0])) hit.push(V4_SPECIAL[i]);
  }
  if (!hit.length) return { name: 'global unicast (public)', ref: '', routable: true };
  var best = hit[hit.length - 1];
  return { name: best[1], ref: best[2], routable: false };
}

function v4Class(addr) {
  var top = (addr >>> 24) & 0xff;
  if (top < 128) return 'A';
  if (top < 192) return 'B';
  if (top < 224) return 'C';
  if (top < 240) return 'D (multicast)';
  return 'E (reserved)';
}

function v4Arpa(addr) {
  var o = intToV4(addr).split('.');
  return o[3] + '.' + o[2] + '.' + o[1] + '.' + o[0] + '.in-addr.arpa';
}

function cidrInfo4(addr, prefix) {
  var mask = v4Mask(prefix);
  var network = (addr & mask) >>> 0;
  var broadcast = (network | (~mask >>> 0)) >>> 0;
  var total = Math.pow(2, 32 - prefix);
  var info = {
    version: 4,
    input: intToV4(addr),
    prefix: prefix,
    network: intToV4(network),
    networkInt: network,
    broadcast: intToV4(broadcast),
    mask: intToV4(mask),
    maskBits: v4Binary(mask),
    wildcard: intToV4(~mask >>> 0),
    total: total,
    cidr: intToV4(network) + '/' + prefix,
    klass: v4Class(network),
    scope: v4Scope(network),
    arpa: v4Arpa(addr),
    hex: '0x' + (addr >>> 0).toString(16).toUpperCase(),
    integer: addr >>> 0,
    binary: v4Binary(addr),
    isNetworkAddress: addr === network && prefix < 31,
    isBroadcastAddress: addr === broadcast && prefix < 31
  };
  if (prefix === 32) {
    info.firstHost = info.lastHost = intToV4(network);
    info.usable = 1;
    info.note = 'A /32 is a single host - a loopback, a route target or a firewall rule.';
  } else if (prefix === 31) {
    info.firstHost = intToV4(network);
    info.lastHost = intToV4(broadcast);
    info.usable = 2;
    info.note = 'A /31 has no network or broadcast address: both addresses are usable on a point-to-point link (RFC 3021).';
  } else {
    info.firstHost = intToV4((network + 1) >>> 0);
    info.lastHost = intToV4((broadcast - 1) >>> 0);
    info.usable = total - 2;
  }
  return info;
}

/* ---------- IPv6 ---------- */

var V6_SPECIAL = [
  ['::/128', 'unspecified', 'RFC 4291'],
  ['::1/128', 'loopback', 'RFC 4291'],
  ['::ffff:0:0/96', 'IPv4-mapped', 'RFC 4291'],
  ['64:ff9b::/96', 'NAT64 well-known prefix', 'RFC 6052'],
  ['100::/64', 'discard-only', 'RFC 6666'],
  ['2001:db8::/32', 'documentation', 'RFC 3849'],
  ['2001::/32', 'Teredo', 'RFC 4380'],
  ['2002::/16', '6to4', 'RFC 3056'],
  ['fc00::/7', 'unique local (ULA)', 'RFC 4193'],
  ['fe80::/10', 'link-local', 'RFC 4291'],
  ['ff00::/8', 'multicast', 'RFC 4291']
];

var V6_MAX = (BigInt(1) << BigInt(128)) - BigInt(1);

/* Returns eight 16-bit groups, or null. Handles "::", an embedded IPv4 tail
   and a %zone suffix (which is kept aside - a zone is local to one host). */
function parseIPv6(str) {
  var text = String(str).trim();
  var pct = text.indexOf('%');
  var zone = '';
  if (pct >= 0) { zone = text.slice(pct + 1); text = text.slice(0, pct); }
  if (text === '') return null;
  if (!/^[0-9a-fA-F:.]+$/.test(text)) return null;
  if (text.indexOf(':::') >= 0) return null;

  var dbl = text.indexOf('::');
  if (dbl >= 0 && text.indexOf('::', dbl + 1) >= 0) return null; /* only one :: is allowed */
  if (dbl < 0 && (text.charAt(0) === ':' || text.charAt(text.length - 1) === ':')) return null;

  var head = dbl < 0 ? text : text.slice(0, dbl);
  var tail = dbl < 0 ? '' : text.slice(dbl + 2);
  var headParts = head === '' ? [] : head.split(':');
  var tailParts = tail === '' ? [] : tail.split(':');
  var groups = [], i, v4;

  /* an embedded IPv4 tail (::ffff:192.0.2.1) becomes the last two groups */
  var all = headParts.concat(tailParts);
  var lastPart = all.length ? all[all.length - 1] : '';
  var v4Tail = null;
  if (lastPart.indexOf('.') >= 0) {
    v4 = parseIPv4(lastPart);
    if (!v4) return null;
    v4Tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    if (tailParts.length) tailParts.pop(); else headParts.pop();
  }

  function toGroups(parts) {
    var out = [], j, p;
    for (j = 0; j < parts.length; j++) {
      p = parts[j];
      if (!/^[0-9a-fA-F]{1,4}$/.test(p)) return null;
      out.push(parseInt(p, 16));
    }
    return out;
  }

  var h = toGroups(headParts), t = toGroups(tailParts);
  if (h === null || t === null) return null;
  if (v4Tail) t = t.concat(v4Tail);

  if (dbl < 0) {
    groups = h.concat(t);
    if (groups.length !== 8) return null;
  } else {
    var fill = 8 - (h.length + t.length);
    if (fill < 1) return null; /* "::" must stand for at least one zero group */
    groups = h.slice();
    for (i = 0; i < fill; i++) groups.push(0);
    groups = groups.concat(t);
  }
  groups.zone = zone;
  return groups;
}

function v6ToBig(groups) {
  var n = BigInt(0), i;
  for (i = 0; i < 8; i++) n = (n << BigInt(16)) | BigInt(groups[i]);
  return n;
}

function bigToV6Groups(n) {
  var out = [], i;
  for (i = 7; i >= 0; i--) out[i] = Number((n >> BigInt(16 * (7 - i))) & BigInt(0xffff));
  return out;
}

function expandV6(groups) {
  var out = [], i, h;
  for (i = 0; i < 8; i++) {
    h = groups[i].toString(16);
    while (h.length < 4) h = '0' + h;
    out.push(h);
  }
  return out.join(':');
}

/* RFC 5952 canonical form: lowercase, no leading zeros, the longest run of
   zero groups (leftmost on a tie, and only when it is 2 or more) compressed. */
function compressV6(groups) {
  var best = -1, bestLen = 0, run = -1, runLen = 0, i;
  for (i = 0; i < 8; i++) {
    if (groups[i] === 0) {
      if (run < 0) { run = i; runLen = 1; } else runLen++;
      if (runLen > bestLen) { best = run; bestLen = runLen; }
    } else { run = -1; runLen = 0; }
  }
  var parts = [];
  for (i = 0; i < 8; i++) parts.push(groups[i].toString(16));
  if (bestLen < 2) return parts.join(':');
  var head = parts.slice(0, best).join(':');
  var tail = parts.slice(best + bestLen).join(':');
  return head + '::' + tail;
}

function parseCidr6(input) {
  var text = String(input).trim();
  var slash = text.lastIndexOf('/');
  var addrPart = slash < 0 ? text : text.slice(0, slash);
  var prefixPart = slash < 0 ? '128' : text.slice(slash + 1);
  var groups = parseIPv6(addrPart), prefix;
  if (!groups) return { ok: false, error: 'Not a valid IPv6 address: ' + JSON.stringify(addrPart) + '.' };
  if (!/^[0-9]{1,3}$/.test(prefixPart)) return { ok: false, error: 'Not a valid IPv6 prefix length: ' + JSON.stringify(prefixPart) + '.' };
  prefix = parseInt(prefixPart, 10);
  if (prefix > 128) return { ok: false, error: 'An IPv6 prefix must be between /0 and /128.' };
  return { ok: true, addr: v6ToBig(groups), prefix: prefix, zone: groups.zone || '' };
}

function v6Mask(prefix) {
  return prefix === 0 ? BigInt(0) : ((V6_MAX >> BigInt(128 - prefix)) << BigInt(128 - prefix));
}

function v6Scope(addr) {
  var i, parsed, mask, hit = null;
  for (i = 0; i < V6_SPECIAL.length; i++) {
    parsed = parseCidr6(V6_SPECIAL[i][0]);
    mask = v6Mask(parsed.prefix);
    if ((addr & mask) === (parsed.addr & mask)) {
      if (!hit || parsed.prefix > hit.prefix) hit = { prefix: parsed.prefix, name: V6_SPECIAL[i][1], ref: V6_SPECIAL[i][2] };
    }
  }
  if (hit) return { name: hit.name, ref: hit.ref, routable: hit.name === 'global unicast' };
  if ((addr >> BigInt(125)) === BigInt(1)) return { name: 'global unicast', ref: 'RFC 3513', routable: true };
  return { name: 'reserved by the IETF', ref: 'RFC 4291', routable: false };
}

function v6Arpa(addr) {
  var hex = expandV6(bigToV6Groups(addr)).replace(/:/g, '');
  var out = [], i;
  for (i = hex.length - 1; i >= 0; i--) out.push(hex.charAt(i));
  return out.join('.') + '.ip6.arpa';
}

function cidrInfo6(addr, prefix, zone) {
  var mask = v6Mask(prefix);
  var network = addr & mask;
  var last = network | (V6_MAX ^ mask);
  var groups = bigToV6Groups(addr);
  var netGroups = bigToV6Groups(network);
  return {
    version: 6,
    input: compressV6(groups) + (zone ? '%' + zone : ''),
    prefix: prefix,
    expanded: expandV6(groups),
    compressed: compressV6(groups),
    network: compressV6(netGroups),
    networkExpanded: expandV6(netGroups),
    cidr: compressV6(netGroups) + '/' + prefix,
    first: compressV6(netGroups),
    last: compressV6(bigToV6Groups(last)),
    total: pow2(128 - prefix),
    scope: v6Scope(network),
    arpa: v6Arpa(addr),
    hex: '0x' + addr.toString(16).toUpperCase(),
    integer: addr.toString(),
    subnetsIn64: prefix <= 64 ? pow2(64 - prefix) : 'none - this prefix is longer than a /64',
    zone: zone || ''
  };
}

/* ---------- one entry point for both versions ---------- */

function looksV6(input) {
  return String(input).indexOf(':') >= 0;
}

function analyseAddress(input) {
  var text = String(input).trim();
  if (text === '') return { ok: false, error: 'Enter an address, for example 10.0.0.0/22 or 2001:db8::/48.' };
  if (looksV6(text)) {
    var r6 = parseCidr6(text);
    if (!r6.ok) return r6;
    return { ok: true, info: cidrInfo6(r6.addr, r6.prefix, r6.zone) };
  }
  var r4 = parseCidr4(text);
  if (!r4.ok) return r4;
  return { ok: true, info: cidrInfo4(r4.addr, r4.prefix) };
}

/* ---------- splitting a block into equal subnets ---------- */

var SPLIT_LIMIT = 256;

function splitSubnets(input, newPrefix, limit) {
  var cap = limit || SPLIT_LIMIT;
  var text = String(input).trim();
  var out = [], i, count;

  if (looksV6(text)) {
    var r6 = parseCidr6(text);
    if (!r6.ok) return r6;
    if (newPrefix > 128) return { ok: false, error: 'An IPv6 prefix must be between /0 and /128.' };
    if (newPrefix < r6.prefix) return { ok: false, error: 'A /' + newPrefix + ' is larger than the /' + r6.prefix + ' you are splitting.' };
    var base6 = r6.addr & v6Mask(r6.prefix);
    var step6 = BigInt(1) << BigInt(128 - newPrefix);
    var count6 = BigInt(1) << BigInt(newPrefix - r6.prefix);
    for (i = 0; i < cap; i++) {
      if (BigInt(i) >= count6) break;
      var net6 = base6 + step6 * BigInt(i);
      out.push({
        cidr: compressV6(bigToV6Groups(net6)) + '/' + newPrefix,
        first: compressV6(bigToV6Groups(net6)),
        last: compressV6(bigToV6Groups(net6 + step6 - BigInt(1))),
        hosts: pow2(128 - newPrefix)
      });
    }
    return {
      ok: true, version: 6,
      parent: compressV6(bigToV6Groups(base6)) + '/' + r6.prefix,
      total: count6.toString(), shown: out.length,
      truncated: BigInt(out.length) < count6, subnets: out
    };
  }

  var r4 = parseCidr4(text);
  if (!r4.ok) return r4;
  if (newPrefix > 32) return { ok: false, error: 'An IPv4 prefix must be between /0 and /32.' };
  if (newPrefix < r4.prefix) return { ok: false, error: 'A /' + newPrefix + ' is larger than the /' + r4.prefix + ' you are splitting.' };
  var base = (r4.addr & v4Mask(r4.prefix)) >>> 0;
  var step = Math.pow(2, 32 - newPrefix);
  count = Math.pow(2, newPrefix - r4.prefix);
  for (i = 0; i < count && i < cap; i++) {
    var info = cidrInfo4((base + i * step) >>> 0, newPrefix);
    out.push({ cidr: info.cidr, first: info.firstHost, last: info.lastHost, hosts: groupDigits(info.usable) });
  }
  return {
    ok: true, version: 4,
    parent: intToV4(base) + '/' + r4.prefix,
    total: groupDigits(count), shown: out.length,
    truncated: out.length < count, subnets: out
  };
}

/* "How small a prefix holds N hosts" - the question that actually gets asked
   when someone is carving up a VPC. */
function prefixForHosts(hosts) {
  var need = Math.max(1, Math.floor(hosts)) + 2; /* network + broadcast */
  var p;
  for (p = 32; p >= 0; p--) {
    if (Math.pow(2, 32 - p) >= need) return p;
  }
  return 0;
}
