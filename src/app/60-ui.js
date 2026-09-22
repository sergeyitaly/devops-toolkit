
/* ------------------------------------------------------------------ *
 * Small DOM helpers.
 *
 * Every value that came from the user is placed with textContent. The
 * page never assigns innerHTML, which is what makes "no HTML injection"
 * something the security test can check with one regex rather than a
 * judgement call.
 * ------------------------------------------------------------------ */

function el(tag, cls, text) {
  var node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function add(parent, child) {
  parent.appendChild(child);
  return child;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function on(node, event, handler) {
  if (node && node.addEventListener) node.addEventListener(event, handler);
  return node;
}

function card(root, title) {
  var box = add(root, el('div', 'card'));
  if (title) add(box, el('h3', 'card-t', title));
  return box;
}

function field(root, label, opts) {
  opts = opts || {};
  var wrap = add(root, el('label', 'field'));
  add(wrap, el('span', 'lbl', label));
  var input = el(opts.tag || 'input', 'in' + (opts.plain ? '' : ' mono'));
  if (opts.tag !== 'textarea') input.type = opts.type || 'text';
  if (opts.rows) input.rows = opts.rows;
  if (opts.placeholder) input.placeholder = opts.placeholder;
  if (opts.value !== undefined) input.value = String(opts.value);
  if (opts.min !== undefined) input.min = String(opts.min);
  if (opts.max !== undefined) input.max = String(opts.max);
  if (opts.inputmode) input.inputMode = opts.inputmode;
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('autocomplete', 'off');
  add(wrap, input);
  return input;
}

function selectField(root, label, options, value) {
  var wrap = add(root, el('label', 'field'));
  add(wrap, el('span', 'lbl', label));
  var sel = add(wrap, el('select', 'in plain'));
  options.forEach(function (opt) {
    var o = add(sel, el('option', '', opt.text));
    o.value = opt.value;
    if (opt.value === value) o.selected = true;
  });
  sel.value = value;
  return sel;
}

function optionRow(root) {
  return add(root, el('div', 'opts'));
}

function toggle(row, label, checked, onChange, iconSrc) {
  var wrap = add(row, el('label', 'chk' + (checked ? ' on' : '')));
  var box = add(wrap, el('input'));
  box.type = 'checkbox';
  box.checked = !!checked;
  if (iconSrc) {
    var icon = add(wrap, el('img', 'chipicon'));
    icon.src = iconSrc;
    icon.alt = '';
  }
  add(wrap, el('span', '', label));
  on(box, 'change', function () {
    wrap.className = 'chk' + (box.checked ? ' on' : '');
    if (onChange) onChange();
  });
  return box;
}

function buttonRow(root) {
  return add(root, el('div', 'btns'));
}

function button(row, label, handler, kind) {
  var b = add(row, el('button', 'btn' + (kind ? ' ' + kind : ''), label));
  b.type = 'button';
  on(b, 'click', handler);
  return b;
}

function outRow(box, label) {
  var row = add(box, el('div', 'orow'));
  add(row, el('span', 'k', label));
  var value = add(row, el('button', 'v mono'));
  value.type = 'button';
  value.title = 'Copy';
  on(value, 'click', function () { copyText(value.textContent); });
  return {
    row: row,
    node: value,
    set: function (text, tone) {
      value.textContent = text === undefined || text === null ? '' : String(text);
      row.className = 'orow' + (tone ? ' ' + tone : '');
      row.hidden = false;
      return this;
    },
    hide: function () { row.hidden = true; return this; }
  };
}

function outArea(root, label) {
  if (label) add(root, el('span', 'lbl', label));
  return add(root, el('div', 'out mono'));
}

function noteLine(root, text) {
  return add(root, el('p', 'note', text));
}

function messageBox(root, kind) {
  var node = add(root, el('div', kind));
  node.hidden = true;
  return {
    node: node,
    set: function (text) {
      node.textContent = text ? String(text) : '';
      node.hidden = !text;
    }
  };
}

function table(root, headers) {
  var wrap = add(root, el('div', 'scroll'));
  var t = add(wrap, el('table', 'tbl'));
  var head = add(add(t, el('thead')), el('tr'));
  headers.forEach(function (h) { add(head, el('th', '', h)); });
  var body = add(t, el('tbody'));
  return {
    body: body,
    clear: function () { clear(body); },
    row: function (cells) {
      var tr = add(body, el('tr'));
      cells.forEach(function (c) { add(tr, el('td', '', c)); });
      return tr;
    }
  };
}

/* ---------- clipboard ---------- */

var toastTimer = null;

function toast(text) {
  var node = document.getElementById('toast');
  if (!node) return;
  node.textContent = text;
  node.className = 'show';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { node.className = ''; }, 1600);
}

/* execCommand is deprecated but it is the only copy route that works on
   file:// and in older iOS Safari, so it stays as the fallback. */
function fallbackCopy(text) {
  try {
    var area = document.createElement('textarea');
    area.value = text;
    area.className = 'offscreen';
    area.setAttribute('readonly', '');
    document.body.appendChild(area);
    area.select();
    var ok = typeof document.execCommand === 'function' && document.execCommand('copy');
    document.body.removeChild(area);
    return !!ok;
  } catch (e) {
    return false;
  }
}

function copyText(text) {
  var value = text === undefined || text === null ? '' : String(text);
  if (value === '') return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(
        function () { toast('Copied'); },
        function () { toast(fallbackCopy(value) ? 'Copied' : 'Select the text and copy it manually'); }
      );
      return;
    }
  } catch (e) { /* fall through to the old route */ }
  toast(fallbackCopy(value) ? 'Copied' : 'Select the text and copy it manually');
}

function copyButton(row, label, getText) {
  return button(row, label, function () { copyText(getText()); });
}

/* Reading the clipboard needs a permission the browser may refuse, and
   Firefox refuses it outright - so the button always has somewhere to fall
   back to rather than appearing to do nothing. */
function pasteHint(input) {
  if (input && typeof input.focus === 'function') input.focus();
  toast('Paste with Ctrl+V, or long-press on a phone');
}

function pasteInto(input, after) {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function (text) {
        if (typeof text !== 'string' || text === '') {
          toast('The clipboard is empty');
          return;
        }
        input.value = text;
        if (after) after();
        toast('Pasted');
      }, function () { pasteHint(input); });
      return;
    }
  } catch (e) { /* no clipboard read here - tell the user how to do it */ }
  pasteHint(input);
}

function pasteButton(row, input, after, label) {
  return button(row, label || 'Paste', function () { pasteInto(input, after); });
}

/* One-tap sample inputs. Every tool carries a few, because the fastest way to
   explain what a field wants is to fill it in. */
function examples(root, values, apply) {
  var wrap = add(root, el('div', 'exwrap'));
  add(wrap, el('span', 'lbl', 'Examples'));
  var row = add(wrap, el('div', 'opts'));
  values.forEach(function (value) {
    var label = typeof value === 'string' ? value : value.label;
    var data = typeof value === 'string' ? value : value.value;
    button(row, label, function () { apply(data); }, 'ghost');
  });
  return row;
}

/* Collapsed by default: the help is there for the first visit and out of the
   way on every one after it. <details> does that with no script. */
function helpBlock(root, items) {
  var box = add(root, el('details', 'help'));
  add(box, el('summary', '', 'What this does, and how to read it'));
  var list = add(box, el('ul'));
  items.forEach(function (item) { add(list, el('li', '', item)); });
  return box;
}
