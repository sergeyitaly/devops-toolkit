
TOOLS.push({
  id: 'time',
  name: 'Unix Timestamp',
  blurb: 'Epoch to date, and back',
  keywords: 'unix timestamp epoch time date iso 8601 utc local milliseconds seconds convert clock',
  build: function (root) {
    var nowCard = card(root, 'Right now');
    var nowSec = outRow(nowCard, 'Epoch seconds');
    var nowMs = outRow(nowCard, 'Epoch milliseconds');
    var nowIso = outRow(nowCard, 'ISO 8601 UTC');

    var input = field(root, 'Timestamp or date', { placeholder: '1700000000 or 2024-03-01T12:00:00Z', value: '1700000000' });
    var unit = selectField(root, 'Read a plain number as', [
      { value: 'auto', text: 'Detect from its length' },
      { value: 'seconds', text: 'Seconds' },
      { value: 'milliseconds', text: 'Milliseconds' },
      { value: 'microseconds', text: 'Microseconds' },
      { value: 'nanoseconds', text: 'Nanoseconds' }
    ], 'auto');
    var row = buttonRow(root);
    button(row, 'Now', function () { input.value = String(Math.floor(Date.now() / 1000)); update(); }, 'primary');
    button(row, 'Start of today (UTC)', function () {
      var d = new Date();
      input.value = String(Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000));
      update();
    });
    pasteButton(row, input, function () { update(); });

    examples(root, [
      { label: 'Seconds', value: '1700000000' },
      { label: 'Milliseconds', value: '1700000000000' },
      { label: 'Nanoseconds', value: '1700000000000000000' },
      { label: 'ISO 8601', value: '2024-03-01T12:00:00Z' },
      { label: 'Log date', value: '2024-03-01 12:00:00 GMT' },
      { label: 'Kubernetes', value: '2024-03-01T12:00:00.123456789Z' }
    ], function (value) {
      input.value = value;
      update();
    });
    helpBlock(root, [
      'A plain number is read as an epoch value, and the unit is guessed from how many digits it has: ten means seconds, thirteen means milliseconds, and so on up to nanoseconds. The result says which reading was used.',
      'If the guess is wrong - a very old or very distant timestamp - force the unit with the selector.',
      'Anything that is not a plain number is handed to the browser date parser. ISO 8601 always works; other formats depend on the browser.',
      'Local time uses this device time zone, and the offset row says which one that is. Everything else is UTC.',
      'The clock at the top keeps running while this tool is open, so you can grab "now" in either unit.'
    ]);

    var err = messageBox(root, 'err');
    var outCard = card(root, 'That moment');
    var readAs = outRow(outCard, 'Read as');
    var iso = outRow(outCard, 'ISO 8601 UTC');
    var utc = outRow(outCard, 'UTC');
    var local = outRow(outCard, 'Local time');
    var offset = outRow(outCard, 'Your offset');
    var relative = outRow(outCard, 'Relative');
    var secs = outRow(outCard, 'Epoch seconds');
    var millis = outRow(outCard, 'Epoch milliseconds');
    var extra = outRow(outCard, 'Day');

    function update() {
      var parsed = parseTimeInput(input.value, unit.value);
      if (!parsed.ok) {
        err.set(parsed.error);
        outCard.hidden = true;
        return;
      }
      err.set('');
      outCard.hidden = false;
      var t = timeInfo(parsed.ms);
      readAs.set(parsed.source === 'epoch' ? 'a number in ' + parsed.unit : 'a date string');
      iso.set(t.iso, 'accent');
      utc.set(t.utc);
      local.set(t.local);
      offset.set(t.offset);
      relative.set(t.relative, 'good');
      secs.set(String(t.seconds));
      millis.set(String(t.millis));
      extra.set(t.weekday + ', day ' + t.dayOfYear + ' of ' + t.iso.slice(0, 4));
    }

    function tick() {
      var ms = Date.now();
      nowSec.set(String(Math.floor(ms / 1000)), 'accent');
      nowMs.set(String(ms));
      nowIso.set(new Date(ms).toISOString());
    }

    on(input, 'input', update);
    on(unit, 'change', update);
    tick();
    update();

    var timer = null;
    return {
      update: update,
      input: input,
      show: function () {
        tick();
        if (timer === null) timer = setInterval(tick, 1000);
      },
      hide: function () {
        if (timer !== null) { clearInterval(timer); timer = null; }
      }
    };
  }
});

TOOLS.push({
  id: 'uuid',
  name: 'UUID Generator',
  blurb: 'Random v4 and time-ordered v7',
  keywords: 'uuid guid v4 v7 identifier random generate inspect nil unique id',
  build: function (root) {
    var row0 = add(root, el('div', 'inline'));
    var version = selectField(row0, 'Version', [
      { value: '4', text: 'v4 - random' },
      { value: '7', text: 'v7 - time-ordered' }
    ], '4');
    var count = field(row0, 'How many', { type: 'number', value: 5, min: 1, max: 500, inputmode: 'numeric' });

    var err = messageBox(root, 'err');
    var outCard = card(root, 'Generated');
    var out = outArea(outCard);
    var row = buttonRow(outCard);
    button(row, 'Generate', generate, 'primary');
    copyButton(row, 'Copy all', function () { return out.textContent; });
    noteLine(outCard, 'v4 is 122 random bits from crypto.getRandomValues. v7 puts the creation time in the first 48 bits, so ids sort by age - useful as a database key, and a reason not to use it where the time should stay private.');

    helpBlock(root, [
      'v4 is 122 random bits: use it when an id must reveal nothing at all.',
      'v7 starts with the creation time in milliseconds, so ids sort in the order they were made. That makes them far kinder to a database index than v4 - and means they leak when the record was created.',
      'The count is capped at 500 per press.',
      'The inspector below reads any UUID: version, variant, and for v1 and v7 the time it was created.',
      'Everything is generated with crypto.getRandomValues in this tab. If a browser cannot provide it, the tool says so rather than falling back to something weaker.'
    ]);

    var inspectCard = card(root, 'Inspect a UUID');
    var inspectInput = field(inspectCard, 'Paste one', { placeholder: '018f5e2a-7c3d-7b91-a3e8-9f2c4d5b6a70' });
    var inspectTools = buttonRow(inspectCard);
    pasteButton(inspectTools, inspectInput, function () { inspect(); });
    examples(inspectCard, [
      { label: 'v4', value: '9f1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d' },
      { label: 'v7', value: '018f5e2a-7c3d-7b91-a3e8-9f2c4d5b6a70' },
      { label: 'v1', value: '8c8f4a2e-1a3b-11ef-9c5a-0242ac120002' },
      { label: 'nil', value: '00000000-0000-0000-0000-000000000000' }
    ], function (value) {
      inspectInput.value = value;
      inspect();
    });
    var iErr = messageBox(inspectCard, 'err');
    var vRow = outRow(inspectCard, 'Version');
    var varRow = outRow(inspectCard, 'Variant');
    var tRow = outRow(inspectCard, 'Created');
    var cRow = outRow(inspectCard, 'Canonical');

    function generate() {
      try {
        var n = Math.max(1, Math.min(500, parseInt(count.value, 10) || 1));
        out.textContent = generateUuids(parseInt(version.value, 10), n).join('\n');
        err.set('');
      } catch (e) {
        err.set(e.message);
        out.textContent = '';
      }
    }

    function inspect() {
      if ((inspectInput.value || '').trim() === '') {
        iErr.set('');
        [vRow, varRow, tRow, cRow].forEach(function (r) { r.hide(); });
        return;
      }
      var res = inspectUuid(inspectInput.value);
      if (!res.ok) {
        iErr.set(res.error);
        [vRow, varRow, tRow, cRow].forEach(function (r) { r.hide(); });
        return;
      }
      iErr.set('');
      vRow.set(res.nil ? 'nil UUID (all zeros)' : (res.max ? 'max UUID (all ones)' : 'v' + res.version));
      varRow.set(res.variant);
      cRow.set(res.canonical);
      if (res.timestamp) tRow.set(res.timestamp + ' - ' + res.timestampNote, 'warn');
      else tRow.hide();
    }

    on(version, 'change', generate);
    on(count, 'input', generate);
    on(inspectInput, 'input', inspect);
    generate();
    inspect();
    return { generate: generate, inspect: inspect, out: out, inspectInput: inspectInput };
  }
});

TOOLS.push({
  id: 'password',
  name: 'Password Generator',
  blurb: 'Random secrets with an entropy figure',
  keywords: 'password secret generate random entropy passphrase credentials strong token',
  build: function (root) {
    var length = field(root, 'Length', { type: 'number', value: 24, min: 4, max: 256, inputmode: 'numeric' });
    var opts = optionRow(root);
    var lower = toggle(opts, 'a-z', true, generate);
    var upper = toggle(opts, 'A-Z', true, generate);
    var digits = toggle(opts, '0-9', true, generate);
    var symbols = toggle(opts, 'symbols', true, generate);
    var noAmbiguous = toggle(opts, 'no Il1O0o', false, generate);

    var PRESETS = {
      'Service credential': { length: 32, lower: true, upper: true, digits: true, symbols: true, noAmbiguous: false },
      'Account password': { length: 20, lower: true, upper: true, digits: true, symbols: true, noAmbiguous: true },
      'Read it aloud': { length: 24, lower: true, upper: true, digits: true, symbols: false, noAmbiguous: true },
      'Hex-ish key': { length: 40, lower: true, upper: false, digits: true, symbols: false, noAmbiguous: false },
      'Numeric PIN': { length: 8, lower: false, upper: false, digits: true, symbols: false, noAmbiguous: false }
    };
    examples(root, Object.keys(PRESETS), function (name) {
      var preset = PRESETS[name];
      length.value = String(preset.length);
      [[lower, 'lower'], [upper, 'upper'], [digits, 'digits'], [symbols, 'symbols'], [noAmbiguous, 'noAmbiguous']].forEach(function (pair) {
        pair[0].checked = preset[pair[1]];
        /* the chip styling follows the checkbox, which a programmatic change
           does not do on its own */
        if (pair[0].parentNode) pair[0].parentNode.className = 'chk' + (pair[0].checked ? ' on' : '');
      });
      generate();
    });
    helpBlock(root, [
      'Entropy is counted the honest way: an attacker who knows exactly which settings were used still needs that many bits of guessing. It is log2(alphabet size) multiplied by the length.',
      'As a rule of thumb, under 40 bits is a throwaway, 60 is acceptable behind rate limiting and MFA, and 80 or more belongs on anything unattended - a service credential, a signing key, a root account.',
      'Every selected character set is guaranteed to appear at least once. That is done by generating again until the policy is met, not by patching characters into fixed positions, which would make the result less random than it looks.',
      '"no Il1O0o" drops the characters people misread when a password has to be typed from a screen or read down a phone line.',
      'Nothing is stored or transmitted. Close the tab and the password is gone - copy it somewhere safe first.'
    ]);

    var err = messageBox(root, 'err');
    var outCard = card(root, 'Password');
    var main = outRow(outCard, 'Generated');
    var bits = outRow(outCard, 'Entropy');
    var strength = outRow(outCard, 'Verdict');
    var alphabet = outRow(outCard, 'Alphabet');
    var row = buttonRow(outCard);
    button(row, 'Generate', generate, 'primary');
    copyButton(row, 'Copy', function () { return main.node.textContent; });

    var moreCard = card(root, 'A few more');
    var more = outArea(moreCard);
    copyButton(buttonRow(moreCard), 'Copy all', function () { return more.textContent; });

    noteLine(root, 'Generated here with crypto.getRandomValues and never sent anywhere. Entropy assumes an attacker knows the exact settings used, which is the honest way to count it.');

    function options() {
      return {
        length: parseInt(length.value, 10) || 24,
        lower: lower.checked,
        upper: upper.checked,
        digits: digits.checked,
        symbols: symbols.checked,
        noAmbiguous: noAmbiguous.checked
      };
    }

    function generate() {
      var opt = options(), res, i, list = [];
      try {
        res = generatePassword(opt);
      } catch (e) {
        err.set(e.message);
        return;
      }
      if (!res.ok) {
        err.set(res.error);
        outCard.hidden = true;
        moreCard.hidden = true;
        return;
      }
      err.set('');
      outCard.hidden = false;
      moreCard.hidden = false;
      main.set(res.password, 'accent');
      bits.set(res.bits + ' bits');
      strength.set(res.strength, res.bits >= 60 ? 'good' : 'warn');
      alphabet.set(res.alphabetSize + ' characters to choose from');
      for (i = 0; i < 5; i++) list.push(generatePassword(opt).password);
      more.textContent = list.join('\n');
    }

    on(length, 'input', generate);
    generate();
    return { generate: generate, length: length, main: main };
  }
});

TOOLS.push({
  id: 'hash',
  name: 'Hash Calculator',
  blurb: 'MD5, SHA-1 and SHA-256',
  keywords: 'hash md5 sha1 sha256 checksum digest fingerprint sum verify integrity',
  build: function (root) {
    var input = field(root, 'Text', { tag: 'textarea', rows: 5, placeholder: 'Anything you want the checksums of' });
    var opts = optionRow(root);
    var upper = toggle(opts, 'UPPERCASE', false, update);

    var tools = buttonRow(root);
    pasteButton(tools, input, function () { update(); });
    button(tools, 'Clear', function () { input.value = ''; update(); });
    examples(root, [
      { label: 'Short text', value: 'The quick brown fox jumps over the lazy dog' },
      { label: 'Empty string', value: '' },
      { label: 'Config line', value: 'server.port=8443' },
      { label: 'Non-ASCII', value: 'привіт, світ' }
    ], function (value) {
      input.value = value;
      update();
    });
    helpBlock(root, [
      'The three checksums are computed over the UTF-8 bytes of the text, which is what sha256sum and md5sum do to a file containing that text - without the trailing newline a shell here-string would add.',
      'Paste a checksum into the compare box and it tells you which of the three it matches, if any. Useful for checking a published artefact digest without trusting your own eyes on 64 hex characters.',
      'MD5 and SHA-1 are kept because artefact checksums, old Git object ids and plenty of vendor documentation still use them.',
      'Neither is safe where an attacker chooses the input: collisions are practical for MD5 and demonstrated for SHA-1. Use SHA-256 for anything security-relevant.',
      'This is all done in the tab: nothing you paste is sent anywhere.'
    ]);

    var outCard = card(root, 'Checksums');
    var md5Row = outRow(outCard, 'MD5');
    var sha1Row = outRow(outCard, 'SHA-1');
    var sha256Row = outRow(outCard, 'SHA-256');
    var sizeRow = outRow(outCard, 'Input size');

    var compareCard = card(root, 'Compare');
    var expected = field(compareCard, 'Paste a checksum to check against', { placeholder: '9e107d9d372bb6826bd81d3542a419d6' });
    var verdict = outRow(compareCard, 'Result');

    noteLine(root, 'MD5 and SHA-1 are here for artefact checksums and old Git object ids. Both are broken for anything where an attacker chooses the input - use SHA-256 for signatures and integrity that matters.');

    var current = { md5: '', sha1: '', sha256: '' };

    function update() {
      var bytes = utf8Encode(input.value || '');
      current = hashAll(bytes);
      var show = function (v) { return upper.checked ? v.toUpperCase() : v; };
      md5Row.set(show(current.md5));
      sha1Row.set(show(current.sha1));
      sha256Row.set(show(current.sha256), 'accent');
      sizeRow.set(plural(bytes.length, 'byte') + ' (' + formatSize(bytes.length) + ')');
      compare();
    }

    function compare() {
      var want = (expected.value || '').trim().toLowerCase().replace(/[^0-9a-f]/g, '');
      if (want === '') {
        verdict.set('Paste a checksum above to compare.');
        return;
      }
      var name = want === current.md5 ? 'MD5' : (want === current.sha1 ? 'SHA-1' : (want === current.sha256 ? 'SHA-256' : ''));
      if (name) verdict.set('Matches the ' + name + ' of the text above.', 'good');
      else verdict.set('No match with any of the three checksums above.', 'bad');
    }

    on(input, 'input', update);
    on(expected, 'input', compare);
    update();
    return { update: update, input: input, rows: { md5: md5Row, sha1: sha1Row, sha256: sha256Row } };
  }
});
