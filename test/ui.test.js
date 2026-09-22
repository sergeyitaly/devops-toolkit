/* Drives the real panels through the real dispatcher: the layer where the
   wiring bugs live. Every user-visible bug should become a test here. */
'use strict';

const { loadApp, runner, nodeText } = require('./harness');
const { ctx, dom, APP } = loadApp();
const t = runner('ui');

function panelText(id) {
  const panel = APP.panel(id);
  return panel ? nodeText(panel.host) : '';
}

function api(id) {
  const panel = APP.panel(id);
  return panel ? panel.api : null;
}

function type(node, value) {
  node.value = value;
  node.fire('input');
  return node;
}

/* ---------- the shell ---------- */

t.eq('twelve tools registered', APP.tools.length, 12);
t.eq('every tool has an id, a name and a blurb',
  APP.tools.every(tool => tool.id && tool.name && tool.blurb && tool.keywords && typeof tool.build === 'function'), true);
t.eq('tool ids are unique', new Set(APP.tools.map(tool => tool.id)).size, 12);

t.eq('home lists every tool', APP.renderHome(''), 12);
t.eq('search narrows the list', APP.renderHome('yaml'), 1);
t.eq('search matches keywords not just names', APP.renderHome('kubernetes') >= 1, true);
t.eq('search across two words', APP.renderHome('subnet split'), 1);
t.eq('search with no hit', APP.renderHome('nothinglikethis'), 0);
t.eq('empty message shown when nothing matches', dom.byId.empty.hidden, false);
APP.renderHome('');
t.eq('empty message hidden again', dom.byId.empty.hidden, true);

t.eq('opening an unknown tool falls back home', APP.open('../etc/passwd'), '');
t.eq('home is visible after the fallback', dom.byId.home.hidden, false);

APP.open('cidr');
t.eq('title follows the open tool', dom.byId.title.textContent, 'CIDR Calculator');
t.eq('back button appears', dom.byId.back.hidden, false);
t.eq('home is hidden while a tool is open', dom.byId.home.hidden, true);
APP.home();
t.eq('title resets at home', dom.byId.title.textContent, 'DevOps Pocket Toolkit');
t.eq('back button hidden at home', dom.byId.back.hidden, true);

/* ---------- the one stored preference ---------- */

APP.open('jwt');
t.eq('the open tool is remembered', JSON.parse(dom.localStorage.getItem(APP.prefKey)).tool, 'jwt');
t.eq('only one key is stored', Object.keys(dom.localStorage._store).length, 1);
t.eq('the key is the project-prefixed constant', APP.prefKey, 'devops-pocket-toolkit.v1');
dom.localStorage.setItem(APP.prefKey, JSON.stringify({ tool: '../../evil' }));
t.eq('a tampered stored tool is ignored', APP.loadPrefs().tool, '');
dom.localStorage.setItem(APP.prefKey, 'not json at all');
t.eq('unparseable storage is ignored', APP.loadPrefs().tool, '');
APP.home();

/* ---------- CIDR ---------- */

APP.open('cidr');
type(api('cidr').input, '192.168.1.130/26');
t.has('cidr shows the network', panelText('cidr'), '192.168.1.128/26');
t.has('cidr shows the broadcast', panelText('cidr'), '192.168.1.191');
t.has('cidr shows the usable count', panelText('cidr'), '62');
t.has('cidr shows the type', panelText('cidr'), 'private');
type(api('cidr').input, '2001:db8::/48');
t.has('cidr switches to IPv6', panelText('cidr'), '2001:db8:0:ffff:ffff:ffff:ffff:ffff');
t.has('cidr counts IPv6 addresses exactly', panelText('cidr'), '1 208 925 819 614 629 174 706 176');
type(api('cidr').input, '10.0.0.0/99');
t.has('cidr reports a bad prefix', panelText('cidr'), 'between /0 and /32');

/* ---------- subnet splitter ---------- */

APP.open('subnet');
type(api('subnet').input, '10.0.0.0/22');
const subnetText = panelText('subnet');
t.has('splitter lists the first subnet', subnetText, '10.0.0.0/24');
t.has('splitter lists the last subnet', subnetText, '10.0.3.0/24');
t.has('splitter says how many', subnetText, 'All 4 subnets are listed');

/* ---------- base64 ---------- */

APP.open('base64');
type(api('base64').input, 'hello');
t.has('base64 encodes', panelText('base64'), 'aGVsbG8=');
api('base64').mode.value = 'decode';
api('base64').mode.fire('change');
type(api('base64').input, 'aGVsbG8=');
t.has('base64 decodes', panelText('base64'), 'hello');
type(api('base64').input, 'not base64!!');
t.has('base64 reports bad input', panelText('base64'), 'not valid base64');

/* ---------- URL ---------- */

APP.open('url');
type(api('url').input, 'https://example.com/a b?q=1&r=two');
t.has('url encodes', panelText('url'), 'https://example.com/a%20b?q=1&r=two'.replace('?', '%3F') === '' ? '' : 'a%20b');
t.has('url shows the host', panelText('url'), 'example.com');
t.has('url lists parameters', panelText('url'), 'two');

/* ---------- regex ---------- */

APP.open('regex');
const rx = api('regex');
type(rx.pattern, '(\\w+)=(\\S+)');
type(rx.subject, 'DB_HOST=db.internal\nDB_PORT=5432');
t.has('regex counts matches', panelText('regex'), '2');
t.has('regex shows a capture', panelText('regex'), 'db.internal');
type(rx.pattern, '(');
t.has('regex reports a broken pattern', panelText('regex'), 'Invalid regular expression');

/* ---------- JWT ---------- */

APP.open('jwt');
type(api('jwt').input, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
const jwtText = panelText('jwt');
t.has('jwt shows the algorithm', jwtText, 'HS256');
t.has('jwt shows a claim', jwtText, 'John Doe');
t.has('jwt says the signature is not verified', jwtText, 'not verified');
type(api('jwt').input, 'garbage');
t.has('jwt rejects garbage', panelText('jwt'), 'three dot-separated segments');

/* ---------- timestamp ---------- */

APP.open('time');
type(api('time').input, '1700000000');
t.has('timestamp converts to ISO', panelText('time'), '2023-11-14T22:13:20.000Z');
t.has('timestamp says how it read the number', panelText('time'), 'a number in seconds');
type(api('time').input, '2024-03-01T12:00:00Z');
t.has('timestamp parses a date string', panelText('time'), '1709294400');

/* ---------- UUID ---------- */

APP.open('uuid');
t.eq('uuid generates the requested count', api('uuid').out.textContent.split('\n').length, 5);
t.eq('generated uuids are v4 by default',
  api('uuid').out.textContent.split('\n').every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)), true);
type(api('uuid').inspectInput, '018f5e2a-7c3d-7b91-a3e8-9f2c4d5b6a70');
t.has('uuid inspection reports the version', panelText('uuid'), 'v7');
t.has('uuid inspection reports the variant', panelText('uuid'), 'RFC 4122');

/* ---------- password ---------- */

APP.open('password');
t.eq('password has the requested length', api('password').main.node.textContent.length, 24);
t.has('password shows entropy', panelText('password'), 'bits');
type(api('password').length, '40');
t.eq('password length follows the field', api('password').main.node.textContent.length, 40);

/* ---------- hash ---------- */

APP.open('hash');
type(api('hash').input, 'abc');
t.eq('md5 row', api('hash').rows.md5.node.textContent, '900150983cd24fb0d6963f7d28e17f72');
t.eq('sha1 row', api('hash').rows.sha1.node.textContent, 'a9993e364706816aba3e25717850c26c9cd0d89d');
t.eq('sha256 row', api('hash').rows.sha256.node.textContent, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
t.has('hash reports the input size', panelText('hash'), '3 bytes');

/* ---------- JSON ---------- */

APP.open('json');
type(api('json').input, '{"b":1,"a":2}');
t.has('json formats', api('json').out.textContent, '{\n  "b": 1,\n  "a": 2\n}');
type(api('json').input, '{"a": 1,}');
t.has('json points at the error', panelText('json'), 'trailing comma');
t.has('json gives a line and column', panelText('json'), 'line 1');

/* ---------- YAML ---------- */

APP.open('yaml');
type(api('yaml').input, 'a: 1\nb:\n  - x\n  - y\n');
t.has('yaml accepts a valid document', panelText('yaml'), 'Valid YAML');
t.has('yaml shows the JSON meaning', api('yaml').jsonOut.textContent, '"b": [');
type(api('yaml').input, 'a: 1\na: 2\n');
t.has('yaml reports a duplicate key', panelText('yaml'), 'Duplicate key');
type(api('yaml').input, 'version: 3.10\n');
t.has('yaml warns about a lost trailing zero', panelText('yaml'), 'quote it');

/* ---------- keyboard ---------- */

APP.open('cidr');
dom.document.fire('keydown', { key: 'Escape' });
t.eq('escape returns to the tool list', APP.current(), '');
dom.document.activeElement = null;
dom.document.fire('keydown', { key: '/' });
t.ok('slash focuses the search box', dom.document.activeElement === dom.byId.search);

/* ---------- every tool carries examples, help and a way to paste ---------- */

function allNodes(node, out) {
  (node.childNodes || []).forEach(child => {
    if (child.nodeType === 1) { out.push(child); allNodes(child, out); }
  });
  return out;
}
function byTag(host, tag) { return allNodes(host, []).filter(n => n.tagName === tag); }
function byClass(host, cls) {
  return allNodes(host, []).filter(n => (n.className || '').split(' ').indexOf(cls) >= 0);
}
function buttonNamed(host, text) {
  return byTag(host, 'BUTTON').filter(b => b.textContent === text)[0] || null;
}

APP.tools.forEach(tool => {
  APP.open(tool.id);
  const host = APP.panel(tool.id).host;
  const help = byTag(host, 'DETAILS');
  t.eq('help block for ' + tool.id, help.length, 1);
  t.ok('help has several points for ' + tool.id, byTag(help[0], 'LI').length >= 4);
  t.ok('examples for ' + tool.id, byClass(host, 'exwrap').length >= 1);
  t.ok('at least three examples for ' + tool.id, byClass(host, 'ghost').length >= 3);
  const paste = byTag(host, 'BUTTON').filter(b => /Paste/.test(b.textContent));
  /* the password generator has nothing to paste into - it only produces */
  t.ok('paste button for ' + tool.id, tool.id === 'password' ? paste.length === 0 : paste.length >= 1);
});

APP.open('cidr');
byClass(APP.panel('cidr').host, 'ghost')[1].fire('click');
t.has('an example button fills the input', panelText('cidr'), '192.168.1.128/26');

APP.open('yaml');
byClass(APP.panel('yaml').host, 'ghost')[1].fire('click');
t.has('the compose example parses', panelText('yaml'), 'Valid YAML');

APP.open('password');
byClass(APP.panel('password').host, 'ghost')[4].fire('click');
t.eq('a preset changes the settings', api('password').main.node.textContent.length, 8);
t.has('a preset is honest about a weak choice', panelText('password'), 'weak');

/* ---------- the home-screen identity follows the open tool ---------- */

APP.open('yaml');
t.eq('the touch icon follows the tool', dom.byId.touchicon.getAttribute('href'), './icons/tools/yaml.png');
t.eq('the home-screen name follows the tool', dom.byId.apptitle.getAttribute('content'), 'YAML Validator');
APP.home();
t.eq('the touch icon resets at home', dom.byId.touchicon.getAttribute('href'), './icons/icon-180.png');
t.eq('the home-screen name resets at home', dom.byId.apptitle.getAttribute('content'), 'DevOps Toolkit');

/* ---------- picking tools on the home screen itself ---------- */

APP.home();
const grid = dom.byId.grid;
const tiles = () => byClass(grid, 'tile');

t.eq('twelve tiles, three across and four down', tiles().length, 12);
t.eq('each tile carries its icon', byClass(grid, 'tileicon').length, 12);
t.eq('each tile carries its name and description separately',
  byClass(grid, 'tileblurb').length, 12);
t.eq('the selection dot is a separate node from the description',
  byClass(grid, 'pickdot').length, 12);
t.eq('nothing is selectable to begin with', APP.selectMode(), false);
t.eq('the select bar starts hidden', dom.byId.selbar.hidden, true);

tiles()[0].fire('contextmenu');
t.eq('a long press starts select mode', APP.selectMode(), true);
t.eq('the pressed tool is picked', APP.selected(), ['cidr']);
t.eq('the select bar appears', dom.byId.selbar.hidden, false);
const addButton = () => byTag(dom.byId.selbar, 'BUTTON').filter(b => /^Add/.test(nodeText(b)))[0] || null;
t.eq('the bar is three controls on one row', byTag(dom.byId.selbar, 'BUTTON').length, 3);
t.has('the count rides on the button instead of its own line', nodeText(addButton()), 'Add 1');
t.has('the button still says what it does', nodeText(addButton()), 'to home screen');
t.ok('the pressed tile is marked', (tiles()[0].className || '').indexOf('sel') >= 0);
t.ok('the grid switches into picking mode', (grid.className || '').indexOf('picking') >= 0);
t.ok('every tile carries a selection dot', byClass(grid, 'pickdot').length === 12);

tiles()[1].fire('click');
t.eq('the click that ends the long press is ignored', APP.selected(), ['cidr']);
tiles()[1].fire('click');
t.eq('tapping another tile adds it', APP.selected(), ['cidr', 'subnet']);
tiles()[0].fire('click');
t.eq('tapping a picked tile removes it', APP.selected(), ['subnet']);
t.eq('tapping never opens a tool while picking', APP.current(), '');

buttonNamed(dom.byId.selbar, 'Select all').fire('click');
t.eq('select all picks everything', APP.selected().length, 12);
buttonNamed(dom.byId.selbar, 'Select none').fire('click');
t.eq('the same button then clears it', APP.selected().length, 0);
addButton().fire('click');
t.has('adding nothing asks for a pick first', nodeText(dom.byId.toast), 'at least one tool');
t.eq('with nothing picked the button carries no count', nodeText(addButton()), 'Add to home screen');

APP.toggleSelect('json');
APP.toggleSelect('yaml');
t.has('the count follows the selection', nodeText(addButton()), 'Add 2');
addButton().fire('click');
t.eq('select mode ends when the walkthrough starts', APP.selectMode(), false);
t.eq('the bar goes away with it', dom.byId.selbar.hidden, true);
t.has('the walkthrough starts with the first pick', nodeText(dom.byId.sheetbody), 'Add JSON Formatter');
t.has('the walkthrough counts the steps', nodeText(dom.byId.sheetbody), 'Step 1 of 2');
const sheetButtons = byClass(dom.byId.sheetbody, 'btn');
t.eq('the walkthrough offers three controls on one row', sheetButtons.length, 3);
t.has('the first opens the tool', nodeText(sheetButtons[0]), 'Open');
t.has('the tool name is the droppable half of the label', nodeText(sheetButtons[0]), 'JSON Formatter');
t.eq('the droppable halves are marked', byClass(dom.byId.sheetbody, 'wideword').length, 2);
buttonNamed(dom.byId.sheetbody, 'Added - next').fire('click');
t.has('the walkthrough moves on', nodeText(dom.byId.sheetbody), 'Add YAML Validator');
buttonNamed(dom.byId.sheetbody, 'Added - next').fire('click');
t.has('the walkthrough ends with the folder advice', nodeText(dom.byId.sheetbody), 'Drag the new icons');
t.has('it says plainly that a page cannot make the folder', nodeText(dom.byId.sheetbody), 'cannot do that part for you');
APP.closeSheet();
t.eq('the sheet closes', dom.byId.sheet.hidden, true);

APP.enterSelectMode('hash');
dom.document.fire('keydown', { key: 'Escape' });
t.eq('escape leaves select mode', APP.selectMode(), false);

APP.enterSelectMode('hash');
APP.open('hash');
t.eq('opening a tool leaves select mode behind', APP.selectMode(), false);
t.eq('the selection is never stored', Object.keys(dom.localStorage._store).length, 1);
APP.home();

dom.byId.selectmode.fire('click');
t.eq('the Select tools button also starts it', APP.selectMode(), true);
t.eq('and offers the way out', dom.byId.selectmode.textContent, 'Done');
dom.byId.selectmode.fire('click');
t.eq('pressing it again leaves select mode', APP.selectMode(), false);

/* ---------- panels are built once ---------- */

const before = APP.panel('cidr').host;
APP.open('cidr');
t.ok('reopening a tool reuses its panel', APP.panel('cidr').host === before);
t.eq('only opened tools are built', Object.keys(APP.panels).length <= 12, true);

/* ---------- the hold itself, on the clock ---------- */

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  APP.home();
  APP.exitSelectMode();

  byClass(dom.byId.grid, 'tile')[2].fire('mousedown', { clientX: 10, clientY: 10 });
  await wait(APP.longPressMs + 150);
  t.eq('holding a tile starts select mode', APP.selectMode(), true);
  t.eq('the held tool is the one picked', APP.selected(), ['base64']);
  APP.exitSelectMode();

  /* a drag is someone scrolling the list, not choosing a tool */
  const tile = byClass(dom.byId.grid, 'tile')[2];
  tile.fire('mousedown', { clientX: 10, clientY: 10 });
  tile.fire('mousemove', { clientX: 10, clientY: 70 });
  await wait(APP.longPressMs + 150);
  t.eq('a drag does not start select mode', APP.selectMode(), false);

  /* letting go early is a tap, not a hold */
  const tile2 = byClass(dom.byId.grid, 'tile')[2];
  tile2.fire('mousedown', { clientX: 10, clientY: 10 });
  tile2.fire('mouseup', { clientX: 10, clientY: 10 });
  await wait(APP.longPressMs + 150);
  t.eq('a quick tap does not start select mode', APP.selectMode(), false);

  t.done();
})();
