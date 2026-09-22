/* One icon per tool, plus the manifest "shortcuts" entries that use them.

     node tools/tool-icons.mjs            render icons/tools/*.png and rewrite
                                          the shortcuts array in the manifest
     node tools/tool-icons.mjs --check    fail if either is out of date

   The table below is the single source of truth for the icon set and the
   shortcuts; test/security.test.js checks it still matches the tools the page
   actually registers, so adding a tool without an icon fails CI.

   Why this exists: a phone home screen holds one icon per installed web app,
   and nothing a web page can do creates a folder. What it can do is make each
   tool separately installable with its own icon, and offer Android a shortcut
   menu on long-press. The folder is then something the person makes by
   dragging icons together, the same as for any other app.
*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT_DIR = path.join(ROOT, 'icons', 'tools');
const MANIFEST = path.join(ROOT, 'manifest.webmanifest');
const SIZE = 192;

export const TOOL_ICONS = [
  { id: 'cidr', name: 'CIDR Calculator', short: 'CIDR', label: '/22', colour: '#5eead4', description: 'Network, broadcast, mask and host range' },
  { id: 'subnet', name: 'Subnet Splitter', short: 'Subnets', label: 'SUB', colour: '#38bdf8', description: 'Carve a block into equal subnets' },
  { id: 'base64', name: 'Base64', short: 'Base64', label: 'B64', colour: '#a78bfa', description: 'Encode and decode base64' },
  { id: 'url', name: 'URL Encoder', short: 'URL', label: '%20', colour: '#f472b6', description: 'Percent-encoding and query parsing' },
  { id: 'regex', name: 'Regex Tester', short: 'Regex', label: '.*', colour: '#fb923c', description: 'Matches, groups and replacements' },
  { id: 'jwt', name: 'JWT Decoder', short: 'JWT', label: 'JWT', colour: '#facc15', description: 'Header, claims and expiry' },
  { id: 'time', name: 'Unix Timestamp', short: 'Epoch', label: 'TS', colour: '#4ade80', description: 'Epoch to date, and back' },
  { id: 'uuid', name: 'UUID Generator', short: 'UUID', label: 'UID', colour: '#22d3ee', description: 'Random v4 and time-ordered v7' },
  { id: 'password', name: 'Password Generator', short: 'Password', label: '***', colour: '#f87171', description: 'Random secrets with an entropy figure' },
  { id: 'hash', name: 'Hash Calculator', short: 'Hash', label: '#', colour: '#c084fc', description: 'MD5, SHA-1 and SHA-256' },
  { id: 'json', name: 'JSON Formatter', short: 'JSON', label: '{ }', colour: '#fbbf24', description: 'Pretty-print, minify, find the error' },
  { id: 'yaml', name: 'YAML Validator', short: 'YAML', label: 'YML', colour: '#34d399', description: 'Errors by line, and the JSON it means' }
];

export function iconSvg(tool) {
  /* The colour fills the whole square: Android may crop a shortcut icon to a
     circle, and a glyph inside the middle 60% survives that. textLength keeps
     labels of different widths optically the same size. */
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="192" height="192">
  <rect width="192" height="192" fill="${tool.colour}"/>
  <rect x="14" y="14" width="164" height="164" rx="38" fill="none" stroke="#06231f" stroke-opacity="0.18" stroke-width="4"/>
  <text x="96" y="104" text-anchor="middle" dominant-baseline="central"
        font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
        font-size="58" font-weight="700" fill="#06231f"
        textLength="${tool.label.length <= 1 ? 52 : 108}" lengthAdjust="spacingAndGlyphs">${tool.label}</text>
</svg>`;
}

export function shortcuts() {
  return TOOL_ICONS.map(tool => ({
    name: tool.name,
    short_name: tool.short,
    description: tool.description,
    url: './#/' + tool.id,
    icons: [{ src: './icons/tools/' + tool.id + '.png', sizes: SIZE + 'x' + SIZE, type: 'image/png' }]
  }));
}

function findBrowser() {
  const candidates = process.platform === 'win32'
    ? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
       'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
       'C:/Program Files/Google/Chrome/Application/chrome.exe',
       'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
         '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
         '/Applications/Chromium.app/Contents/MacOS/Chromium']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
         '/usr/bin/microsoft-edge', '/snap/bin/chromium'];
  return (process.env.CHROME || '').trim() || candidates.find(p => fs.existsSync(p));
}

function writeManifestShortcuts() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  manifest.shortcuts = shortcuts();
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
}

const check = process.argv.includes('--check');

if (check) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const missing = TOOL_ICONS.filter(tool => !fs.existsSync(path.join(OUT_DIR, tool.id + '.png')));
  if (missing.length) {
    console.error('missing tool icons: ' + missing.map(t => t.id).join(', ') + '\nRun: npm run icons');
    process.exit(1);
  }
  if (JSON.stringify(manifest.shortcuts) !== JSON.stringify(shortcuts())) {
    console.error('the manifest shortcuts are out of date. Run: npm run icons');
    process.exit(1);
  }
  console.log('Tool icons and manifest shortcuts are current (' + TOOL_ICONS.length + ' tools).');
  process.exit(0);
}

const browser = findBrowser();
if (!browser) {
  console.error('No Chrome, Chromium or Edge found. Set CHROME=/path/to/browser.');
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-icons-'));
const force = process.argv.includes('--force');
let total = 0;
let made = 0;

/* A headless browser start-up occasionally stalls for no reason anyone can
   reproduce. Rendering is idempotent, so: skip what already exists, and try a
   stalled one again with a clean profile rather than failing a whole run of
   twelve on the eleventh. */
function render(tool, attempt) {
  const page = `<!DOCTYPE html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;width:${SIZE}px;height:${SIZE}px;overflow:hidden}
svg{display:block;width:${SIZE}px;height:${SIZE}px}</style>
${iconSvg(tool)}`;
  const file = path.join(tmp, tool.id + '.html');
  fs.writeFileSync(file, page);
  const out = path.join(OUT_DIR, tool.id + '.png');
  try {
    execFileSync(browser, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--force-device-scale-factor=1',
      '--virtual-time-budget=1500',
      '--user-data-dir=' + path.join(tmp, 'profile-' + tool.id + '-' + attempt),
      '--window-size=' + SIZE + ',' + SIZE,
      '--screenshot=' + out,
      'file:///' + file.replaceAll('\\', '/')
    ], { stdio: 'ignore', timeout: 60000 });
  } catch (e) {
    return false;
  }
  return fs.existsSync(out);
}

for (const tool of TOOL_ICONS) {
  const out = path.join(OUT_DIR, tool.id + '.png');
  if (!force && fs.existsSync(out)) {
    total += fs.statSync(out).size;
    console.log(tool.id.padEnd(10) + 'already rendered');
    continue;
  }
  let ok = false;
  for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
    ok = render(tool, attempt);
    if (!ok) console.log(tool.id.padEnd(10) + 'attempt ' + attempt + ' did not finish, trying again');
  }
  if (!ok) {
    console.error('could not render ' + tool.id + ' after three attempts. Run the command again - finished icons are kept.');
    process.exit(1);
  }
  made++;
  total += fs.statSync(out).size;
  console.log(tool.id.padEnd(10) + fs.statSync(out).size + ' bytes');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(made + ' rendered this run.');
writeManifestShortcuts();
console.log('\n' + TOOL_ICONS.length + ' tool icons, ' + (total / 1024).toFixed(1) + ' KB total.');
console.log('manifest.webmanifest shortcuts updated.');
