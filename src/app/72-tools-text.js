
TOOLS.push({
  id: 'base64',
  name: 'Base64',
  blurb: 'Encode and decode, URL-safe too',
  keywords: 'base64 b64 encode decode url-safe padding secret kubernetes data urlsafe',
  build: function (root) {
    var mode = selectField(root, 'Direction', [
      { value: 'encode', text: 'Encode text to base64' },
      { value: 'decode', text: 'Decode base64 to text' }
    ], 'encode');
    var input = field(root, 'Input', { tag: 'textarea', rows: 5, placeholder: 'Text to encode' });
    var opts = optionRow(root);
    var urlSafe = toggle(opts, 'URL-safe (-_)', false, update);
    var padding = toggle(opts, 'Padding (=)', true, update);
    var wrap = toggle(opts, 'Wrap at 76', false, update);

    var tools = buttonRow(root);
    pasteButton(tools, input, function () { update(); });
    button(tools, 'Clear', function () { input.value = ''; update(); });
    examples(root, [
      { label: 'Plain text', value: 'hello world' },
      { label: 'Encoded secret', value: 'cG9zdGdyZXM6Ly91c2VyOnBhc3N3b3JkQGRiOjU0MzIvYXBw' },
      { label: 'URL-safe token', value: 'eyJhbGciOiJIUzI1NiJ9' },
      { label: 'Non-ASCII', value: 'привіт, світ' }
    ], function (value) {
      input.value = value;
      update();
    });
    helpBlock(root, [
      'Encoding takes UTF-8 bytes, so accented and non-Latin text round-trips correctly.',
      'Decoding accepts both alphabets (+/ and -_), with or without "=" padding, and ignores line breaks - so a wrapped PEM body or a pasted kubectl secret works as it is.',
      'URL-safe swaps + and / for - and _, which is what JWTs and query-string values use.',
      'If the decoded bytes are not printable text, the hex dump is shown instead of mangled characters.',
      '"Use as input" moves the output back into the box and flips the direction, so you can check a round trip.'
    ]);

    var err = messageBox(root, 'err');
    var warn = messageBox(root, 'warnbox');
    var outCard = card(root, 'Output');
    var out = outArea(outCard);
    var info = outRow(outCard, 'Size');
    var row = buttonRow(outCard);
    copyButton(row, 'Copy', function () { return out.textContent; });
    button(row, 'Use as input', function () {
      input.value = out.textContent;
      mode.value = mode.value === 'encode' ? 'decode' : 'encode';
      update();
    });
    button(row, 'Clear', function () { input.value = ''; update(); });
    var hexCard = card(root, 'Decoded bytes (hex)');
    var hex = outArea(hexCard);

    function update() {
      var text = input.value || '';
      hexCard.hidden = true;
      if (text === '') {
        out.textContent = '';
        info.set('0 bytes');
        err.set('');
        warn.set('');
        return;
      }
      if (mode.value === 'encode') {
        var enc = encodeBase64(text, urlSafe.checked, padding.checked, wrap.checked ? 76 : 0);
        err.set('');
        warn.set('');
        out.textContent = enc.out;
        info.set(plural(enc.bytes, 'byte') + ' in, ' + plural(enc.out.replace(/\n/g, '').length, 'character') + ' out');
        return;
      }
      var dec = decodeBase64(text);
      if (!dec.ok) {
        err.set(dec.error);
        warn.set('');
        out.textContent = '';
        info.set('-');
        return;
      }
      err.set('');
      warn.set(dec.warning || '');
      out.textContent = dec.out;
      info.set(plural(dec.bytes, 'byte') + ' decoded');
      if (dec.binary || dec.bytes <= 64) {
        hexCard.hidden = false;
        hex.textContent = dec.hex;
      }
    }

    on(mode, 'change', function () {
      input.placeholder = mode.value === 'encode' ? 'Text to encode' : 'Base64 to decode';
      update();
    });
    on(input, 'input', update);
    update();
    return { update: update, input: input, mode: mode };
  }
});

TOOLS.push({
  id: 'url',
  name: 'URL Encoder',
  blurb: 'Percent-encoding and query parsing',
  keywords: 'url uri percent encode decode query string parameters escape encodeuricomponent',
  build: function (root) {
    var mode = selectField(root, 'Action', [
      { value: 'component', text: 'Encode - component (encodeURIComponent)' },
      { value: 'full', text: 'Encode - whole URL (encodeURI)' },
      { value: 'form', text: 'Encode - form value (space becomes +)' },
      { value: 'decode', text: 'Decode' },
      { value: 'decodeplus', text: 'Decode - form value (+ becomes space)' }
    ], 'component');
    var input = field(root, 'Input', { tag: 'textarea', rows: 4, placeholder: 'https://example.com/a b?q=1&r=2' });
    var tools = buttonRow(root);
    pasteButton(tools, input, function () { update(); });
    button(tools, 'Clear', function () { input.value = ''; update(); });
    examples(root, [
      { label: 'URL with spaces', value: 'https://example.com/search results?q=disk usage&sort=size' },
      { label: 'Encoded query', value: 'name%3Dweb%26ns%3Ddefault%26app%3Dnginx%2F1.25' },
      { label: 'Form value', value: 'first name=Ada Lovelace&role=SRE' },
      { label: 'Path segment', value: 'namespaces/default/pods/web-7f9c/log' }
    ], function (value) {
      input.value = value;
      update();
    });
    helpBlock(root, [
      'Component encoding is for one value inside a URL: it escapes /, ? and & so they cannot break out of the field they are in. This is the one you usually want.',
      'Whole-URL encoding leaves the structural characters alone, so a complete URL stays usable.',
      'Form encoding is what a browser posts: spaces become "+", and the characters encodeURIComponent leaves alone are escaped too.',
      'Decoding fails loudly on a malformed sequence - a "%" not followed by two hex digits, or bytes that are not valid UTF-8 - rather than returning something that looks plausible.',
      'The URL parts card appears whenever the input looks like a URL, and decodes each query parameter for you.'
    ]);
    var err = messageBox(root, 'err');
    var outCard = card(root, 'Output');
    var out = outArea(outCard);
    var row = buttonRow(outCard);
    copyButton(row, 'Copy', function () { return out.textContent; });
    button(row, 'Use as input', function () { input.value = out.textContent; update(); });
    button(row, 'Clear', function () { input.value = ''; update(); });

    var partsCard = card(root, 'URL parts');
    var partsBox = add(partsCard, el('div'));
    var paramsTable = table(partsCard, ['Parameter', 'Value']);

    function update() {
      var text = input.value || '';
      if (text === '') {
        out.textContent = '';
        err.set('');
        partsCard.hidden = true;
        return;
      }
      var res = mode.value === 'decode' ? urlDecode(text, false)
        : (mode.value === 'decodeplus' ? urlDecode(text, true) : urlEncode(text, mode.value));
      if (!res.ok) {
        err.set(res.error);
        out.textContent = '';
      } else {
        err.set('');
        out.textContent = res.out;
      }

      var parts = parseUrlParts(text);
      clear(partsBox);
      paramsTable.clear();
      if (!parts.ok || (!parts.scheme && !parts.host && !parts.query)) {
        partsCard.hidden = true;
        return;
      }
      partsCard.hidden = false;
      if (parts.scheme) outRow(partsBox, 'Scheme').set(parts.scheme);
      if (parts.userinfo) outRow(partsBox, 'User info').set(parts.userinfo, 'warn');
      if (parts.host) outRow(partsBox, 'Host').set(parts.host);
      if (parts.port) outRow(partsBox, 'Port').set(parts.port);
      if (parts.path) outRow(partsBox, 'Path').set(parts.path);
      if (parts.fragment) outRow(partsBox, 'Fragment').set(parts.fragment);
      parts.params.forEach(function (p) { paramsTable.row([p.key, p.value]); });
    }

    on(mode, 'change', update);
    on(input, 'input', update);
    update();
    return { update: update, input: input, mode: mode };
  }
});

TOOLS.push({
  id: 'regex',
  name: 'Regex Tester',
  blurb: 'Matches, groups and replacements',
  keywords: 'regex regexp regular expression match groups capture replace pattern grep',
  build: function (root) {
    var pattern = field(root, 'Pattern', { placeholder: '(?<key>[A-Z_]+)=(.*)', value: '(?<key>[A-Z_]+)=(.*)' });
    var flagRow = optionRow(root);
    var flags = {};
    [['g', 'global'], ['i', 'ignore case'], ['m', 'multiline'], ['s', 'dot matches newline'], ['u', 'unicode']].forEach(function (f) {
      flags[f[0]] = toggle(flagRow, f[0] + ' - ' + f[1], f[0] === 'g', update);
    });
    var subject = field(root, 'Test text', {
      tag: 'textarea',
      rows: 5,
      value: 'DB_HOST=db.internal\nDB_PORT=5432\n# comment\nAPI_KEY=xyz'
    });
    var replacement = field(root, 'Replacement (optional, $1 or $<name>)', { placeholder: '$<key>' });

    var tools = buttonRow(root);
    pasteButton(tools, subject, function () { update(); }, 'Paste test text');
    pasteButton(tools, pattern, function () { update(); }, 'Paste pattern');
    button(tools, 'Clear text', function () { subject.value = ''; update(); });
    examples(root, [
      { label: 'Env var', value: '(?<key>[A-Z_]+)=(.*)' },
      { label: 'IPv4', value: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b' },
      { label: 'ISO date', value: '\\d{4}-\\d{2}-\\d{2}T[\\d:]+(?:\\.\\d+)?Z?' },
      { label: 'Log level', value: '^(?<level>ERROR|WARN|INFO|DEBUG)\\s+(?<rest>.*)$' },
      { label: 'Image tag', value: '^(?<image>[\\w./-]+):(?<tag>[\\w.-]+)$' },
      { label: 'Email-ish', value: '[\\w.+-]+@[\\w-]+\\.[\\w.]+' }
    ], function (value) {
      pattern.value = value;
      update();
    });
    helpBlock(root, [
      'This is the JavaScript regular-expression engine - the same one as in Node, and close enough to PCRE for most patterns. Lookbehind and named groups both work.',
      'Named groups (?<name>...) are shown by name in the match table; otherwise groups are numbered.',
      'The flag toggles map to the usual letters: g finds every match, i ignores case, m makes ^ and $ match line ends, s lets . match a newline, u turns on full Unicode handling.',
      'Fill the replacement box to preview a substitution: $1 for a numbered group, $<name> for a named one, $& for the whole match.',
      'Everything runs in this tab, so a pattern that backtracks badly can freeze it. The text is capped at 200 000 characters and 500 matches.'
    ]);

    var err = messageBox(root, 'err');
    var summary = card(root, 'Result');
    var countRow = outRow(summary, 'Matches');
    var previewCard = card(root, 'Highlighted');
    var preview = outArea(previewCard);
    var replaceCard = card(root, 'After replacement');
    var replaceOut = outArea(replaceCard);
    copyButton(buttonRow(replaceCard), 'Copy', function () { return replaceOut.textContent; });
    var listCard = card(root, 'Matches');
    var list = table(listCard, ['#', 'At', 'Match', 'Groups']);
    noteLine(listCard, 'Everything runs in this tab, so a pattern that backtracks badly can freeze the page. The test text is capped at 200 000 characters and 500 matches.');

    function update() {
      var flagText = '';
      Object.keys(flags).forEach(function (f) { if (flags[f].checked) flagText += f; });
      var res = runRegex(pattern.value, flagText, subject.value || '');
      if (!res.ok) {
        err.set(res.error);
        countRow.set('-', 'bad');
        list.clear();
        clear(preview);
        replaceCard.hidden = true;
        return;
      }
      err.set('');
      countRow.set(res.count + (res.truncated ? ' (stopped at the limit)' : ''), res.count ? 'good' : '');

      clear(preview);
      regexSegments(subject.value || '', res.matches).forEach(function (seg) {
        add(preview, el('span', seg.hit ? 'hit' : '', seg.text));
      });

      list.clear();
      res.matches.slice(0, 200).forEach(function (m, i) {
        var groups = m.named.length
          ? m.named.map(function (g) { return g.name + '=' + (g.value === null ? '(none)' : g.value); }).join('  ')
          : m.groups.map(function (g) { return g.n + '=' + (g.value === null ? '(none)' : g.value); }).join('  ');
        list.row([String(i + 1), String(m.index), m.text, groups || '-']);
      });

      if ((replacement.value || '') === '') {
        replaceCard.hidden = true;
      } else {
        var rep = regexReplace(pattern.value, flagText, subject.value || '', replacement.value);
        replaceCard.hidden = false;
        replaceOut.textContent = rep.ok ? rep.out : '';
      }
    }

    on(pattern, 'input', update);
    on(subject, 'input', update);
    on(replacement, 'input', update);
    update();
    return { update: update, pattern: pattern, subject: subject };
  }
});

TOOLS.push({
  id: 'jwt',
  name: 'JWT Decoder',
  blurb: 'Header, claims and expiry',
  keywords: 'jwt jws token bearer claims exp iat header payload oauth oidc decode',
  build: function (root) {
    var input = field(root, 'Token', { tag: 'textarea', rows: 5, placeholder: 'eyJhbGciOi...' });
    var row = buttonRow(root);
    pasteButton(row, input, function () { update(); });
    button(row, 'Clear', function () { input.value = ''; update(); });
    examples(root, [
      { label: 'Signed HS256', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c' },
      { label: 'Expired', value: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImtleS0xIn0.eyJpc3MiOiJodHRwczovL2F1dGguZXhhbXBsZS5jb20iLCJzdWIiOiJzdmMtZGVwbG95ZXIiLCJhdWQiOiJhcGkiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTcwMDAwMzYwMCwic2NvcGUiOiJyZWFkOnBvZHMgd3JpdGU6cG9kcyJ9.c2lnbmF0dXJlLXBsYWNlaG9sZGVy' },
      { label: 'alg: none', value: 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJyb290In0.' },
      { label: 'With Bearer prefix', value: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c' }
    ], function (value) {
      input.value = value;
      update();
    });
    helpBlock(root, [
      'A JWT is three base64url segments: header, payload, signature. The first two are only encoded, not encrypted - anyone holding the token can read them, which is why a JWT is not a place for secrets.',
      'This decodes; it does not verify. Whether the signature is genuine can only be checked against the issuer key, which is not here.',
      'A leading "Bearer " and any stray whitespace are stripped, so you can paste straight from an Authorization header.',
      'exp, iat and nbf are shown as absolute times and as a relative reading, so "is this expired" is answerable at a glance.',
      'alg: none is flagged in red: it means the token carries no signature, and any service that accepts it is trusting unverified input.',
      'Five segments means a JWE - encrypted, and nothing can be read from it without the key.'
    ]);

    noteLine(root, 'The token is decoded in this tab and never sent anywhere. A JWT is signed, not encrypted: this shows what it says, and cannot tell you whether the signature is genuine.');

    var err = messageBox(root, 'err');
    var notes = messageBox(root, 'warnbox');
    var summary = card(root, 'Summary');
    var algRow = outRow(summary, 'Algorithm');
    var typRow = outRow(summary, 'Type');
    var kidRow = outRow(summary, 'Key id');
    var stateRow = outRow(summary, 'Status');
    var sigRow = outRow(summary, 'Signature');

    var headCard = card(root, 'Header');
    var headOut = outArea(headCard);
    var payloadCard = card(root, 'Payload');
    var payloadOut = outArea(payloadCard);
    copyButton(buttonRow(payloadCard), 'Copy payload', function () { return payloadOut.textContent; });
    var timeCard = card(root, 'Times');
    var times = table(timeCard, ['Claim', 'Value', 'When']);
    var claimCard = card(root, 'Claims');
    var claims = table(claimCard, ['Claim', 'Meaning', 'Value']);

    function setHidden(hidden) {
      summary.hidden = hidden;
      headCard.hidden = hidden;
      payloadCard.hidden = hidden;
      timeCard.hidden = hidden;
      claimCard.hidden = hidden;
    }

    function update() {
      if ((input.value || '').trim() === '') {
        err.set('');
        notes.set('');
        setHidden(true);
        return;
      }
      var res = decodeJwt(input.value);
      if (!res.ok) {
        err.set(res.error);
        notes.set('');
        setHidden(true);
        return;
      }
      err.set('');
      setHidden(false);
      algRow.set(res.alg, res.alg === 'none' ? 'bad' : '');
      typRow.set(res.typ || '(not set)');
      kidRow.set(res.kid || '(not set)');
      stateRow.set(res.expired ? 'expired' : 'not expired', res.expired ? 'bad' : 'good');
      sigRow.set(res.signature ? plural(res.signatureBytes, 'byte') + ', not verified here' : 'none present', res.signature ? 'warn' : 'bad');
      notes.set(res.notes.join('\n'));
      headOut.textContent = res.header;
      payloadOut.textContent = res.payload;
      times.clear();
      res.times.forEach(function (t) { times.row([t.claim + ' (' + t.label + ')', t.iso, t.relative]); });
      timeCard.hidden = res.times.length === 0;
      claims.clear();
      res.claims.forEach(function (c) { claims.row([c.key, c.label || '-', c.value]); });
    }

    on(input, 'input', update);
    update();
    return { update: update, input: input };
  }
});
