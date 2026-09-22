
/* ------------------------------------------------------------------ *
 * JSON, YAML and regular expressions.
 * ------------------------------------------------------------------ */

function lineColOf(text, index) {
  var upto = text.slice(0, index);
  var line = upto.split('\n').length;
  var col = index - (upto.lastIndexOf('\n') + 1) + 1;
  return { line: line, col: col };
}

function excerptAt(text, line, col) {
  var lines = text.split('\n');
  var src = lines[line - 1] || '';
  if (src.length > 160) src = src.slice(0, 160) + '...';
  return src + '\n' + new Array(Math.max(1, col)).join(' ') + '^';
}

function jsonStats(value) {
  var keys = 0, arrays = 0, objects = 0, depth = 0, nodes = 0;
  function walk(v, d) {
    nodes++;
    if (d > depth) depth = d;
    if (Array.isArray(v)) {
      arrays++;
      v.forEach(function (item) { walk(item, d + 1); });
    } else if (v && typeof v === 'object') {
      objects++;
      Object.keys(v).forEach(function (k) { keys++; walk(v[k], d + 1); });
    }
  }
  walk(value, 1);
  return { keys: keys, arrays: arrays, objects: objects, depth: depth, nodes: nodes };
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    var out = {};
    Object.keys(value).sort().forEach(function (k) { out[k] = sortDeep(value[k]); });
    return out;
  }
  return value;
}

/* JSON.parse reports the position of a syntax error in whichever way the
   engine of the day feels like - sometimes "at position 41", sometimes a
   quoted snippet with no position at all. Scanning the text here gives a
   line and column that are always there and a message worth reading. */
function findJsonError(src) {
  var i = 0, n = src.length, depth = 0;

  function ws() { while (i < n && ' \t\n\r'.indexOf(src.charAt(i)) >= 0) i++; }
  function fail(message, at) { return { index: typeof at === 'number' ? at : i, message: message }; }

  function string() {
    var start = i;
    i++;
    while (i < n) {
      var ch = src.charAt(i);
      if (ch === '"') { i++; return null; }
      if (ch === '\\') {
        i++;
        var esc = src.charAt(i);
        if ('"\\/bfnrt'.indexOf(esc) >= 0) { i++; continue; }
        if (esc === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(src.substr(i + 1, 4))) return fail('A \\u escape needs exactly four hexadecimal digits.');
          i += 5;
          continue;
        }
        return fail('Unknown escape "\\' + esc + '" in a string. JSON allows only \\" \\\\ \\/ \\b \\f \\n \\r \\t and \\uXXXX.');
      }
      if (ch === '\n') return fail('A string is never closed - it runs to the end of the line.', start);
      if (ch < ' ') return fail('A raw control character inside a string must be escaped.');
      i++;
    }
    return fail('A string is never closed.', start);
  }

  function number() {
    var start = i;
    if (src.charAt(i) === '-') i++;
    if (src.charAt(i) === '0') i++;
    else if (/[1-9]/.test(src.charAt(i))) { while (/[0-9]/.test(src.charAt(i))) i++; }
    else return fail('Not a valid number.', start);
    if (src.charAt(i) === '.') {
      i++;
      if (!/[0-9]/.test(src.charAt(i))) return fail('A decimal point must be followed by a digit.');
      while (/[0-9]/.test(src.charAt(i))) i++;
    }
    if (src.charAt(i) === 'e' || src.charAt(i) === 'E') {
      i++;
      if (src.charAt(i) === '+' || src.charAt(i) === '-') i++;
      if (!/[0-9]/.test(src.charAt(i))) return fail('An exponent must be followed by a digit.');
      while (/[0-9]/.test(src.charAt(i))) i++;
    }
    return null;
  }

  function literal(word) {
    if (src.substr(i, word.length) === word) { i += word.length; return null; }
    return fail('Unexpected ' + JSON.stringify(src.substr(i, 10)) + ' where a value was expected.');
  }

  function value() {
    ws();
    if (i >= n) return fail('The document ends where a value was expected.');
    if (++depth > 500) return fail('Nesting is deeper than this tool will follow.');
    var err = valueInner();
    depth--;
    return err;
  }

  function valueInner() {
    var ch = src.charAt(i), err;
    if (ch === '"') return string();
    if (ch === '-' || (ch >= '0' && ch <= '9')) return number();
    if (ch === 't') return literal('true');
    if (ch === 'f') return literal('false');
    if (ch === 'n') return literal('null');
    if (ch === '[') {
      i++;
      ws();
      if (src.charAt(i) === ']') { i++; return null; }
      for (;;) {
        ws();
        if (src.charAt(i) === ']') return fail('A trailing comma is not allowed in JSON.');
        err = value();
        if (err) return err;
        ws();
        if (src.charAt(i) === ',') { i++; continue; }
        if (src.charAt(i) === ']') { i++; return null; }
        if (i >= n) return fail('An array is never closed with "]".');
        return fail('Expected "," or "]" but found ' + JSON.stringify(src.charAt(i)) + '.');
      }
    }
    if (ch === '{') {
      i++;
      ws();
      if (src.charAt(i) === '}') { i++; return null; }
      for (;;) {
        ws();
        if (src.charAt(i) === '}') return fail('A trailing comma is not allowed in JSON.');
        if (src.charAt(i) === "'") return fail('JSON keys must be in double quotes, not single quotes.');
        if (src.charAt(i) !== '"') return fail('Expected a key in double quotes but found ' + JSON.stringify(src.charAt(i) || 'the end of the document') + '.');
        err = string();
        if (err) return err;
        ws();
        if (src.charAt(i) !== ':') return fail('Expected ":" after the key.');
        i++;
        err = value();
        if (err) return err;
        ws();
        if (src.charAt(i) === ',') { i++; continue; }
        if (src.charAt(i) === '}') { i++; return null; }
        if (i >= n) return fail('An object is never closed with "}".');
        return fail('Expected "," or "}" but found ' + JSON.stringify(src.charAt(i)) + '.');
      }
    }
    if (ch === "'") return fail('JSON strings must use double quotes.');
    return fail('Unexpected ' + JSON.stringify(src.substr(i, 10)) + ' where a value was expected.');
  }

  var topError = value();
  if (topError) return topError;
  ws();
  if (i < n) return fail('Unexpected text after the end of the JSON document.');
  return null;
}

function parseJsonText(text) {
  var src = String(text);
  if (src.trim() === '') return { ok: false, error: 'Nothing to parse.' };
  try {
    return { ok: true, value: JSON.parse(src) };
  } catch (e) {
    var out = { ok: false, error: e.message || String(e) };
    var found = findJsonError(src);
    if (found) {
      var pos = lineColOf(src, Math.min(found.index, src.length - 1));
      out.line = pos.line;
      out.col = pos.col;
      out.excerpt = excerptAt(src, pos.line, pos.col);
      out.error = found.message + ' (line ' + pos.line + ', column ' + pos.col + ')';
    }
    return out;
  }
}

function formatJson(text, indent, sortKeys) {
  var parsed = parseJsonText(text);
  if (!parsed.ok) return parsed;
  var value = sortKeys ? sortDeep(parsed.value) : parsed.value;
  var out = indent === 0 ? JSON.stringify(value) : JSON.stringify(value, null, indent);
  return {
    ok: true,
    out: out,
    stats: jsonStats(parsed.value),
    inputBytes: utf8Encode(String(text)).length,
    outputBytes: utf8Encode(out).length
  };
}

/* ------------------------------------------------------------------ *
 * YAML.
 *
 * A deliberate subset: block mappings and sequences, flow collections,
 * quoted and plain scalars, block scalars, multiple documents. Anchors,
 * aliases, tags and complex keys are reported rather than guessed at,
 * because a validator that silently mis-reads them is worse than one
 * that says it cannot read them.
 * ------------------------------------------------------------------ */

function yamlStripComment(text) {
  var i, ch, quote = null;
  for (i = 0; i < text.length; i++) {
    ch = text.charAt(i);
    if (quote) {
      if (ch === '\\' && quote === '"') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '#' && (i === 0 || /\s/.test(text.charAt(i - 1)))) return text.slice(0, i);
  }
  return text;
}

function yamlIndentOf(raw) {
  var i = 0;
  while (i < raw.length && raw.charAt(i) === ' ') i++;
  return i;
}

function yamlUnquote(text) {
  var q = text.charAt(0);
  var body = text.slice(1, -1);
  if (q === "'") return { ok: true, value: body.replace(/''/g, "'") };
  var out = '', i, ch, hex;
  for (i = 0; i < body.length; i++) {
    ch = body.charAt(i);
    if (ch !== '\\') { out += ch; continue; }
    i++;
    ch = body.charAt(i);
    if (ch === 'n') out += '\n';
    else if (ch === 't') out += '\t';
    else if (ch === 'r') out += '\r';
    else if (ch === '0') out += '\0';
    else if (ch === '\\') out += '\\';
    else if (ch === '"') out += '"';
    else if (ch === '/') out += '/';
    else if (ch === 'x' || ch === 'u') {
      var len = ch === 'x' ? 2 : 4;
      hex = body.substr(i + 1, len);
      if (!new RegExp('^[0-9a-fA-F]{' + len + '}$').test(hex)) return { ok: false, error: 'Bad \\' + ch + ' escape in a double-quoted string.' };
      out += String.fromCharCode(parseInt(hex, 16));
      i += len;
    } else return { ok: false, error: 'Unknown escape "\\' + ch + '" in a double-quoted string.' };
  }
  return { ok: true, value: out };
}

function yamlScalar(text, state, lineNo) {
  var s = text.trim();
  if (s === '' || s === '~' || /^(null|Null|NULL)$/.test(s)) return null;
  if (/^(true|True|TRUE)$/.test(s)) return true;
  if (/^(false|False|FALSE)$/.test(s)) return false;
  if (/^(yes|Yes|YES|no|No|NO|on|On|ON|off|Off|OFF)$/.test(s)) {
    state.warn(lineNo, 'YAML 1.1 parsers (including some Kubernetes and Ansible tooling) read ' + JSON.stringify(s) + ' as a boolean, YAML 1.2 reads it as a string. Quote it to be sure.');
    return s;
  }
  if (/^[-+]?[0-9]+$/.test(s)) {
    if (/^[-+]?0[0-9]+$/.test(s)) {
      state.warn(lineNo, JSON.stringify(s) + ' has a leading zero: YAML 1.1 reads that as octal, so a file mode like 0755 changes value. Quote it.');
      return s;
    }
    return parseInt(s, 10);
  }
  if (/^0x[0-9a-fA-F]+$/.test(s)) return parseInt(s, 16);
  if (/^0o[0-7]+$/.test(s)) return parseInt(s.slice(2), 8);
  if (/^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/.test(s)) {
    if (/^[0-9]+\.[0-9]*0$/.test(s)) {
      state.warn(lineNo, JSON.stringify(s) + ' is a number, so the trailing zero is lost (it becomes ' + parseFloat(s) + '). If it is a version, quote it.');
    }
    return parseFloat(s);
  }
  if (/^[-+]?\.(inf|Inf|INF)$/.test(s)) return s.charAt(0) === '-' ? -Infinity : Infinity;
  if (/^\.(nan|NaN|NAN)$/.test(s)) return NaN;
  return s;
}

/* A small recursive-descent reader for [a, b] and {k: v} */
function yamlFlow(text, state, lineNo) {
  var i = 0;

  function ws() { while (i < text.length && /\s/.test(text.charAt(i))) i++; }

  function readQuoted() {
    var q = text.charAt(i), start = i;
    i++;
    while (i < text.length) {
      if (q === '"' && text.charAt(i) === '\\') { i += 2; continue; }
      if (text.charAt(i) === q) {
        if (q === "'" && text.charAt(i + 1) === "'") { i += 2; continue; }
        i++;
        var un = yamlUnquote(text.slice(start, i));
        if (!un.ok) { state.err(lineNo, un.error); return ''; }
        return un.value;
      }
      i++;
    }
    state.err(lineNo, 'A quoted string is never closed.');
    return text.slice(start + 1);
  }

  function readPlain(stoppers) {
    var start = i;
    while (i < text.length && stoppers.indexOf(text.charAt(i)) < 0) i++;
    return yamlScalar(text.slice(start, i), state, lineNo);
  }

  function value() {
    ws();
    var ch = text.charAt(i);
    if (ch === '[') {
      i++;
      var arr = [];
      ws();
      if (text.charAt(i) === ']') { i++; return arr; }
      for (;;) {
        arr.push(value());
        ws();
        if (text.charAt(i) === ',') { i++; ws(); if (text.charAt(i) === ']') { i++; return arr; } continue; }
        if (text.charAt(i) === ']') { i++; return arr; }
        state.err(lineNo, 'Expected "," or "]" in a flow sequence.');
        return arr;
      }
    }
    if (ch === '{') {
      i++;
      var map = {};
      ws();
      if (text.charAt(i) === '}') { i++; return map; }
      for (;;) {
        ws();
        var key = (text.charAt(i) === '"' || text.charAt(i) === "'") ? readQuoted() : readPlain(':,}');
        ws();
        if (text.charAt(i) !== ':') { state.err(lineNo, 'Expected ":" after a key in a flow mapping.'); return map; }
        i++;
        map[String(key)] = value();
        ws();
        if (text.charAt(i) === ',') { i++; ws(); if (text.charAt(i) === '}') { i++; return map; } continue; }
        if (text.charAt(i) === '}') { i++; return map; }
        state.err(lineNo, 'Expected "," or "}" in a flow mapping.');
        return map;
      }
    }
    if (ch === '"' || ch === "'") return readQuoted();
    return readPlain(',]}');
  }

  var out = value();
  ws();
  if (i < text.length) state.err(lineNo, 'Unexpected text after the end of a flow collection: ' + JSON.stringify(text.slice(i)));
  return out;
}

function yamlSplitKey(text) {
  var i = 0, ch, quote = null, depth = 0;
  if (text.charAt(0) === '"' || text.charAt(0) === "'") {
    quote = text.charAt(0);
    i = 1;
    while (i < text.length) {
      if (quote === '"' && text.charAt(i) === '\\') { i += 2; continue; }
      if (text.charAt(i) === quote) {
        if (quote === "'" && text.charAt(i + 1) === "'") { i += 2; continue; }
        i++;
        break;
      }
      i++;
    }
    if (text.charAt(i) !== ':') return null;
    var un = yamlUnquote(text.slice(0, i));
    return { key: un.ok ? un.value : text.slice(1, i - 1), rest: text.slice(i + 1).trim(), error: un.ok ? '' : un.error };
  }
  for (i = 0; i < text.length; i++) {
    ch = text.charAt(i);
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth--;
    else if (ch === ':' && depth === 0 && (i + 1 >= text.length || text.charAt(i + 1) === ' ')) {
      return { key: text.slice(0, i).trim(), rest: text.slice(i + 1).trim(), error: '' };
    }
  }
  return null;
}

function parseYaml(text) {
  var src = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  var lines = src.split('\n');
  var errors = [], warnings = [], i;

  var state = {
    err: function (line, message) {
      if (errors.length < 50) errors.push({ line: line, message: message });
    },
    warn: function (line, message) {
      for (var w = 0; w < warnings.length; w++) {
        if (warnings[w].line === line && warnings[w].message === message) return;
      }
      if (warnings.length < 50) warnings.push({ line: line, message: message });
    }
  };

  for (i = 0; i < lines.length; i++) {
    if (/^[ ]*\t/.test(lines[i])) {
      state.err(i + 1, 'A tab is used for indentation. YAML forbids tabs there - use spaces.');
    }
  }

  var pos = 0;

  function info(n) {
    var raw = lines[n];
    if (raw === undefined) return null;
    var text = yamlStripComment(raw).replace(/\s+$/, '');
    return { raw: raw, indent: yamlIndentOf(raw), text: text, body: text.trim(), n: n };
  }

  function skipBlank() {
    while (pos < lines.length) {
      var it = info(pos);
      if (it.body === '') pos++;
      else return;
    }
  }

  function atDocBoundary() {
    var it = info(pos);
    return it && (it.body === '---' || it.body === '...' || /^---\s/.test(it.text));
  }

  function unsupported(body, lineNo) {
    if (/^[&*]/.test(body)) {
      state.err(lineNo, 'Anchors and aliases (& and *) are not supported by this validator, so the document was not fully checked.');
      return true;
    }
    if (/^!/.test(body)) {
      state.err(lineNo, 'Explicit tags (!, !!) are not supported by this validator, so the document was not fully checked.');
      return true;
    }
    if (/^\?\s/.test(body)) {
      state.err(lineNo, 'Complex mapping keys ("? key") are not supported by this validator.');
      return true;
    }
    return false;
  }

  function blockScalar(header, parentIndent, lineNo) {
    var style = header.charAt(0);
    var rest = header.slice(1);
    var chomp = /[-+]/.test(rest) ? rest.replace(/[^-+]/g, '') : '';
    var explicit = /[0-9]/.test(rest) ? parseInt(rest.replace(/[^0-9]/g, ''), 10) : 0;
    if (!/^[-+0-9]*$/.test(rest)) {
      state.err(lineNo, 'Unexpected text after a block scalar indicator: ' + JSON.stringify(rest));
    }
    var content = [], baseIndent = explicit ? parentIndent + explicit : -1, it;
    while (pos < lines.length) {
      it = info(pos);
      if (it.raw.trim() === '') { content.push(''); pos++; continue; }
      if (it.indent <= parentIndent) break;
      if (baseIndent < 0) baseIndent = it.indent;
      if (it.indent < baseIndent) break;
      content.push(it.raw.slice(baseIndent));
      pos++;
    }
    while (content.length && content[content.length - 1] === '') content.pop();
    var out;
    if (style === '|') out = content.join('\n');
    else {
      var folded = [], k;
      for (k = 0; k < content.length; k++) {
        if (content[k] === '') folded.push('\n');
        else if (k > 0 && content[k - 1] !== '' && folded.length) folded[folded.length - 1] += ' ' + content[k];
        else folded.push(content[k]);
      }
      out = folded.join('');
    }
    if (chomp === '-') return out;
    if (chomp === '+') return out + '\n';
    return content.length ? out + '\n' : out;
  }

  function parseValue(rest, indent, lineNo) {
    if (rest === '') {
      pos++;
      var nested = parseNode(indent + 1);
      return nested === undefined ? null : nested;
    }
    if (rest.charAt(0) === '|' || rest.charAt(0) === '>') {
      pos++;
      return blockScalar(rest, indent, lineNo);
    }
    if (unsupported(rest, lineNo)) { pos++; return null; }
    if (rest.charAt(0) === '[' || rest.charAt(0) === '{') {
      pos++;
      return yamlFlow(rest, state, lineNo);
    }
    if (rest.charAt(0) === '"' || rest.charAt(0) === "'") {
      var closed = rest.charAt(rest.length - 1) === rest.charAt(0) && rest.length > 1;
      if (!closed) state.err(lineNo, 'A quoted string is never closed.');
      pos++;
      var un = closed ? yamlUnquote(rest) : { ok: true, value: rest.slice(1) };
      if (!un.ok) { state.err(lineNo, un.error); return rest; }
      return un.value;
    }
    /* a plain scalar may continue on more-indented lines */
    var parts = [rest];
    pos++;
    while (pos < lines.length) {
      var it = info(pos);
      if (it.body === '') break;
      if (it.indent <= indent) break;
      if (yamlSplitKey(it.body) || /^-(\s|$)/.test(it.body)) break;
      parts.push(it.body);
      pos++;
    }
    return parts.length > 1 ? parts.join(' ') : yamlScalar(rest, state, lineNo);
  }

  function parseSeq(indent) {
    var out = [], it, body, rest;
    for (;;) {
      skipBlank();
      if (pos >= lines.length || atDocBoundary()) break;
      it = info(pos);
      if (it.indent < indent) break;
      if (it.indent > indent) {
        state.err(it.n + 1, 'This line is indented more than the sequence it belongs to.');
        pos++;
        continue;
      }
      body = it.body;
      if (!/^-(\s|$)/.test(body)) break;
      rest = body.slice(1).trim();
      if (rest === '') {
        pos++;
        var nested = parseNode(indent + 1);
        out.push(nested === undefined ? null : nested);
        continue;
      }
      /* "- name: web" starts a mapping whose indent is the column of "name" */
      if (yamlSplitKey(rest)) {
        var itemIndent = it.text.length - it.text.replace(/^\s*-\s+/, '').length;
        lines[pos] = new Array(itemIndent + 1).join(' ') + rest;
        out.push(parseMap(itemIndent));
        continue;
      }
      out.push(parseValue(rest, indent, it.n + 1));
    }
    return out;
  }

  function parseMap(indent) {
    var out = {}, seen = {}, it, split;
    for (;;) {
      skipBlank();
      if (pos >= lines.length || atDocBoundary()) break;
      it = info(pos);
      if (it.indent < indent) break;
      if (it.indent > indent) {
        state.err(it.n + 1, 'This line is indented more than the mapping it belongs to (expected ' + indent + ' spaces, found ' + it.indent + ').');
        pos++;
        continue;
      }
      if (/^-(\s|$)/.test(it.body)) break;
      if (unsupported(it.body, it.n + 1)) { pos++; continue; }
      split = yamlSplitKey(it.body);
      if (!split) {
        state.err(it.n + 1, 'Expected "key: value" but found ' + JSON.stringify(it.body.slice(0, 60)) + '. A colon inside a plain value needs a space after it, or quotes around the value.');
        pos++;
        continue;
      }
      if (split.error) state.err(it.n + 1, split.error);
      if (Object.prototype.hasOwnProperty.call(seen, split.key)) {
        state.err(it.n + 1, 'Duplicate key ' + JSON.stringify(split.key) + ' - it was already set on line ' + seen[split.key] + '. Most parsers keep the last one silently.');
      }
      seen[split.key] = it.n + 1;
      out[split.key] = parseValue(split.rest, indent, it.n + 1);
    }
    return out;
  }

  function parseNode(minIndent) {
    skipBlank();
    if (pos >= lines.length || atDocBoundary()) return undefined;
    var it = info(pos);
    if (it.indent < minIndent) return undefined;
    if (/^-(\s|$)/.test(it.body)) return parseSeq(it.indent);
    if (yamlSplitKey(it.body)) return parseMap(it.indent);
    return parseValue(it.body, it.indent - 1, it.n + 1);
  }

  var docs = [];
  skipBlank();
  while (pos < lines.length) {
    var here = info(pos);
    if (here.body === '...') { pos++; skipBlank(); continue; }
    if (here.body === '---' || /^---\s/.test(here.text)) {
      var inlineAfterMarker = here.text.replace(/^---\s*/, '').trim();
      if (inlineAfterMarker !== '') {
        lines[pos] = new Array(4).join(' ') + inlineAfterMarker;
        docs.push(parseNode(0));
      } else {
        pos++;
        var doc = parseNode(0);
        docs.push(doc === undefined ? null : doc);
      }
      skipBlank();
      continue;
    }
    var node = parseNode(0);
    if (node === undefined) break;
    docs.push(node);
    skipBlank();
  }

  if (!docs.length && src.trim() !== '') docs.push(null);

  return {
    ok: errors.length === 0,
    value: docs.length === 1 ? docs[0] : docs,
    documents: docs.length,
    errors: errors,
    warnings: warnings,
    empty: src.trim() === ''
  };
}

function validateYaml(text) {
  if (String(text).trim() === '') return { ok: false, errors: [{ line: 1, message: 'Nothing to validate.' }], warnings: [] };
  var res = parseYaml(text);
  var out = {
    ok: res.ok,
    errors: res.errors,
    warnings: res.warnings,
    documents: res.documents,
    json: ''
  };
  try {
    out.json = JSON.stringify(res.value, function (k, v) {
      if (typeof v === 'number' && !isFinite(v)) return String(v);
      return v;
    }, 2);
  } catch (e) {
    out.json = '';
    out.errors = out.errors.concat([{ line: 1, message: 'The document parsed, but could not be shown as JSON: ' + e.message }]);
    out.ok = false;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Regular expressions.
 * ------------------------------------------------------------------ */

var REGEX_SUBJECT_LIMIT = 200000;
var REGEX_MATCH_LIMIT = 500;

function runRegex(pattern, flags, subject) {
  if (String(pattern) === '') return { ok: false, error: 'Enter a pattern.' };
  var cleanFlags = String(flags || '').replace(/[^gimsuyd]/g, '');
  var subjectText = String(subject);
  var truncatedSubject = false;
  if (subjectText.length > REGEX_SUBJECT_LIMIT) {
    subjectText = subjectText.slice(0, REGEX_SUBJECT_LIMIT);
    truncatedSubject = true;
  }
  var re;
  try {
    re = new RegExp(String(pattern), cleanFlags.indexOf('g') < 0 ? cleanFlags + 'g' : cleanFlags);
  } catch (e) {
    return { ok: false, error: e.message };
  }

  var matches = [], m, guard = 0, truncated = false;
  while ((m = re.exec(subjectText)) !== null) {
    if (matches.length >= REGEX_MATCH_LIMIT) { truncated = true; break; }
    var groups = [], gi;
    for (gi = 1; gi < m.length; gi++) groups.push({ n: gi, value: m[gi] === undefined ? null : m[gi] });
    var named = [], key;
    if (m.groups) {
      for (key in m.groups) {
        if (Object.prototype.hasOwnProperty.call(m.groups, key)) {
          named.push({ name: key, value: m.groups[key] === undefined ? null : m.groups[key] });
        }
      }
    }
    matches.push({ index: m.index, text: m[0], groups: groups, named: named });
    if (m[0] === '') re.lastIndex++;              /* a zero-length match would loop forever */
    if (++guard > REGEX_MATCH_LIMIT * 20) { truncated = true; break; }
  }

  return {
    ok: true,
    matches: matches,
    count: matches.length,
    truncated: truncated,
    truncatedSubject: truncatedSubject,
    flags: cleanFlags,
    source: re.source
  };
}

/* Splits the subject into alternating plain and matched runs, so the result
   can be rendered with createElement and textContent instead of innerHTML. */
function regexSegments(subject, matches) {
  var out = [], at = 0, i, m;
  for (i = 0; i < matches.length; i++) {
    m = matches[i];
    if (m.index > at) out.push({ text: subject.slice(at, m.index), hit: false });
    if (m.text !== '') out.push({ text: m.text, hit: true });
    at = m.index + m.text.length;
  }
  if (at < subject.length) out.push({ text: subject.slice(at), hit: false });
  return out;
}

function regexReplace(pattern, flags, subject, replacement) {
  var res = runRegex(pattern, flags, subject);
  if (!res.ok) return res;
  try {
    var re = new RegExp(String(pattern), String(flags || '').replace(/[^gimsuyd]/g, ''));
    return { ok: true, out: String(subject).replace(re, String(replacement)) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
