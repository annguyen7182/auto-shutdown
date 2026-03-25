const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

function isValidIPv4(ip) {
  if (typeof ip !== 'string') return false;
  const match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  return match.slice(1).every(octet => {
    const n = parseInt(octet, 10);
    return n >= 0 && n <= 255;
  });
}

function parseInterfaces(output) {
  const lines = output.replace(/\r/g, '').split('\n').slice(3);
  const interfaces = [];
  for (const line of lines) {
    const match = line.match(/^\s*(\d+)\s+\d+\s+\d+\s+(\S+)\s+(.+)$/);
    if (!match) continue;
    const [, idx, state, name] = match;
    const trimmedName = name.trim();
    if (state !== 'connected') continue;
    if (trimmedName.toLowerCase().includes('loopback')) continue;
    if (trimmedName.toLowerCase().startsWith('vethernet')) continue;
    if (trimmedName.toLowerCase().includes('nordlynx')) continue;
    if (trimmedName.toLowerCase().includes('openvpn')) continue;
    interfaces.push({ idx: parseInt(idx), name: trimmedName, state });
  }
  return interfaces;
}

function parseIpConfig(output) {
  const ip = output.match(/IP Address:\s+([\d.]+)/)?.[1] || '';
  const subnet = output.match(/mask\s+([\d.]+)/)?.[1] || '';
  const gateway = output.match(/Default Gateway:\s+([\d.]+)/)?.[1] || '';
  const dhcp = /DHCP enabled:\s+Yes/i.test(output);
  return { ip, subnet, gateway, dhcp };
}

async function getInterfaces() {
  const { stdout } = await execFileAsync('netsh', ['interface', 'ipv4', 'show', 'interfaces']);
  return parseInterfaces(stdout);
}

async function getIpConfig(interfaceName) {
  const { stdout } = await execFileAsync('netsh', ['interface', 'ipv4', 'show', 'config', `name=${interfaceName}`]);
  return { ...parseIpConfig(stdout), interface: interfaceName };
}

async function setStaticIp(interfaceName, ip, subnet, gateway) {
  if (!isValidIPv4(ip) || !isValidIPv4(subnet) || !isValidIPv4(gateway)) {
    throw new Error('Invalid IP address format');
  }
  await execFileAsync('netsh', [
    'interface', 'ipv4', 'set', 'address',
    `name=${interfaceName}`, 'static', ip, subnet, gateway,
  ]);
}

async function setDhcp(interfaceName) {
  await execFileAsync('netsh', [
    'interface', 'ipv4', 'set', 'address',
    `name=${interfaceName}`, 'dhcp',
  ]);
}

async function ensureFirewallRule(port) {
  const ruleName = 'AutoShutdown';
  try {
    const { stdout } = await execFileAsync('netsh', [
      'advfirewall', 'firewall', 'show', 'rule', `name=${ruleName}`,
    ]);
    if (stdout.includes(`${port}`)) return;
    await execFileAsync('netsh', [
      'advfirewall', 'firewall', 'delete', 'rule', `name=${ruleName}`,
    ]);
  } catch {
    // Rule doesn't exist
  }
  await execFileAsync('netsh', [
    'advfirewall', 'firewall', 'add', 'rule',
    `name=${ruleName}`, 'dir=in', 'action=allow',
    'protocol=TCP', `localport=${port}`, 'profile=private',
  ]);
}

async function removeFirewallRule() {
  try {
    await execFileAsync('netsh', [
      'advfirewall', 'firewall', 'delete', 'rule', 'name=AutoShutdown',
    ]);
  } catch {
    // Already gone
  }
}

module.exports = {
  isValidIPv4, parseInterfaces, parseIpConfig,
  getInterfaces, getIpConfig, setStaticIp, setDhcp,
  ensureFirewallRule, removeFirewallRule,
};
