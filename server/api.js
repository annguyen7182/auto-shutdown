const { execFile } = require('child_process');
const os = require('os');
const { isValidIPv4, getInterfaces, getIpConfig, setStaticIp, setDhcp } = require('./network');
const { loadConfig, saveConfig } = require('./config');

let lastPowerCommand = 0;
const DEBOUNCE_MS = 3000;

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

function createRoutes(app, options = {}) {
  const { testMode = false, getPort = () => 3000 } = options;

  function execPower(command, args, res) {
    const now = Date.now();
    if (now - lastPowerCommand < DEBOUNCE_MS) {
      return res.json({ ok: true, debounced: true });
    }
    lastPowerCommand = now;

    if (testMode) {
      return res.json({ ok: true, testMode: true });
    }

    res.json({ ok: true });
    setTimeout(() => {
      execFile(command, args, (err) => {
        if (err) console.error(`Power command failed: ${err.message}`);
      });
    }, 500);
  }

  app.post('/api/sleep', (req, res) => {
    execPower('powershell', ['-Command', '[System.Windows.Forms.Application]::SetSuspendState("Suspend", $true, $false)'], res);
  });

  app.post('/api/shutdown', (req, res) => {
    execPower('shutdown', ['/s', '/t', '0'], res);
  });

  app.post('/api/restart', (req, res) => {
    execPower('shutdown', ['/r', '/t', '0'], res);
  });

  app.get('/api/status', (req, res) => {
    res.json({
      pcName: os.hostname(),
      uptime: os.uptime(),
      ip: getLocalIp(),
      port: getPort(),
    });
  });

  app.get('/api/network', async (req, res) => {
    try {
      const interfaces = await getInterfaces();
      const config = loadConfig();
      const activeInterface = config.interface || (interfaces[0] && interfaces[0].name) || '';

      if (!activeInterface) {
        return res.json({
          ip: getLocalIp(), subnet: '', gateway: '', dhcp: true,
          interface: '', availableInterfaces: interfaces.map(i => i.name),
        });
      }

      const ipConfig = await getIpConfig(activeInterface);
      res.json({
        ...ipConfig,
        availableInterfaces: interfaces.map(i => i.name),
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message, code: 'NETWORK_ERROR' });
    }
  });

  app.post('/api/network', async (req, res) => {
    try {
      const { mode, ip, subnet, gateway, interface: iface } = req.body || {};

      if (iface) {
        const interfaces = await getInterfaces();
        const valid = interfaces.find(i => i.name === iface);
        if (!valid) {
          return res.status(400).json({ ok: false, error: 'Unknown interface', code: 'INVALID_INTERFACE' });
        }
      }

      const config = loadConfig();
      const targetInterface = iface || config.interface;
      if (!targetInterface) {
        return res.status(400).json({ ok: false, error: 'No interface selected', code: 'NO_INTERFACE' });
      }

      if (iface && iface !== config.interface) {
        saveConfig(null, { ...config, interface: iface });
      }

      if (mode === 'static') {
        if (!isValidIPv4(ip) || !isValidIPv4(subnet) || !isValidIPv4(gateway)) {
          return res.status(400).json({ ok: false, error: 'Invalid IP address format', code: 'INVALID_IP' });
        }
        res.json({ ok: true, newIp: ip, message: `IP changed to ${ip} — reconnect at http://${ip}:${config.port}` });
        setTimeout(() => setStaticIp(targetInterface, ip, subnet, gateway).catch(console.error), 1000);
      } else if (mode === 'dhcp') {
        res.json({ ok: true, message: 'Switching to DHCP — IP may change' });
        setTimeout(() => setDhcp(targetInterface).catch(console.error), 1000);
      } else {
        res.status(400).json({ ok: false, error: 'mode must be "static" or "dhcp"', code: 'INVALID_MODE' });
      }
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message, code: 'NETWORK_ERROR' });
    }
  });

  app.post('/api/config', async (req, res) => {
    try {
      const { port } = req.body || {};
      if (port !== undefined) {
        const p = parseInt(port, 10);
        if (isNaN(p) || p < 1024 || p > 65535) {
          return res.status(400).json({ ok: false, error: 'Port must be 1024-65535', code: 'INVALID_PORT' });
        }
        const config = loadConfig();
        saveConfig(null, { ...config, port: p });
        res.json({ ok: true, message: `Port changed to ${p}. Server will restart.`, newPort: p });
      } else {
        res.status(400).json({ ok: false, error: 'No config fields provided', code: 'EMPTY_CONFIG' });
      }
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message, code: 'CONFIG_ERROR' });
    }
  });
}

module.exports = { createRoutes, getLocalIp };
