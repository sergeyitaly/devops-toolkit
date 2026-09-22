
/* ------------------------------------------------------------------ *
 * The tools. Each one registers itself with an id, a name, the words
 * the search box matches against, and a build(root) that fills its
 * panel. Panels are built once, on first open, and kept.
 * ------------------------------------------------------------------ */

var TOOLS = [];

function renderAddressInfo(out, info) {
  clear(out);
  var box = card(out, info.version === 4 ? 'IPv4 /' + info.prefix : 'IPv6 /' + info.prefix);

  if (info.version === 4) {
    outRow(box, 'Network').set(info.cidr, 'accent');
    outRow(box, 'Netmask').set(info.mask);
    outRow(box, 'Wildcard').set(info.wildcard);
    outRow(box, 'Broadcast').set(info.broadcast);
    outRow(box, 'Host range').set(info.firstHost + ' - ' + info.lastHost);
    outRow(box, 'Usable hosts').set(groupDigits(info.usable), 'good');
    outRow(box, 'Total addresses').set(groupDigits(info.total));
    outRow(box, 'Type').set(info.scope.name + (info.scope.ref ? ' (' + info.scope.ref + ')' : ''), info.scope.routable ? '' : 'warn');
    outRow(box, 'Class').set(info.klass);

    var detail = card(out, 'The address you typed');
    outRow(detail, 'Address').set(info.input);
    outRow(detail, 'Integer').set(groupDigits(info.integer));
    outRow(detail, 'Hex').set(info.hex);
    outRow(detail, 'Binary').set(info.binary);
    outRow(detail, 'Mask bits').set(info.maskBits);
    outRow(detail, 'Reverse DNS').set(info.arpa);
    if (info.isNetworkAddress) noteLine(detail, 'That is the network address of the block, so it cannot be assigned to a host.');
    if (info.isBroadcastAddress) noteLine(detail, 'That is the broadcast address of the block, so it cannot be assigned to a host.');
    if (info.note) noteLine(detail, info.note);
    return;
  }

  outRow(box, 'Network').set(info.cidr, 'accent');
  outRow(box, 'First address').set(info.first);
  outRow(box, 'Last address').set(info.last);
  outRow(box, 'Total addresses').set(groupDigits(info.total), 'good');
  outRow(box, '/64 subnets inside').set(groupDigits(info.subnetsIn64));
  outRow(box, 'Type').set(info.scope.name + (info.scope.ref ? ' (' + info.scope.ref + ')' : ''), info.scope.routable ? '' : 'warn');

  var d6 = card(out, 'The address you typed');
  outRow(d6, 'Compressed').set(info.compressed);
  outRow(d6, 'Expanded').set(info.expanded);
  if (info.zone) outRow(d6, 'Zone').set('%' + info.zone);
  outRow(d6, 'Integer').set(info.integer);
  outRow(d6, 'Hex').set(info.hex);
  outRow(d6, 'Reverse DNS').set(info.arpa);
  noteLine(d6, 'IPv6 has no broadcast address and no reserved network address, so every address in the prefix is usable.');
}

TOOLS.push({
  id: 'cidr',
  name: 'CIDR Calculator',
  blurb: 'Network, broadcast, mask, host range',
  keywords: 'cidr ip ipv4 ipv6 netmask wildcard broadcast prefix network mask arpa ptr rfc1918 private',
  build: function (root) {
    var input = field(root, 'Address or CIDR', {
      placeholder: '10.0.0.0/22',
      value: '10.0.0.0/22',
      inputmode: 'text'
    });
    var tools = buttonRow(root);
    pasteButton(tools, input, function () { update(); });
    button(tools, 'Clear', function () { input.value = ''; update(); });
    examples(root, ['10.0.0.0/22', '192.168.1.130/26', '172.16.5.9/255.255.0.0', '100.64.0.1/10', '2001:db8::/48', 'fe80::1/64'], function (value) {
      input.value = value;
      update();
    });
    helpBlock(root, [
      'Type an address with or without a prefix. A bare address is treated as a /32 (IPv4) or /128 (IPv6).',
      'A netmask works in place of the prefix: 10.0.0.0/255.255.252.0, or with a space between them, as router output prints it.',
      'Usable hosts excludes the network and broadcast addresses - except on a /31, which has neither (RFC 3021), and a /32, which is a single host.',
      'Type tells you whether the block is routable on the internet: private (RFC 1918), carrier-grade NAT, link-local, documentation and multicast ranges are all called out.',
      'Tap any value to copy it.'
    ]);
    var err = messageBox(root, 'err');
    var out = add(root, el('div'));

    function update() {
      var res = analyseAddress(input.value);
      if (!res.ok) {
        err.set(res.error);
        clear(out);
        return;
      }
      err.set('');
      renderAddressInfo(out, res.info);
    }

    on(input, 'input', update);
    update();
    return { update: update, input: input };
  }
});

TOOLS.push({
  id: 'subnet',
  name: 'Subnet Splitter',
  blurb: 'Carve a block into equal subnets',
  keywords: 'subnet split vlsm ipv4 ipv6 prefix divide slash blocks hosts vpc',
  build: function (root) {
    var input = field(root, 'Block to split', { placeholder: '10.0.0.0/22', value: '10.0.0.0/22' });
    var row = add(root, el('div', 'inline'));
    var prefix = field(row, 'Into prefix', { type: 'number', value: 24, min: 0, max: 128, inputmode: 'numeric' });
    var hosts = field(row, 'Or: hosts needed per subnet', { type: 'number', placeholder: '500', inputmode: 'numeric' });

    var tools = buttonRow(root);
    pasteButton(tools, input, function () { update(); });
    button(tools, 'Clear', function () { input.value = ''; update(); });
    examples(root, ['10.0.0.0/16', '10.0.0.0/22', '192.168.0.0/24', '2001:db8::/48'], function (value) {
      input.value = value;
      update();
    });
    helpBlock(root, [
      'Give it a block and the prefix to cut it into: /22 into /24 gives four subnets.',
      'Or type how many hosts each subnet needs and the prefix is chosen for you - the smallest one that still fits them plus the network and broadcast addresses.',
      'At most 256 subnets are listed; the summary always says how many there are in total.',
      'IPv6 works the same way, with exact counts rather than scientific notation - a /48 cut into /52 gives sixteen blocks of 2^76 addresses each.',
      'Tap any row to copy it.'
    ]);

    var err = messageBox(root, 'err');
    var summary = card(root, 'Summary');
    var parentRow = outRow(summary, 'Parent block');
    var sizeRow = outRow(summary, 'Each subnet');
    var countRow = outRow(summary, 'Subnets');
    var hostRow = outRow(summary, 'Usable hosts each');
    var listCard = card(root, 'Subnets');
    var list = table(listCard, ['Subnet', 'First', 'Last', 'Hosts']);
    var more = noteLine(listCard, '');

    on(hosts, 'input', function () {
      var wanted = parseInt(hosts.value, 10);
      if (!isNaN(wanted) && wanted > 0 && !looksV6(input.value)) {
        prefix.value = String(prefixForHosts(wanted));
        update();
      }
    });

    function update() {
      var want = parseInt(prefix.value, 10);
      if (isNaN(want)) {
        err.set('Enter the prefix length to split into.');
        return;
      }
      var res = splitSubnets(input.value, want);
      if (!res.ok) {
        err.set(res.error);
        list.clear();
        more.textContent = '';
        return;
      }
      err.set('');
      parentRow.set(res.parent);
      sizeRow.set('/' + want);
      countRow.set(res.total, 'accent');
      hostRow.set(res.subnets.length ? res.subnets[0].hosts : '-');
      list.clear();
      res.subnets.forEach(function (s) { list.row([s.cidr, s.first, s.last, s.hosts]); });
      more.textContent = res.truncated
        ? 'Showing the first ' + res.shown + ' of ' + res.total + ' subnets.'
        : 'All ' + res.total + ' subnets are listed.';
    }

    on(input, 'input', update);
    on(prefix, 'input', update);
    update();
    return { update: update, input: input };
  }
});
