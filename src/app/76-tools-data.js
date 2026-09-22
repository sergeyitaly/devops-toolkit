
TOOLS.push({
  id: 'json',
  name: 'JSON Formatter',
  blurb: 'Pretty-print, minify, find the error',
  keywords: 'json format pretty print minify validate parse sort keys indent lint',
  build: function (root) {
    var input = field(root, 'JSON', { tag: 'textarea', rows: 7, placeholder: '{"name":"web","replicas":3}' });
    var row0 = add(root, el('div', 'inline'));
    var indent = selectField(row0, 'Indent', [
      { value: '2', text: '2 spaces' },
      { value: '4', text: '4 spaces' },
      { value: 'tab', text: 'Tab' }
    ], '2');
    var opts = optionRow(root);
    var sortKeys = toggle(opts, 'Sort keys', false, function () { render(lastMode); });

    var row = buttonRow(root);
    button(row, 'Format', function () { render('format'); }, 'primary');
    button(row, 'Minify', function () { render('minify'); });
    pasteButton(row, input, function () { render(lastMode); });
    button(row, 'Clear', function () { input.value = ''; render('format'); });

    examples(root, [
      { label: 'Service manifest', value: '{"apiVersion":"v1","kind":"Service","metadata":{"name":"web","labels":{"app":"web"}},"spec":{"ports":[{"port":80,"targetPort":8080}],"selector":{"app":"web"}}}' },
      { label: 'Nested config', value: '{"logging":{"level":"info","sinks":[{"type":"stdout"},{"type":"file","path":"/var/log/app.log","rotate":{"size":"100MB","keep":7}}]},"features":{"beta":false}}' },
      { label: 'Array of records', value: '[{"host":"db-1","role":"primary","lag":0},{"host":"db-2","role":"replica","lag":1.4},{"host":"db-3","role":"replica","lag":12.9}]' },
      { label: 'Broken JSON', value: '{\n  "name": "web",\n  "ports": [80, 443,],\n  "tls": true\n}' }
    ], function (value) {
      input.value = value;
      render('format');
    });
    helpBlock(root, [
      'It reformats as you type; the Format and Minify buttons pick which shape you get.',
      'When the JSON will not parse, the error names a line and a column and prints that line with a caret under the offending character - including the cases the browser message is vague about, such as a trailing comma or single-quoted keys.',
      'Sort keys reorders every object alphabetically, all the way down. Handy for diffing two configurations that differ only in key order.',
      'Structure counts the keys, the nesting depth and the objects and arrays, which is a quick way to see whether a payload is what you expected.',
      '"Use as input" feeds the output back in, so you can minify what you just formatted.'
    ]);

    var err = messageBox(root, 'err');
    var outCard = card(root, 'Output');
    var out = outArea(outCard);
    var outRowButtons = buttonRow(outCard);
    copyButton(outRowButtons, 'Copy', function () { return out.textContent; });
    button(outRowButtons, 'Use as input', function () { input.value = out.textContent; render(lastMode); });

    var statsCard = card(root, 'Structure');
    var keysRow = outRow(statsCard, 'Keys');
    var depthRow = outRow(statsCard, 'Deepest nesting');
    var shapeRow = outRow(statsCard, 'Objects and arrays');
    var sizeRow = outRow(statsCard, 'Size');

    var lastMode = 'format';

    function render(mode) {
      lastMode = mode || 'format';
      if ((input.value || '').trim() === '') {
        err.set('');
        out.textContent = '';
        statsCard.hidden = true;
        return;
      }
      var width = lastMode === 'minify' ? 0 : (indent.value === 'tab' ? '\t' : parseInt(indent.value, 10));
      var res = formatJson(input.value, width, sortKeys.checked);
      if (!res.ok) {
        err.set(res.error + (res.excerpt ? '\n\n' + res.excerpt : ''));
        out.textContent = '';
        statsCard.hidden = true;
        return;
      }
      err.set('');
      statsCard.hidden = false;
      out.textContent = res.out;
      keysRow.set(groupDigits(res.stats.keys));
      depthRow.set(res.stats.depth + ' levels');
      shapeRow.set(res.stats.objects + ' objects, ' + res.stats.arrays + ' arrays');
      sizeRow.set(formatSize(res.inputBytes) + ' in, ' + formatSize(res.outputBytes) + ' out');
    }

    on(input, 'input', function () { render(lastMode); });
    on(indent, 'change', function () { render(lastMode); });
    render('format');
    return { render: render, input: input, out: out };
  }
});

TOOLS.push({
  id: 'yaml',
  name: 'YAML Validator',
  blurb: 'Errors by line, and the JSON it means',
  keywords: 'yaml yml validate lint parse kubernetes manifest compose pipeline indentation duplicate keys json',
  build: function (root) {
    var input = field(root, 'YAML', {
      tag: 'textarea',
      rows: 9,
      placeholder: 'apiVersion: apps/v1\nkind: Deployment'
    });
    var row = buttonRow(root);
    pasteButton(row, input, function () { update(); });
    button(row, 'Clear', function () { input.value = ''; update(); });

    examples(root, [
      { label: 'Kubernetes', value: 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  replicas: 3\n  template:\n    spec:\n      containers:\n        - name: nginx\n          image: nginx:1.25\n          ports:\n            - containerPort: 80\n' },
      { label: 'Compose', value: 'services:\n  web:\n    image: nginx:1.25\n    ports:\n      - "8080:80"\n    environment:\n      - NGINX_HOST=example.com\n    depends_on:\n      - db\n  db:\n    image: postgres:16\n    volumes:\n      - pgdata:/var/lib/postgresql/data\nvolumes:\n  pgdata:\n' },
      { label: 'CI workflow', value: 'name: CI\non:\n  push:\n    branches: [main]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test\n' },
      { label: 'The traps', value: 'enabled: no\nversion: 3.10\nmode: 0755\nname: web\nname: api\n' },
      { label: 'Broken indent', value: 'metadata:\n  name: web\n   labels:\n    app: web\n' }
    ], function (value) {
      input.value = value;
      update();
    });
    helpBlock(root, [
      'It validates as you type and shows the JSON the document actually means, which is the quickest way to see whether a value is the string you intended or something the parser reinterpreted.',
      'Errors carry a line number: tab indentation, a duplicate key (with the line the key was first set on), a value that is not "key: value", an unclosed quote, a line indented more than the block it belongs to.',
      'Warnings are the traps that survive validation and bite in production: "no" and "yes" read as booleans by YAML 1.1 tooling, "3.10" losing its trailing zero because it is a number, "0755" read as octal, and so on. Quoting fixes all of them.',
      'Multiple documents separated by --- are all parsed, and the count is reported.',
      'Supported: block mappings and sequences, flow collections, single and double quoted scalars, literal and folded block scalars, comments. Not supported, and reported rather than guessed at: anchors, aliases, explicit tags and complex keys.'
    ]);

    var status = messageBox(root, 'okbox');
    var err = messageBox(root, 'err');
    var warn = messageBox(root, 'warnbox');

    var jsonCard = card(root, 'As JSON');
    var jsonOut = outArea(jsonCard);
    copyButton(buttonRow(jsonCard), 'Copy JSON', function () { return jsonOut.textContent; });

    noteLine(root, 'Checked here, offline. This validator covers block mappings and sequences, flow collections, quoted and block scalars, comments and multiple documents. Anchors, aliases and explicit tags are reported as unsupported rather than guessed at.');

    function update() {
      if ((input.value || '').trim() === '') {
        status.set('');
        err.set('');
        warn.set('');
        jsonCard.hidden = true;
        return;
      }
      var res = validateYaml(input.value);
      jsonCard.hidden = !res.json;
      jsonOut.textContent = res.json || '';
      if (res.ok) {
        status.set('Valid YAML' + (res.documents > 1 ? ' - ' + res.documents + ' documents' : '') + '.');
        err.set('');
      } else {
        status.set('');
        err.set(res.errors.map(function (e) { return 'Line ' + e.line + ': ' + e.message; }).join('\n\n'));
      }
      warn.set(res.warnings.length
        ? res.warnings.map(function (w) { return 'Line ' + w.line + ': ' + w.message; }).join('\n\n')
        : '');
    }

    on(input, 'input', update);
    update();
    return { update: update, input: input, jsonOut: jsonOut };
  }
});
