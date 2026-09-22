/* Regexes over the file that ships. Cruder than a parser and entirely
   adequate: these guard against a careless edit, not against someone with
   commit access. */
'use strict';

const fs = require('fs');
const path = require('path');
const { runner } = require('./harness');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
const t = runner('security');

const scriptOpen = html.indexOf('<script>');
const scriptClose = html.lastIndexOf('</script>');
const script = html.slice(scriptOpen + '<script>'.length, scriptClose);
const styleOpen = html.indexOf('<style>');
const styleClose = html.indexOf('</style>');
const markup = html.slice(0, styleOpen) + html.slice(styleClose + '</style>'.length, scriptOpen);

/* ---------- the policy ---------- */

const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html);
t.ok('the page carries a Content-Security-Policy', !!csp);
const policy = csp ? csp[1] : '';
t.ok('the script is pinned by hash', /script-src 'sha256-[A-Za-z0-9+/=]+'/.test(policy));
t.ok('the style is pinned by hash', /style-src 'sha256-[A-Za-z0-9+/=]+'/.test(policy));
t.ok('no unsafe-inline', policy.indexOf('unsafe-inline') < 0);
t.ok('no unsafe-eval', policy.indexOf('unsafe-eval') < 0);
t.ok('framing is refused', policy.indexOf("frame-ancestors 'none'") >= 0);
t.ok('base-uri is locked down', policy.indexOf("base-uri 'none'") >= 0);
t.ok('form-action is locked down', policy.indexOf("form-action 'none'") >= 0);
t.ok('object-src is locked down', policy.indexOf("object-src 'none'") >= 0);
t.ok('default-src is self', policy.indexOf("default-src 'self'") >= 0);

/* ---------- no dynamic code ---------- */

t.ok('no eval', !/[^.\w]eval\s*\(/.test(script));
t.ok('no new Function', !/new\s+Function\s*\(/.test(script));
t.ok('no document.write', !/document\s*\.\s*write/.test(script));
t.ok('no string timers', !/set(Timeout|Interval)\s*\(\s*['"`]/.test(script));
t.ok('no import()', !/[^.\w]import\s*\(/.test(script));

/* ---------- no HTML sinks ---------- */

/* the property, not the word: the page discusses innerHTML in a comment and
   must never touch it in code */
t.ok('never touches innerHTML', !/\.innerHTML/.test(script));
t.ok('never touches outerHTML', !/\.outerHTML/.test(script));
t.ok('no insertAdjacentHTML', !/insertAdjacentHTML/.test(script));
t.ok('no document.domain', !/document\s*\.\s*domain/.test(script));

/* ---------- no third-party anything ---------- */

/* example.com is RFC 2606 placeholder text shown inside an input, and the
   w3.org string is the SVG namespace passed to createElementNS - neither is
   a request. Anything else absolute would be a third party. */
const externals = html.match(/https?:\/\/[^\s"'<>)]+/g) || [];
const thirdParty = externals.filter(url => !/^https?:\/\/(www\.w3\.org\/2000\/svg|example\.com)/.test(url));
t.eq('no third-party URL anywhere in the page', thirdParty.length, 0);
const resourceRefs = (html.match(/(?:href|src)="([^"]*)"/g) || []).map(a => a.replace(/^(?:href|src)="|"$/g, ''));
t.ok('every referenced resource is relative', resourceRefs.every(url => url.indexOf('./') === 0));
t.ok('no external script tag', !/<script[^>]+src=/i.test(html));
t.ok('no external stylesheet', !/<link[^>]+rel="stylesheet"/i.test(html));
t.ok('the page makes no network calls', !/[^.\w](fetch|XMLHttpRequest|EventSource|WebSocket)\s*\(/.test(script));
t.ok('no beacons', !/sendBeacon/.test(script));
t.ok('exactly one inline script', html.split('<script>').length === 2);
t.ok('exactly one inline style', html.split('<style>').length === 2);

/* ---------- no inline handlers in the markup ---------- */

t.ok('no on* attributes in the markup', !/\son[a-z]+\s*=/i.test(markup));
t.ok('no javascript: urls', !/javascript:/i.test(html));

/* ---------- randomness ---------- */

t.ok('never calls Math.random', !/Math\s*\.\s*random\s*\(/.test(script));
t.ok('randomness comes from getRandomValues', /getRandomValues/.test(script));

/* ---------- storage discipline ---------- */

const storageCalls = script.match(/localStorage\.(getItem|setItem|removeItem|clear)\(([^)]*)\)/g) || [];
t.eq('every storage call names the one constant key',
  storageCalls.filter(call => call.indexOf('PREF_KEY') < 0).length, 0);
t.eq('storage calls are few and deliberate', storageCalls.length, 2);
const keyLiteral = /var PREF_KEY = '([^']+)'/.exec(script);
t.ok('the key is a fixed literal', !!keyLiteral);
t.ok('the key is prefixed with the project name', keyLiteral && keyLiteral[1].indexOf('devops-pocket-toolkit') === 0);
t.ok('a stored tool id is validated before use', /isKnownTool\(parsed\.tool\)/.test(script));
t.ok('storage is wrapped in try/catch', /try\s*\{[\s\S]{0,400}localStorage/.test(script));
t.ok('no cookies', !/document\s*\.\s*cookie/.test(script));
t.ok('no IndexedDB', !/indexedDB/.test(script));

/* ---------- the service worker ---------- */

t.ok('the worker ignores non-GET requests', /req\.method\s*!==\s*'GET'/.test(sw));
t.ok('the worker ignores cross-origin requests', /origin\s*!==\s*self\.location\.origin/.test(sw));
t.ok('the worker cleans up old caches', /caches\.delete/.test(sw));
t.ok('the cache name is versioned', /const CACHE = '[a-z0-9-]+-v\d+'/.test(sw));
t.ok('the page registers the worker', /serviceWorker\.register\('\.\/sw\.js'\)/.test(script));

/* ---------- every referenced file exists ---------- */

const referenced = new Set();
(html.match(/(?:href|src)="\.\/([^"]+)"/g) || []).forEach(m => referenced.add(m.replace(/.*"\.\/(.*)"/, '$1')));
(sw.match(/'\.\/([^']+)'/g) || []).forEach(m => referenced.add(m.slice(3, -1)));
manifest.icons.forEach(icon => referenced.add(icon.src.replace('./', '')));
referenced.delete('');
referenced.forEach(file => {
  t.ok('referenced file exists: ' + file, fs.existsSync(path.join(ROOT, file)));
});
t.ok('the worker precaches the page', sw.indexOf("'./index.html'") >= 0);
t.ok('the worker precaches the manifest', sw.indexOf("'./manifest.webmanifest'") >= 0);

/* ---------- install metadata ---------- */

t.eq('manifest start_url is relative', manifest.start_url, './');
t.eq('manifest scope is relative', manifest.scope, './');
t.eq('manifest display', manifest.display, 'standalone');
t.ok('manifest has a stable id', typeof manifest.id === 'string' && manifest.id.length > 0);
t.ok('manifest has a 192 icon', manifest.icons.some(i => i.sizes === '192x192'));
t.ok('manifest has a 512 icon', manifest.icons.some(i => i.sizes === '512x512'));
t.ok('manifest has a maskable icon', manifest.icons.some(i => i.purpose === 'maskable'));
t.ok('the page links the manifest', /<link rel="manifest" href="\.\/manifest\.webmanifest">/.test(html));
t.ok('the page has an apple-touch-icon', /<link rel="apple-touch-icon" id="touchicon" href="\.\/icons\/icon-180\.png">/.test(html));
t.ok('the viewport covers the safe area', /viewport-fit=cover/.test(html));
t.ok('zoom is not disabled', !/user-scalable=no/.test(html));

/* ---------- one icon per tool, and the shortcuts that use them ---------- */

const { loadApp } = require('./harness');
const toolIds = loadApp().APP.tools.map(tool => tool.id);

t.eq('a manifest shortcut for every tool', manifest.shortcuts.length, toolIds.length);
t.ok('the shortcuts are in the same order as the tools',
  manifest.shortcuts.every((entry, i) => entry.url === './#/' + toolIds[i]));
t.ok('every shortcut carries its own icon',
  manifest.shortcuts.every(entry => entry.icons && entry.icons.length === 1 && entry.icons[0].sizes === '192x192'));
t.ok('every tool icon file exists',
  toolIds.every(id => fs.existsSync(path.join(ROOT, 'icons', 'tools', id + '.png'))));
t.ok('the worker precaches every tool icon',
  toolIds.every(id => sw.indexOf("'./icons/tools/" + id + ".png'") >= 0));
t.ok('the page points the home-screen icon at the open tool', /icons\/tools\//.test(script));
t.ok('the home-screen identity is only ever set from a known tool', /isKnownTool\(id\)/.test(script));
const iconBytes = toolIds.reduce((sum, id) => sum + fs.statSync(path.join(ROOT, 'icons', 'tools', id + '.png')).size, 0);
t.ok('the tool icons stay small (' + (iconBytes / 1024).toFixed(1) + ' KB)', iconBytes < 120 * 1024);

/* ---------- the markup and the script agree ---------- */

const markupIds = new Set();
markup.split('<').forEach(chunk => {
  const found = /\sid="([^"]+)"/.exec(chunk.split('>')[0] || '');
  if (found) markupIds.add(found[1]);
});
const lookedUp = new Set((script.match(/getElementById\('([a-z]+)'\)/g) || [])
  .map(call => call.replace(/getElementById\('|'\)/g, '')));
lookedUp.forEach(id => {
  t.ok('the markup has the element the script looks up: ' + id, markupIds.has(id));
});

/* ---------- styling that a Node test can still guard ---------- */

/* The selection dot and the tile description are both spans inside a tile, so
   a bare `.tile span` rule styles the dot by accident - it once made the dots
   visible on wide screens when nothing was selected. */
t.ok('the tile description is styled by its own class', /\.tileblurb\s*\{/.test(html));
t.ok('no bare .tile span rule that would catch the selection dot', !/\.tile\s+span\s*\{/.test(html));
t.ok('the selection dot is hidden unless the grid is picking',
  /\.pickdot\s*\{[^}]*display:\s*none/.test(html) && /\.grid\.picking\s+\.pickdot\s*\{[^}]*display:\s*block/.test(html));
t.ok('the home grid is three columns', /\.grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,/.test(html));


/* ---------- the two themes cannot drift apart ---------- */

/* The page follows the device's light or dark setting, which only works while
   both palettes define the same names and nothing hardcodes a colour outside
   them. Both mistakes are invisible until someone opens the other theme. */
const style = html.slice(styleOpen + '<style>'.length, styleClose);
const rootDecls = /:root\s*\{([^}]*)\}/.exec(style);
const lightDecls = /@media\s*\(prefers-color-scheme:\s*light\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(style);
t.ok('the stylesheet defines a dark palette on :root', !!rootDecls);
t.ok('the stylesheet defines a light palette for prefers-color-scheme: light', !!lightDecls);

const colourNames = decls => {
  const names = new Set();
  String(decls || '').split(';').forEach(decl => {
    const found = /(--[a-z0-9-]+)\s*:\s*(\S.*)/.exec(decl);
    if (found && /^(#|rgba?\()/.test(found[2].trim())) names.add(found[1]);
  });
  return names;
};
const darkTokens = colourNames(rootDecls && rootDecls[1]);
const lightTokens = colourNames(lightDecls && lightDecls[1]);
t.ok('the dark palette names the whole set of colours', darkTokens.size >= 20);
darkTokens.forEach(name => {
  t.ok('the light palette redefines ' + name, lightTokens.has(name));
});
lightTokens.forEach(name => {
  t.ok('the dark palette defines ' + name + ' too', darkTokens.has(name));
});

t.ok('each palette sets color-scheme so native controls follow',
  /:root\s*\{[^}]*color-scheme:\s*dark/.test(style) &&
  /prefers-color-scheme:\s*light\)\s*\{\s*:root\s*\{[^}]*color-scheme:\s*light/.test(style));

const outsidePalettes = style
  .replace(rootDecls ? rootDecls[0] : '', '')
  .replace(lightDecls ? lightDecls[0] : '', '');
const strays = outsidePalettes.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) || [];
t.ok('no colour is hardcoded outside the two palettes: ' + strays.join(' '), strays.length === 0);

t.ok('the browser chrome is told about both themes',
  /<meta name="theme-color"[^>]*media="\(prefers-color-scheme: dark\)"/.test(markup) &&
  /<meta name="theme-color"[^>]*media="\(prefers-color-scheme: light\)"/.test(markup) &&
  /<meta name="color-scheme" content="dark light">/.test(markup));

/* ---------- house style ---------- */

t.ok('no emoji outside markdown', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html));
t.ok('the file uses LF endings', html.indexOf('\r') < 0);
t.ok('the worker uses LF endings', sw.indexOf('\r') < 0);
t.ok('gitattributes pins line endings',
  fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8').indexOf('text=auto eol=lf') >= 0);

/* ---------- honesty about what this is ---------- */

t.ok('the page says the JWT signature is not verified', /not verified/.test(script));
t.ok('the page says what is stored', /stored on your device/.test(markup));

t.done();
