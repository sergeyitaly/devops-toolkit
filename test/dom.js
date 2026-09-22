/* A stub DOM: only the parts the page actually touches, so its script can
   run under Node and be tested against the file that ships. Elements with an
   id are taken from the markup of index.html itself, which keeps this in
   step with the page instead of drifting from it. */
'use strict';

function makeNode(tag, dom) {
  const node = {
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    childNodes: [],
    attributes: {},
    listeners: {},
    className: '',
    hidden: false,
    value: '',
    checked: false,
    style: {},
    dataset: {},
    dom: dom
  };

  Object.defineProperty(node, 'textContent', {
    get() {
      if (node.childNodes.length === 0) return node._text || '';
      return node.childNodes.map(c => (c.nodeType === 3 ? c._text : c.textContent)).join('');
    },
    set(value) {
      node.childNodes = [];
      node._text = value === undefined || value === null ? '' : String(value);
    }
  });

  Object.defineProperty(node, 'firstChild', { get() { return node.childNodes[0] || null; } });
  Object.defineProperty(node, 'children', { get() { return node.childNodes.filter(c => c.nodeType === 1); } });

  node.appendChild = child => {
    node._text = null;                 /* or textContent reads back the stale string */
    node.childNodes.push(child);
    child.parentNode = node;
    return child;
  };
  node.removeChild = child => {
    node.childNodes = node.childNodes.filter(c => c !== child);
    return child;
  };
  node.setAttribute = (name, value) => { node.attributes[name] = String(value); };
  node.getAttribute = name => (name in node.attributes ? node.attributes[name] : null);
  node.addEventListener = (type, handler) => {
    (node.listeners[type] = node.listeners[type] || []).push(handler);
  };
  node.removeEventListener = (type, handler) => {
    node.listeners[type] = (node.listeners[type] || []).filter(h => h !== handler);
  };
  node.fire = (type, event) => {
    (node.listeners[type] || []).forEach(h => h(Object.assign({ target: node, preventDefault() {} }, event || {})));
    return node;
  };
  node.focus = () => { if (dom) dom.document.activeElement = node; };
  node.select = () => {};
  node.getBoundingClientRect = () => ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 });
  return node;
}

/* every text node the page renders, flattened - so an assertion can read
   "Usable hosts 1 022" instead of walking children */
function nodeText(node) {
  if (!node) return '';
  if (node.nodeType === 3) return node._text;
  if (node.hidden) return '';
  if (node.childNodes.length === 0) return node._text || '';
  return node.childNodes.map(nodeText).join(' ').replace(/\s+/g, ' ').trim();
}

function makeDom(html) {
  const dom = {};
  const byId = {};

  const document = {
    activeElement: null,
    listeners: {},
    createElement(tag) { return makeNode(tag, dom); },
    createElementNS(ns, tag) { return makeNode(tag, dom); },
    createTextNode(text) { return { nodeType: 3, _text: String(text), childNodes: [] }; },
    getElementById(id) { return Object.prototype.hasOwnProperty.call(byId, id) ? byId[id] : null; },
    querySelector() { return null; },
    addEventListener(type, handler) {
      (document.listeners[type] = document.listeners[type] || []).push(handler);
    },
    fire(type, event) {
      (document.listeners[type] || []).forEach(h => h(Object.assign({ preventDefault() {} }, event || {})));
    },
    execCommand() { return true; }
  };

  document.body = makeNode('body', dom);
  document.documentElement = makeNode('html', dom);

  /* register the ids that exist in the real markup */
  const markup = html.slice(0, html.indexOf('<script>'));
  /* split on "<" and read each tag, rather than matching tags with one
     regex: a pattern with two open-ended quantifiers around the id is the
     kind of thing CodeQL flags for backtracking, and rightly so */
  markup.split('<').forEach(chunk => {
    const end = chunk.indexOf('>');
    if (end < 0) return;
    const tag = chunk.slice(0, end);
    const nameEnd = tag.search(/\s/);
    const name = nameEnd < 0 ? tag : tag.slice(0, nameEnd);
    if (!/^[a-zA-Z0-9]+$/.test(name)) return;
    const idFound = /\sid="([^"]+)"/.exec(tag);
    if (!idFound) return;
    const node = makeNode(name, dom);
    node.setAttribute('id', idFound[1]);
    node.id = idFound[1];
    node.hidden = /\shidden(\s|=|$)/.test(tag);   /* start as the markup has it */
    byId[idFound[1]] = node;
    document.body.appendChild(node);
  });

  const store = {};
  const localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear() { Object.keys(store).forEach(k => delete store[k]); },
    _store: store
  };

  const window = {
    listeners: {},
    addEventListener(type, handler) {
      (window.listeners[type] = window.listeners[type] || []).push(handler);
    },
    fire(type, event) {
      (window.listeners[type] || []).forEach(h => h(Object.assign({ preventDefault() {} }, event || {})));
    },
    scrollTo() {},
    matchMedia() { return { matches: false, addEventListener() {} }; }
  };

  dom.document = document;
  dom.window = window;
  dom.byId = byId;
  dom.localStorage = localStorage;
  dom.location = { hash: '', href: 'https://example.test/toolkit/' };
  dom.history = { length: 1, back() {} };
  return dom;
}

module.exports = { makeDom, nodeText, makeNode };
