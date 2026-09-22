/* Assembles index.html from the parts in src/.
   There is no bundler and no transform: the output is the input files
   concatenated, which keeps "what you edit is what ships" true while
   still allowing the page to be edited in pieces small enough to reason
   about.

     node tools/build.mjs            write index.html
     node tools/build.mjs --check    fail if index.html is out of date

   Run tools/csp.mjs afterwards - the inline script hash changes with
   every edit. `npm run build` does both.
*/
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'index.html');

const SCRIPT_PARTS = [
  '00-core.js',
  '10-net.js',
  '20-hash.js',
  '30-encode.js',
  '40-time-id.js',
  '50-format.js',
  '60-ui.js',
  '70-tools-net.js',
  '72-tools-text.js',
  '74-tools-gen.js',
  '76-tools-data.js',
  '80-app.js'
];

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function assemble() {
  const head = read(path.join(SRC, 'head.html'));
  const style = read(path.join(SRC, 'style.css'));
  const body = read(path.join(SRC, 'body.html'));
  const script = SCRIPT_PARTS.map(name => read(path.join(SRC, 'app', name))).join('\n');
  return head + style + body + script + '</script>\n</body>\n</html>\n';
}

const built = assemble();
const check = process.argv.includes('--check');

if (check) {
  const current = fs.existsSync(OUT) ? read(OUT) : '';
  /* the CSP meta tag is rewritten in index.html after assembly, so compare
     everything except that one line */
  const strip = text => text.replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/, '');
  if (strip(current) !== strip(built)) {
    console.error('index.html is out of date. Run: npm run build');
    process.exit(1);
  }
  console.log('index.html matches the parts in src/.');
  process.exit(0);
}

const previous = fs.existsSync(OUT) ? read(OUT) : '';
const keepCsp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(previous);
let output = built;
if (keepCsp) {
  output = output.replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/,
    `<meta http-equiv="Content-Security-Policy" content="${keepCsp[1]}">`);
}

fs.writeFileSync(OUT, output);
const kb = (Buffer.byteLength(output, 'utf8') / 1024).toFixed(1);
console.log(`index.html written: ${kb} KB from ${SCRIPT_PARTS.length + 3} parts.`);
