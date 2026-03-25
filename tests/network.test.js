const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('network validation', () => {
  it('validates correct IPv4 addresses', () => {
    const { isValidIPv4 } = require('../server/network');
    assert.strictEqual(isValidIPv4('192.168.1.1'), true);
    assert.strictEqual(isValidIPv4('10.0.0.1'), true);
    assert.strictEqual(isValidIPv4('255.255.255.0'), true);
  });

  it('rejects invalid IPv4 addresses', () => {
    const { isValidIPv4 } = require('../server/network');
    assert.strictEqual(isValidIPv4('256.1.1.1'), false);
    assert.strictEqual(isValidIPv4('1.2.3'), false);
    assert.strictEqual(isValidIPv4('abc.def.ghi.jkl'), false);
    assert.strictEqual(isValidIPv4('1.2.3.4; rm -rf /'), false);
    assert.strictEqual(isValidIPv4(''), false);
    assert.strictEqual(isValidIPv4('1.2.3.4 & del'), false);
  });

  it('parses netsh interface list output', () => {
    const { parseInterfaces } = require('../server/network');
    const output = `
Idx     Met         MTU          State                Name
---  ----------  ----------  ------------  ---------------------------
  1          75  4294967295  connected     Loopback Pseudo-Interface 1
  6          25        1500  connected     Wi-Fi
 12          25        1500  disconnected  Ethernet
 18          15        1500  connected     vEthernet (WSL)
`;
    const ifaces = parseInterfaces(output);
    assert.ok(ifaces.find(i => i.name === 'Wi-Fi'));
    assert.ok(!ifaces.find(i => i.name === 'Loopback Pseudo-Interface 1'));
  });

  it('parses netsh ip config output', () => {
    const { parseIpConfig } = require('../server/network');
    const output = `
Configuration for interface "Wi-Fi"
    DHCP enabled:                         No
    IP Address:                           192.168.1.50
    Subnet Prefix:                        192.168.1.0/24 (mask 255.255.255.0)
    Default Gateway:                      192.168.1.1
`;
    const config = parseIpConfig(output);
    assert.strictEqual(config.ip, '192.168.1.50');
    assert.strictEqual(config.subnet, '255.255.255.0');
    assert.strictEqual(config.gateway, '192.168.1.1');
    assert.strictEqual(config.dhcp, false);
  });

  it('parses DHCP-enabled config', () => {
    const { parseIpConfig } = require('../server/network');
    const output = `
Configuration for interface "Wi-Fi"
    DHCP enabled:                         Yes
    IP Address:                           192.168.1.100
    Subnet Prefix:                        192.168.1.0/24 (mask 255.255.255.0)
    Default Gateway:                      192.168.1.1
`;
    const config = parseIpConfig(output);
    assert.strictEqual(config.dhcp, true);
    assert.strictEqual(config.ip, '192.168.1.100');
  });
});
