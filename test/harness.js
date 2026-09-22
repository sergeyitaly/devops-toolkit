/* Runs the page's own inline script - the one that ships - inside a Node vm
   with the stub DOM. Nothing is copied or rebuilt, so a test that passes is a
   statement about index.html and not about a parallel module. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeDom, nodeText } = require('./dom');

const PAGE = path.join(__dirname, '..', 'index.html');

function loadApp() {
  const html = fs.readFileSync(PAGE, 'utf8');
  const open = html.indexOf('<script>');
  const close = html.lastIndexOf('</script>');
  if (open < 0 || close < 0) throw new Error('index.html has no inline script');
  const source = html.slice(open + '<script>'.length, close);

  const dom = makeDom(html);
  const ctx = {
    document: dom.document,
    location: dom.location,
    history: dom.history,
    localStorage: dom.localStorage,
    navigator: { userAgent: 'node', clipboard: null },
    crypto: globalThis.crypto,
    setTimeout, clearTimeout, setInterval, clearInterval,
    console, Math, Number, String, Array, Object, JSON, Date, RegExp, Error,
    BigInt, Uint8Array, isNaN, isFinite, parseInt, parseFloat, Infinity, NaN,
    encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
    matchMedia: dom.window.matchMedia
  };
  ctx.window = Object.assign(ctx, dom.window);
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: 'toolkit.js' });

  return { ctx, dom, html, APP: ctx.APP, nodeText };
}

/* the smallest assertion helper that still says something useful on failure */
function runner(title) {
  let pass = 0;
  const failures = [];

  function ok(name, condition, extra) {
    if (condition) { pass++; return true; }
    failures.push(name + (extra ? ' - ' + extra : ''));
    return false;
  }

  function eq(name, got, want) {
    const g = typeof got === 'object' && got !== null ? JSON.stringify(got) : String(got);
    const w = typeof want === 'object' && want !== null ? JSON.stringify(want) : String(want);
    return ok(name, g === w, 'got ' + JSON.stringify(g) + ', wanted ' + JSON.stringify(w));
  }

  function has(name, haystack, needle) {
    return ok(name, String(haystack).indexOf(needle) >= 0, 'did not contain ' + JSON.stringify(needle));
  }

  function done() {
    failures.forEach(f => console.log('FAIL ' + f));
    console.log(`${title}: ${pass} passed, ${failures.length} failed`);
    if (failures.length) process.exit(1);
  }

  return { ok, eq, has, done, count: () => pass };
}

module.exports = { loadApp, runner, nodeText };
