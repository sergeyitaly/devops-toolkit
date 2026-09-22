
/* ------------------------------------------------------------------ *
 * The shell: the tool list, routing, install, the service worker and
 * the one stored preference.
 * ------------------------------------------------------------------ */

var PREF_KEY = 'devops-pocket-toolkit.v1';

var TOOL_BY_ID = {};
var PANELS = {};
var currentId = '';
var swReady = false;
var deferredPrompt = null;

TOOLS.forEach(function (tool) { TOOL_BY_ID[tool.id] = tool; });

function isKnownTool(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(TOOL_BY_ID, id);
}

/* The stored value is the one input an attacker with the device, or an old
   version of this page, controls - so it is checked against the tool list
   before it is used for anything. */
function loadPrefs() {
  try {
    if (typeof localStorage === 'undefined') return { tool: '' };
    var raw = localStorage.getItem(PREF_KEY);
    if (!raw) return { tool: '' };
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { tool: '' };
    return { tool: isKnownTool(parsed.tool) ? parsed.tool : '' };
  } catch (e) {
    return { tool: '' };
  }
}

function savePrefs(toolId) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PREF_KEY, JSON.stringify({ tool: isKnownTool(toolId) ? toolId : '' }));
  } catch (e) { /* private mode refuses; the app works without it */ }
}

/* ---------- home ---------- */

function matchesSearch(tool, query) {
  if (!query) return true;
  var hay = (tool.name + ' ' + tool.blurb + ' ' + tool.keywords).toLowerCase();
  return query.toLowerCase().split(/\s+/).every(function (word) {
    return word === '' || hay.indexOf(word) >= 0;
  });
}

/* ---------- picking tools straight off the home screen ---------- */

var selectMode = false;
/* A long press is followed by a click when the finger lifts. That click is
   part of the same gesture, so it is ignored - but only briefly, or a stray
   flag would swallow the next real tap. */
var suppressClickUntil = 0;
var LONG_PRESS_MS = 500;
var CLICK_SUPPRESS_MS = 700;

function searchQuery() {
  var search = document.getElementById('search');
  return search ? search.value || '' : '';
}

function selectedTools() {
  return TOOLS.filter(function (tool) { return !!installPicks[tool.id]; });
}

/* Hold a tile to start picking, the way a phone home screen does it. A drag
   is a scroll, not a press, so any real movement cancels the timer. */
function longPress(node, handler) {
  var timer = null;
  var startX = 0;
  var startY = 0;

  function point(event) {
    if (!event) return { x: 0, y: 0 };
    if (event.touches && event.touches.length) return { x: event.touches[0].clientX, y: event.touches[0].clientY };
    return { x: event.clientX || 0, y: event.clientY || 0 };
  }

  function stop() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function start(event) {
    var at = point(event);
    startX = at.x;
    startY = at.y;
    stop();
    timer = setTimeout(function () {
      timer = null;
      suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
      handler();
    }, LONG_PRESS_MS);
  }

  function move(event) {
    var at = point(event);
    if (Math.abs(at.x - startX) > 10 || Math.abs(at.y - startY) > 10) stop();
  }

  var pointerEvents = typeof window !== 'undefined' && typeof window.PointerEvent !== 'undefined';
  if (pointerEvents) {
    on(node, 'pointerdown', start);
    on(node, 'pointermove', move);
    on(node, 'pointerup', stop);
    on(node, 'pointercancel', stop);
    on(node, 'pointerleave', stop);
  } else {
    on(node, 'touchstart', start);
    on(node, 'touchmove', move);
    on(node, 'touchend', stop);
    on(node, 'touchcancel', stop);
    on(node, 'mousedown', start);
    on(node, 'mousemove', move);
    on(node, 'mouseup', stop);
    on(node, 'mouseleave', stop);
  }
  /* a desktop right-click, and what iOS raises on a long hold */
  on(node, 'contextmenu', function (event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    stop();
    suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
    handler();
  });
}

function renderHome(query) {
  var grid = document.getElementById('grid');
  var empty = document.getElementById('empty');
  var hint = document.getElementById('selecthint');
  var modeBtn = document.getElementById('selectmode');
  if (!grid) return 0;
  clear(grid);
  grid.className = 'grid' + (selectMode ? ' picking' : '');
  if (hint) {
    hint.textContent = selectMode
      ? 'Tap the tools you want on your home screen.'
      : 'or long-press any tool to put it on your home screen';
  }
  if (modeBtn) modeBtn.textContent = selectMode ? 'Done' : 'Select tools';

  var shown = 0;
  TOOLS.forEach(function (tool) {
    if (!matchesSearch(tool, query || '')) return;
    shown++;
    var picked = !!installPicks[tool.id];
    var tile = add(grid, el('button', 'tile' + (picked && selectMode ? ' sel' : '')));
    tile.type = 'button';
    tile.setAttribute('data-tool', tool.id);
    if (selectMode) tile.setAttribute('aria-pressed', picked ? 'true' : 'false');
    add(tile, el('span', 'pickdot'));
    var icon = add(tile, el('img', 'tileicon'));
    icon.src = './icons/tools/' + tool.id + '.png';
    icon.alt = '';
    add(tile, el('b', '', tool.name));
    add(tile, el('span', 'tileblurb', tool.blurb));
    on(tile, 'click', function () {
      if (Date.now() < suppressClickUntil) { suppressClickUntil = 0; return; }
      if (selectMode) toggleSelect(tool.id);
      else go(tool.id);
    });
    longPress(tile, function () { enterSelectMode(tool.id); });
  });
  if (empty) empty.hidden = shown !== 0;
  return shown;
}

function renderSelectBar() {
  var bar = document.getElementById('selbar');
  if (!bar) return;
  clear(bar);
  if (typeof document.body !== 'undefined' && document.body) {
    document.body.className = selectMode ? 'picking' : '';
  }
  if (!selectMode) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  var picked = selectedTools();
  /* the count rides on the button rather than taking a line of its own -
     three controls on one row is the whole bar */
  var addBtn = button(bar, '', function () {
    var chosen = selectedTools();
    if (!chosen.length) {
      toast('Tap at least one tool first');
      return;
    }
    exitSelectMode();
    renderInstallWalkthrough(chosen);
  }, 'primary');
  clear(addBtn);
  add(addBtn, el('span', '', picked.length ? 'Add ' + picked.length : 'Add'));
  add(addBtn, el('span', 'wideword', ' to home screen'));
  button(bar, picked.length === TOOLS.length ? 'Select none' : 'Select all', function () {
    var all = picked.length !== TOOLS.length;
    TOOLS.forEach(function (tool) { installPicks[tool.id] = all; });
    renderHome(searchQuery());
    renderSelectBar();
  });
  button(bar, 'Cancel', exitSelectMode);
}

function enterSelectMode(id) {
  selectMode = true;
  if (isKnownTool(id)) installPicks[id] = true;
  renderHome(searchQuery());
  renderSelectBar();
  return selectMode;
}

function exitSelectMode() {
  selectMode = false;
  installPicks = {};
  renderHome(searchQuery());
  renderSelectBar();
  return selectMode;
}

function toggleSelect(id) {
  if (!isKnownTool(id)) return false;
  installPicks[id] = !installPicks[id];
  renderHome(searchQuery());
  renderSelectBar();
  return !!installPicks[id];
}

/* ---------- routing ---------- */

function showPanel(id) {
  var panelHost = document.getElementById('panel');
  if (!panelHost) return null;
  if (!PANELS[id]) {
    var host = add(panelHost, el('div'));
    host.setAttribute('data-panel', id);
    PANELS[id] = { host: host, api: TOOL_BY_ID[id].build(host) || {} };
  }
  Object.keys(PANELS).forEach(function (key) {
    var panel = PANELS[key];
    var active = key === id;
    panel.host.hidden = !active;
    if (!active && panel.api && typeof panel.api.hide === 'function') panel.api.hide();
  });
  if (PANELS[id].api && typeof PANELS[id].api.show === 'function') PANELS[id].api.show();
  return PANELS[id];
}

function openTool(id) {
  if (!isKnownTool(id)) return goHome();
  var home = document.getElementById('home');
  var tool = document.getElementById('tool');
  var title = document.getElementById('title');
  var back = document.getElementById('back');
  currentId = id;
  if (selectMode) { selectMode = false; installPicks = {}; renderSelectBar(); }
  showPanel(id);
  if (home) home.hidden = true;
  if (tool) tool.hidden = false;
  if (title) title.textContent = TOOL_BY_ID[id].name;
  if (back) back.hidden = false;
  setHomeScreenIdentity(id);
  savePrefs(id);
  if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo(0, 0);
  return id;
}

function goHome() {
  var home = document.getElementById('home');
  var tool = document.getElementById('tool');
  var title = document.getElementById('title');
  var back = document.getElementById('back');
  currentId = '';
  Object.keys(PANELS).forEach(function (key) {
    PANELS[key].host.hidden = true;
    if (PANELS[key].api && typeof PANELS[key].api.hide === 'function') PANELS[key].api.hide();
  });
  if (home) home.hidden = false;
  if (tool) tool.hidden = true;
  if (title) title.textContent = 'DevOps Pocket Toolkit';
  if (back) back.hidden = true;
  setHomeScreenIdentity('');
  savePrefs('');
  return '';
}

function go(id) {
  if (typeof location !== 'undefined' && typeof location.hash === 'string') {
    location.hash = id ? '#/' + id : '#/';
    if (routeFromHash() === undefined) openTool(id);
    return id;
  }
  return openTool(id);
}

function routeFromHash() {
  if (typeof location === 'undefined' || typeof location.hash !== 'string') return undefined;
  var id = location.hash.replace(/^#\/?/, '');
  if (isKnownTool(id)) return openTool(id);
  return goHome();
}

/* ---------- install ---------- */

function isStandalone() {
  try {
    return (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) ||
      (typeof navigator !== 'undefined' && navigator.standalone === true);
  } catch (e) {
    return false;
  }
}

function isIOS() {
  var ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  return /iPad|iPhone|iPod/.test(ua) ||
    (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isIOSChrome() {
  var ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  return isIOS() && /CriOS|FxiOS|EdgiOS/.test(ua);
}

function updateInstallButton() {
  var btn = document.getElementById('install');
  var state = document.getElementById('swstate');
  if (state) {
    state.textContent = swReady
      ? 'Offline copy ready - this works with no network.'
      : 'Loading the offline copy. Once it is ready this page works with no network.';
  }
  if (!btn) return;
  btn.hidden = isStandalone();
}

function closeSheet() {
  var sheet = document.getElementById('sheet');
  if (sheet) sheet.hidden = true;
}

function shareGlyph(parent) {
  if (typeof document.createElementNS !== 'function') return;
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 14 17');
  svg.setAttribute('class', 'share-glyph');
  svg.setAttribute('aria-hidden', 'true');
  var box = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  box.setAttribute('d', 'M3 7H1v9h12V7h-2');
  box.setAttribute('fill', 'none');
  box.setAttribute('stroke', 'currentColor');
  box.setAttribute('stroke-width', '1.4');
  var arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arrow.setAttribute('d', 'M7 11V1M3.5 4.5 7 1l3.5 3.5');
  arrow.setAttribute('fill', 'none');
  arrow.setAttribute('stroke', 'currentColor');
  arrow.setAttribute('stroke-width', '1.4');
  svg.appendChild(box);
  svg.appendChild(arrow);
  parent.appendChild(svg);
}

/* Which tools the person wants as their own icon. Kept in memory only: it is
   a list of choices made in one sitting, not something worth writing to the
   device, and the README promises exactly one stored value. */
var installPicks = {};
var installQueue = [];
var installStep = 0;

function sheetBody() {
  var sheet = document.getElementById('sheet');
  var body = document.getElementById('sheetbody');
  if (!sheet || !body) return null;
  clear(body);
  sheet.hidden = false;
  return body;
}

/* iOS reads the apple-touch-icon and the app title out of the live document
   when "Add to Home Screen" is tapped, so pointing them at the open tool is
   what gives each added tool its own icon and name. */
function setHomeScreenIdentity(id) {
  var link = document.getElementById('touchicon');
  var meta = document.getElementById('apptitle');
  var known = isKnownTool(id);
  if (link) link.setAttribute('href', known ? './icons/tools/' + id + '.png' : './icons/icon-180.png');
  if (meta) meta.setAttribute('content', known ? TOOL_BY_ID[id].name : 'DevOps Toolkit');
  if (typeof document !== 'undefined') {
    document.title = known ? TOOL_BY_ID[id].name + ' - DevOps Pocket Toolkit' : 'DevOps Pocket Toolkit';
  }
}

function addSteps(body, label) {
  var list = add(body, el('ol'));
  if (isIOSChrome()) {
    add(list, el('li', '', 'Open this page in Safari - on an iPhone or iPad no other browser can add a web app to the home screen.'));
    return list;
  }
  if (isIOS()) {
    var step1 = add(list, el('li'));
    step1.appendChild(document.createTextNode('Tap the Share button '));
    shareGlyph(step1);
    step1.appendChild(document.createTextNode(' in the Safari toolbar.'));
    add(list, el('li', '', 'Scroll down and tap "Add to Home Screen".'));
    add(list, el('li', '', 'The name is already filled in as ' + label + '. Tap "Add".'));
    return list;
  }
  add(list, el('li', '', 'Open the browser menu.'));
  add(list, el('li', '', 'Choose "Add to Home screen" (Chrome and Edge) or "Install" (Firefox).'));
  add(list, el('li', '', 'Confirm. It lands on the home screen as ' + label + '.'));
  return list;
}

/* The whole toolkit as one icon. Individual tools are picked on the home
   screen itself - long-press a tile - rather than in a second list here. */
function installWholeToolkit() {
  if (deferredPrompt) {
    var prompt = deferredPrompt;
    deferredPrompt = null;
    closeSheet();
    try {
      prompt.prompt();
      return;
    } catch (e) { /* the prompt was already used or refused - show the steps */ }
  }
  go('');
  renderInstallWalkthrough([{ id: '', name: 'DevOps Toolkit' }]);
}

function renderInstallWalkthrough(queue) {
  if (queue) {
    installQueue = queue;
    installStep = 0;
  }
  var body = sheetBody();
  if (!body) return;

  if (installStep >= installQueue.length) {
    add(body, el('h2', '', 'That is all of them'));
    add(body, el('p', '', 'Drag the new icons on top of each other to put them in a folder - your phone makes the folder, and can name it whatever you like. A web page cannot do that part for you.'));
    var doneRow = buttonRow(body);
    button(doneRow, 'Close', function () {
      installQueue = [];
      installStep = 0;
      closeSheet();
    }, 'primary');
    button(doneRow, 'Pick more', function () {
      closeSheet();
      go('');
      enterSelectMode('');
    });
    return;
  }

  var current = installQueue[installStep];
  add(body, el('h2', '', 'Add ' + current.name));
  if (installQueue.length > 1) {
    add(body, el('p', 'note', 'Step ' + (installStep + 1) + ' of ' + installQueue.length + '.'));
  }
  addSteps(body, JSON.stringify(current.name));

  /* one row: the tool name and the word "next" drop away on a narrow screen
     rather than pushing the buttons onto a second line */
  var row = buttonRow(body);
  var openBtn = button(row, '', function () {
    go(current.id);
    closeSheet();
    toast(isIOS() ? 'Now: Share, then Add to Home Screen' : 'Now: browser menu, then Add to Home screen');
  }, 'primary');
  clear(openBtn);
  add(openBtn, el('span', '', 'Open'));
  add(openBtn, el('span', 'wideword', ' ' + current.name));

  var nextBtn = button(row, '', function () {
    installStep++;
    renderInstallWalkthrough();
  });
  clear(nextBtn);
  add(nextBtn, el('span', '', 'Added'));
  add(nextBtn, el('span', 'wideword', ' - next'));

  button(row, 'Skip', function () {
    installStep++;
    renderInstallWalkthrough();
  });

  add(body, el('p', 'note', 'Reopen Install at any point to carry on where you left off.'));
}

function openInstallSheet() {
  if (installQueue.length && installStep < installQueue.length) renderInstallWalkthrough();
  else installWholeToolkit();
}

function onInstallClick() {
  /* Picking several tools happens on the home screen, so the button only ever
     has one job here: whatever is in front of you. */
  if (selectMode) {
    var chosen = selectedTools();
    if (!chosen.length) {
      toast('Tap at least one tool first');
      return;
    }
    exitSelectMode();
    renderInstallWalkthrough(chosen);
    return;
  }
  if (currentId) {
    renderInstallWalkthrough([TOOL_BY_ID[currentId]]);
    return;
  }
  openInstallSheet();
}

/* ---------- boot ---------- */

function boot() {
  var search = document.getElementById('search');
  var back = document.getElementById('back');
  var install = document.getElementById('install');
  var sheet = document.getElementById('sheet');

  renderHome('');

  if (search) {
    on(search, 'input', function () { renderHome(search.value); });
  }
  if (back) {
    on(back, 'click', function () {
      if (typeof history !== 'undefined' && history.length > 1 && typeof history.back === 'function') history.back();
      else go('');
    });
  }
  if (install) on(install, 'click', onInstallClick);
  var modeBtn = document.getElementById('selectmode');
  if (modeBtn) {
    on(modeBtn, 'click', function () {
      if (selectMode) exitSelectMode();
      else enterSelectMode('');
    });
  }
  if (sheet) {
    on(sheet, 'click', function (event) {
      if (event && event.target === sheet) closeSheet();
    });
  }

  on(document, 'keydown', function (event) {
    if (!event) return;
    if (event.key === 'Escape') {
      var sheetNode = document.getElementById('sheet');
      if (sheetNode && !sheetNode.hidden) { closeSheet(); return; }
      if (selectMode) { exitSelectMode(); return; }
      if (currentId) go('');
      return;
    }
    if (event.key === '/' && search && document.activeElement !== search) {
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (currentId) go('');
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof search.focus === 'function') search.focus();
    }
  });

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('hashchange', routeFromHash);
    window.addEventListener('beforeinstallprompt', function (event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      deferredPrompt = event;
      updateInstallButton();
    });
    window.addEventListener('appinstalled', function () {
      deferredPrompt = null;
      updateInstallButton();
    });
  }

  var stored = loadPrefs();
  var routed = routeFromHash();
  if (!currentId && stored.tool && (typeof location === 'undefined' || !location.hash || location.hash === '#/')) {
    go(stored.tool);
  } else if (routed === undefined) {
    goHome();
  }

  updateInstallButton();

  if (typeof navigator !== 'undefined' && navigator.serviceWorker && typeof navigator.serviceWorker.register === 'function') {
    navigator.serviceWorker.register('./sw.js').then(function () {
      navigator.serviceWorker.ready.then(function () {
        swReady = true;
        updateInstallButton();
      });
    }).catch(function () { /* file:// and private modes refuse - that is fine */ });
  }
}

window.APP = {
  tools: TOOLS,
  byId: TOOL_BY_ID,
  panels: PANELS,
  open: openTool,
  home: goHome,
  route: routeFromHash,
  renderHome: renderHome,
  current: function () { return currentId; },
  panel: function (id) { return PANELS[id]; },
  prefKey: PREF_KEY,
  loadPrefs: loadPrefs,
  savePrefs: savePrefs,
  installSheet: openInstallSheet,
  installWalkthrough: renderInstallWalkthrough,
  installPicks: function () { return installPicks; },
  enterSelectMode: enterSelectMode,
  exitSelectMode: exitSelectMode,
  toggleSelect: toggleSelect,
  selectMode: function () { return selectMode; },
  selected: function () { return selectedTools().map(function (tool) { return tool.id; }); },
  longPressMs: LONG_PRESS_MS,
  closeSheet: closeSheet,
  boot: boot
};

if (typeof document !== 'undefined' && document.getElementById && document.getElementById('grid')) boot();
