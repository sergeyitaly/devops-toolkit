# Security

## What this is

A static HTML page with no backend, no accounts, no third-party code and no
network calls. Everything typed into it is processed in the tab and never
leaves the device. There is no server to attack and no data at rest to steal,
which removes most of the usual list and leaves a short one worth writing down.

## What is enforced, and how it is checked

| Risk | What prevents it | Checked by |
|---|---|---|
| Injected code running | Hash-pinned Content-Security-Policy, no `unsafe-inline`, no `unsafe-eval` | `test/security.test.js`, `tools/csp.mjs --check` |
| Dynamic code execution | No `eval`, `new Function`, `document.write` or string timers | regex test |
| HTML injection through a DOM sink | Every value is placed with `textContent`; the page never touches `innerHTML` | regex test |
| Third-party code | No `<script src>`, no CDN, no web fonts, no analytics, no `fetch` from the page | regex test |
| Inline event handlers | None in the markup; every listener is attached in code | regex test |
| Weak randomness | UUIDs and passwords come from `crypto.getRandomValues`; there is no `Math.random` fallback | regex test |
| Over-broad caching | The service worker ignores non-GET and cross-origin requests | regex test |
| Clickjacking | `frame-ancestors 'none'` | regex test |
| Untrusted stored input | The single stored value is validated against the tool list before use | unit test |
| Supply chain | No dependencies at all | nothing to check |
| Unknown issues | CodeQL `security-extended`, on every push and weekly | workflow |

`npm test` runs 528 assertions across the engine, the UI and these checks, and
CI runs the same on every push and pull request.

## What a static host cannot do

GitHub Pages serves files and cannot send response headers, so:

- The Content-Security-Policy is delivered in a `<meta>` tag. Current browsers
  honour it, including `frame-ancestors`.
- `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and a site-owned
  HSTS policy need headers and are simply unavailable here. Pages does serve
  HTTPS, and `*.github.io` is on the HSTS preload list.
- There is no way to pin a subresource that a browser extension injects. An
  extension with access to the page can do whatever it likes, on this page as
  on any other.

## What is stored

One `localStorage` entry, `devops-pocket-toolkit.v1`, containing the id of the
tool that was open last. It is read back through a check against the list of
known tools, because a stored value is the one input an attacker with the
device - or a buggy earlier version of this page - can control.

Nothing else is stored: no history, no inputs, no cookies, no IndexedDB. The
tools selected for installing are kept in memory for that sitting only.

Note that every project page published under one `github.io` account shares a
single origin, so that storage namespace is shared with anything else published
from the same account. That is why the key carries the project name.

## Honest limits

- **The JWT decoder does not verify signatures.** It decodes and displays. A
  token it shows as well-formed may be forged; only the issuing service can say.
- **The YAML validator covers a documented subset.** Anchors, aliases, explicit
  tags and complex keys are reported as unsupported rather than guessed at, so
  a document using them is not fully checked.
- **The regex tester runs your pattern in your tab.** A pattern with
  catastrophic backtracking can freeze the page until it is closed. Input is
  capped to reduce the odds, not to eliminate them.
- **Passwords are only as private as the device.** They are generated locally
  and never transmitted, but they are on screen and in the clipboard.

No one can honestly promise a page has no vulnerabilities. The claims above are
the ones that can be checked, and the checks run on every push.

## Reporting something

Open an issue, or use GitHub's private vulnerability reporting on the
repository. There is no server and no user data, so the realistic severity
ceiling is "this page does something wrong on the device of whoever opened it" -
which is still worth fixing.
