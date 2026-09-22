/* The logic, called directly: pure input to output. */
'use strict';

const { loadApp, runner } = require('./harness');
const { ctx } = loadApp();
const t = runner('engine');

const {
  analyseAddress, parseIPv4, parseIPv6, parseCidr4, v4PrefixFromMask, v4ToInt, intToV4,
  compressV6, splitSubnets, prefixForHosts, groupDigits, formatSize,
  md5, sha1, sha256, hashText, utf8Encode, utf8Decode, bytesToB64, b64ToBytes,
  encodeBase64, decodeBase64, urlEncode, urlDecode, parseUrlParts, decodeJwt,
  parseTimeInput, timeInfo, relativeTime, formatDuration,
  uuidV4, uuidV7, inspectUuid, generateUuids, generatePassword, entropyBits,
  formatJson, parseJsonText, validateYaml, runRegex, regexSegments, regexReplace
} = ctx;

/* ---------- IPv4 ---------- */

const a = analyseAddress('10.0.0.0/22').info;
t.eq('v4 network', a.network, '10.0.0.0');
t.eq('v4 broadcast', a.broadcast, '10.0.3.255');
t.eq('v4 mask', a.mask, '255.255.252.0');
t.eq('v4 wildcard', a.wildcard, '0.0.3.255');
t.eq('v4 usable hosts', a.usable, 1022);
t.eq('v4 first host', a.firstHost, '10.0.0.1');
t.eq('v4 last host', a.lastHost, '10.0.3.254');
t.eq('v4 scope', a.scope.name, 'private');
t.eq('v4 cidr', a.cidr, '10.0.0.0/22');

const b = analyseAddress('192.168.1.130/26').info;
t.eq('/26 network', b.network, '192.168.1.128');
t.eq('/26 broadcast', b.broadcast, '192.168.1.191');
t.eq('/26 usable', b.usable, 62);
t.eq('/26 reverse dns', b.arpa, '130.1.168.192.in-addr.arpa');
t.eq('/26 binary', b.binary, '11000000.10101000.00000001.10000010');

t.eq('/31 usable', analyseAddress('203.0.113.7/31').info.usable, 2);
t.eq('/31 first', analyseAddress('203.0.113.7/31').info.firstHost, '203.0.113.6');
t.eq('/32 usable', analyseAddress('8.8.8.8').info.usable, 1);
t.eq('public scope', analyseAddress('8.8.8.8').info.scope.name, 'global unicast (public)');
t.eq('cgnat scope', analyseAddress('100.64.0.1/10').info.scope.name, 'carrier-grade NAT');
t.eq('loopback scope', analyseAddress('127.0.0.1').info.scope.name, 'loopback');
t.eq('multicast scope', analyseAddress('239.1.1.1').info.scope.name, 'multicast');
t.eq('class B', analyseAddress('172.16.0.1/12').info.klass, 'B');
t.eq('network address flagged', analyseAddress('10.0.0.0/24').info.isNetworkAddress, true);
t.eq('broadcast address flagged', analyseAddress('10.0.0.255/24').info.isBroadcastAddress, true);

t.eq('leading zero rejected', parseIPv4('010.1.1.1'), null);
t.eq('octet over 255 rejected', parseIPv4('256.1.1.1'), null);
t.eq('three octets rejected', parseIPv4('10.1.1'), null);
t.eq('mask to prefix', v4PrefixFromMask(v4ToInt([255, 255, 252, 0])), 22);
t.eq('non-contiguous mask', v4PrefixFromMask(v4ToInt([255, 0, 255, 0])), null);
t.eq('mask notation', parseCidr4('10.0.0.0/255.255.252.0').prefix, 22);
t.eq('space notation', parseCidr4('10.0.0.0 255.255.252.0').prefix, 22);
t.eq('prefix over 32 rejected', parseCidr4('10.0.0.0/33').ok, false);
t.eq('int to address', intToV4(3232235777), '192.168.1.1');
t.eq('int to address max', intToV4(4294967295), '255.255.255.255');

/* ---------- splitting ---------- */

const split = splitSubnets('10.0.0.0/22', 24);
t.eq('split count', split.subnets.length, 4);
t.eq('split total', split.total, '4');
t.eq('split third block', split.subnets[2].cidr, '10.0.2.0/24');
t.eq('split hosts each', split.subnets[0].hosts, '254');
t.eq('split not truncated', split.truncated, false);
t.eq('split cap applies', splitSubnets('10.0.0.0/8', 24).truncated, true);
t.eq('split larger prefix refused', splitSubnets('10.0.0.0/22', 20).ok, false);
t.eq('prefix for 500 hosts', prefixForHosts(500), 23);
t.eq('prefix for 1 host', prefixForHosts(1), 30);

/* ---------- IPv6 ---------- */

const v6 = analyseAddress('2001:db8::/48').info;
t.eq('v6 compressed', v6.compressed, '2001:db8::');
t.eq('v6 expanded', v6.expanded, '2001:0db8:0000:0000:0000:0000:0000:0000');
t.eq('v6 last address', v6.last, '2001:db8:0:ffff:ffff:ffff:ffff:ffff');
t.eq('v6 total', v6.total, '1208925819614629174706176');
t.eq('v6 scope', v6.scope.name, 'documentation');
t.eq('v6 /64 count', v6.subnetsIn64, '65536');
t.eq('v6 loopback', analyseAddress('::1').info.scope.name, 'loopback');
t.eq('v6 ula', analyseAddress('fd00:1234::1/64').info.scope.name, 'unique local (ULA)');
t.eq('v6 link-local', analyseAddress('fe80::1%eth0').info.scope.name, 'link-local');
t.eq('v6 zone kept', analyseAddress('fe80::1%eth0').info.zone, 'eth0');
t.eq('v6 global', analyseAddress('2606:4700::1111').info.scope.name, 'global unicast');
t.eq('v6 mapped v4', compressV6(parseIPv6('::ffff:192.0.2.1')), '::ffff:c000:201');
t.eq('v6 leftmost run compressed', compressV6(parseIPv6('2001:0:0:1:0:0:0:1')), '2001:0:0:1::1');
t.eq('v6 triple colon rejected', parseIPv6('2001:db8:::1'), null);
t.eq('v6 five hex digits rejected', parseIPv6('12345::'), null);
t.eq('v6 seven groups rejected', parseIPv6('1:2:3:4:5:6:7'), null);
t.eq('v6 split count', splitSubnets('2001:db8::/48', 52).subnets.length, 16);
t.eq('v6 split second', splitSubnets('2001:db8::/48', 52).subnets[1].cidr, '2001:db8:0:1000::/52');

/* ---------- hashes ---------- */

t.eq('md5 empty', md5([]), 'd41d8cd98f00b204e9800998ecf8427e');
t.eq('md5 abc', md5(utf8Encode('abc')), '900150983cd24fb0d6963f7d28e17f72');
t.eq('md5 fox', md5(utf8Encode('The quick brown fox jumps over the lazy dog')), '9e107d9d372bb6826bd81d3542a419d6');
t.eq('md5 across blocks', md5(utf8Encode('a'.repeat(65))), require('crypto').createHash('md5').update('a'.repeat(65)).digest('hex'));
t.eq('sha1 empty', sha1([]), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
t.eq('sha1 abc', sha1(utf8Encode('abc')), 'a9993e364706816aba3e25717850c26c9cd0d89d');
t.eq('sha1 two blocks', sha1(utf8Encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')), '84983e441c3bd26ebaae4aa1f95129e5e54670f1');
t.eq('sha256 empty', sha256([]), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
t.eq('sha256 abc', sha256(utf8Encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
t.eq('sha256 non-ascii', hashText('привіт').sha256, require('crypto').createHash('sha256').update('привіт', 'utf8').digest('hex'));
t.eq('sha256 long input', sha256(utf8Encode('x'.repeat(1000))), require('crypto').createHash('sha256').update('x'.repeat(1000)).digest('hex'));

/* ---------- base64 and URLs ---------- */

t.eq('base64 encode', encodeBase64('hello', false, true, 0).out, 'aGVsbG8=');
t.eq('base64 decode', decodeBase64('aGVsbG8=').out, 'hello');
t.eq('base64 round trip', utf8Decode(b64ToBytes(bytesToB64(utf8Encode('héllo wörld'), false, true)).bytes), 'héllo wörld');
t.eq('base64 url-safe alphabet', bytesToB64([251, 255, 190], true, false), '-_--');
t.eq('base64 rejects junk', decodeBase64('aGVsbG8*').ok, false);
t.eq('base64 unpadded accepted', decodeBase64('aGVsbG8').out, 'hello');
t.eq('base64 wrapping', encodeBase64('x'.repeat(100), false, true, 76).out.split('\n').length, 2);
t.eq('base64 binary flagged', decodeBase64(bytesToB64([0, 1, 2, 3], false, true)).binary, true);

t.eq('url component', urlEncode('a b&c=d', 'component').out, 'a%20b%26c%3Dd');
t.eq('url form', urlEncode('a b&c', 'form').out, 'a+b%26c');
t.eq('url decode', urlDecode('a%20b', false).out, 'a b');
t.eq('url decode broken', urlDecode('%E0%A4%A', false).ok, false);
const parts = parseUrlParts('https://user:pw@api.example.com:8443/v1/things?q=a%20b&page=2#frag');
t.eq('url host', parts.host, 'api.example.com');
t.eq('url port', parts.port, '8443');
t.eq('url path', parts.path, '/v1/things');
t.eq('url first param', parts.params[0].value, 'a b');
t.eq('url fragment', parts.fragment, 'frag');
t.eq('url userinfo', parts.userinfo, 'user:pw');

/* ---------- JWT ---------- */

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
const jwt = decodeJwt(token, Date.UTC(2024, 0, 1));
t.eq('jwt alg', jwt.alg, 'HS256');
t.eq('jwt typ', jwt.typ, 'JWT');
t.eq('jwt claim count', jwt.claims.length, 3);
t.has('jwt no-expiry note', jwt.notes.join(' '), 'does not expire');
t.eq('jwt signature not verified', jwt.signatureBytes, 32);
t.eq('jwt two segments rejected', decodeJwt('a.b').ok, false);
t.has('jwe reported', decodeJwt('a.b.c.d.e').error, 'JWE');
const expired = 'eyJhbGciOiJub25lIn0.eyJleHAiOjEwMDAwMDAwMDB9.';
const noneToken = decodeJwt(expired, Date.UTC(2024, 0, 1));
t.eq('jwt alg none flagged', noneToken.alg, 'none');
t.eq('jwt expiry detected', noneToken.expired, true);
t.has('jwt alg none warning', noneToken.notes.join(' '), 'no signature at all');

/* ---------- time ---------- */

t.eq('epoch seconds detected', parseTimeInput('1700000000').unit, 'seconds');
t.eq('epoch millis detected', parseTimeInput('1700000000000').unit, 'milliseconds');
t.eq('epoch nanos detected', parseTimeInput('1700000000000000000').unit, 'nanoseconds');
t.eq('epoch to iso', timeInfo(parseTimeInput('1700000000').ms).iso, '2023-11-14T22:13:20.000Z');
t.eq('forced unit overrides detection', timeInfo(parseTimeInput('1700000000', 'milliseconds').ms).iso, new Date(1700000000).toISOString());
t.eq('iso parsed', parseTimeInput('2024-03-01T12:00:00Z').ms, Date.UTC(2024, 2, 1, 12));
t.eq('nonsense rejected', parseTimeInput('nope').ok, false);
t.eq('duration format', formatDuration(90061), '1d 1h 1m 1s');
t.eq('relative past', relativeTime(-3600000), '1 hour ago');
t.eq('relative future', relativeTime(86400000 * 3), 'in 3 days');
t.eq('weekday', timeInfo(Date.UTC(2024, 2, 1)).weekday, 'Friday');
t.eq('day of year', timeInfo(Date.UTC(2024, 2, 1)).dayOfYear, 61);

/* ---------- ids and passwords ---------- */

t.eq('uuid v4 shape', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuidV4()), true);
t.eq('uuid v4 unique', new Set(generateUuids(4, 50)).size, 50);
t.eq('uuid v7 version', inspectUuid(uuidV7(1700000000000)).version, 7);
t.eq('uuid v7 carries time', inspectUuid(uuidV7(1700000000000)).timestamp, '2023-11-14T22:13:20.000Z');
t.eq('uuid v7 sorts by time', uuidV7(1700000000000) < uuidV7(1800000000000), true);
t.eq('uuid rejected', inspectUuid('nope').ok, false);
t.eq('nil uuid', inspectUuid('00000000-0000-0000-0000-000000000000').nil, true);
t.eq('uuid count capped', generateUuids(4, 5000).length, 500);

const pw = generatePassword({ length: 24, lower: true, upper: true, digits: true, symbols: true, noAmbiguous: true });
t.eq('password length', pw.password.length, 24);
t.eq('password has every selected class',
  /[a-z]/.test(pw.password) && /[A-Z]/.test(pw.password) && /[0-9]/.test(pw.password) && /[^a-zA-Z0-9]/.test(pw.password), true);
t.eq('password avoids ambiguous', /[Il1O0o]/.test(pw.password), false);
t.eq('password needs a set', generatePassword({ length: 10 }).ok, false);
t.eq('password too short for policy', generatePassword({ length: 4, lower: true, upper: true, digits: true, symbols: true }).ok, true);
t.eq('entropy of 20 lowercase', entropyBits(26, 20), 94);
t.eq('two passwords differ', generatePassword({ length: 32, lower: true }).password === generatePassword({ length: 32, lower: true }).password, false);

/* ---------- JSON ---------- */

t.eq('json formatted', formatJson('{"b":1,"a":[2,3]}', 2, true).out, '{\n  "a": [\n    2,\n    3\n  ],\n  "b": 1\n}');
t.eq('json minified', formatJson('{ "a" : 1 }', 0, false).out, '{"a":1}');
t.eq('json depth', formatJson('{"a":{"b":[1,2]}}', 2, false).stats.depth, 4);
t.eq('json key count', formatJson('{"a":1,"b":{"c":2}}', 2, false).stats.keys, 3);
const jsonErr = parseJsonText('{\n  "a": 1,\n  "b": ,\n}');
t.eq('json error line', jsonErr.line, 3);
t.eq('json error column', jsonErr.col, 8);
t.has('json error mentions value', jsonErr.error, 'value was expected');
t.has('trailing comma reported', parseJsonText('{"a":1,}').error, 'trailing comma');
t.has('single quotes reported', parseJsonText("{'a':1}").error, 'double quotes');
t.has('unclosed object reported', parseJsonText('{"a":1').error, 'never closed');
t.eq('json error has an excerpt', jsonErr.excerpt.indexOf('^') >= 0, true);

/* ---------- YAML ---------- */

const manifest = [
  'apiVersion: apps/v1',
  'kind: Deployment',
  'metadata:',
  '  name: web',
  '  labels:',
  '    app: web',
  'spec:',
  '  replicas: 3',
  '  template:',
  '    spec:',
  '      containers:',
  '        - name: nginx',
  '          image: nginx:1.25',
  '          ports:',
  '            - containerPort: 80',
  '          args: ["-c", "/etc/nginx.conf"]',
  ''
].join('\n');
const yaml = validateYaml(manifest);
t.eq('manifest valid', yaml.ok, true);
const parsed = JSON.parse(yaml.json);
t.eq('yaml replicas', parsed.spec.replicas, 3);
t.eq('yaml container name', parsed.spec.template.spec.containers[0].name, 'nginx');
t.eq('yaml image keeps colon', parsed.spec.template.spec.containers[0].image, 'nginx:1.25');
t.eq('yaml nested sequence', parsed.spec.template.spec.containers[0].ports[0].containerPort, 80);
t.eq('yaml flow sequence', parsed.spec.template.spec.containers[0].args[1], '/etc/nginx.conf');
t.eq('yaml tab rejected', validateYaml('a:\n\tb: 1\n').ok, false);
t.has('duplicate key reported', validateYaml('a: 1\na: 2\n').errors[0].message, 'Duplicate key');
t.eq('duplicate key line', validateYaml('a: 1\na: 2\n').errors[0].line, 2);
t.eq('version warning', validateYaml('version: 3.10\n').warnings.length, 1);
t.has('norway problem warned', validateYaml('enabled: no\n').warnings[0].message, 'YAML 1.1');
t.has('octal warned', validateYaml('mode: 0755\n').warnings[0].message, 'octal');
t.eq('multiple documents', validateYaml('---\na: 1\n---\nb: 2\n').documents, 2);
t.eq('literal block scalar', JSON.parse(validateYaml('script: |\n  line1\n  line2\n').json).script, 'line1\nline2\n');
t.eq('folded block scalar', JSON.parse(validateYaml('text: >\n  a\n  b\n').json).text, 'a b\n');
t.eq('comment stripped', JSON.parse(validateYaml('a: 1 # note\n# whole line\nb: "x # y"\n').json).b, 'x # y');
t.eq('url value kept whole', JSON.parse(validateYaml('url: http://example.com/x\n').json).url, 'http://example.com/x');
t.eq('empty value is null', JSON.parse(validateYaml('a:\nb: 1\n').json).a, null);
t.eq('compose ports', JSON.parse(validateYaml('services:\n  web:\n    image: nginx\n    ports:\n      - "80:80"\n').json).services.web.ports[0], '80:80');
t.eq('anchors reported', validateYaml('a: &x 1\nb: *x\n').ok, false);
t.has('anchors explained', validateYaml('a: &x 1\n').errors[0].message, 'not supported');
t.eq('garbage line reported', validateYaml('a: 1\nthis is not yaml\n').ok, false);
t.eq('empty input reported', validateYaml('   ').ok, false);

/* ---------- regex ---------- */

const rx = runRegex('(\\d+)-(\\w+)', 'g', 'a 12-ab and 7-cd');
t.eq('regex match count', rx.count, 2);
t.eq('regex capture group', rx.matches[0].groups[1].value, 'ab');
t.eq('regex match index', rx.matches[1].index, 12);
t.eq('invalid pattern reported', runRegex('(', '', 'x').ok, false);
t.eq('zero-length match terminates', runRegex('a*', 'g', 'bb').count, 3);
t.eq('named group', runRegex('(?<year>\\d{4})', '', '2024').matches[0].named[0].value, '2024');
t.eq('segments alternate', regexSegments('a 12-ab', runRegex('\\d+', 'g', 'a 12-ab').matches).length, 3);
t.eq('replacement', regexReplace('\\s+', 'g', 'a  b', '_').out, 'a_b');
t.eq('match limit', runRegex('a', 'g', 'a'.repeat(1000)).truncated, true);

/* ---------- formatting helpers ---------- */

t.eq('digit grouping', groupDigits(1234567), '1 234 567');
t.eq('size format', formatSize(2048), '2.00 KB');

t.done();
