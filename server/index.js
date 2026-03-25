const path = require('path');
const express = require('express');
const { isElevated, relaunchElevated } = require('./elevate');
const { loadConfig } = require('./config');
const { createRoutes, getLocalIp } = require('./api');
const { ensureFirewallRule } = require('./network');
const { createTray, updateTrayUrl } = require('./tray');

const isDev = process.argv.includes('--dev');

async function main() {
  let elevated = isElevated();
  if (!isDev && !elevated) {
    console.log('Not running as admin. Requesting elevation...');
    try {
      relaunchElevated();
      return;
    } catch {
      console.warn('UAC declined. Running in limited mode (power/network commands disabled).');
    }
  }

  const config = loadConfig();
  let port = config.port || 3000;

  // Disable hibernate to ensure sleep works correctly
  try {
    require('child_process').execFileSync('powercfg', ['/h', 'off']);
    console.log('Hibernate disabled (ensures true sleep behavior)');
  } catch (err) {
    console.error(`Failed to disable hibernate: ${err.message}`);
  }

  // Ensure firewall rule
  try {
    await ensureFirewallRule(port);
    console.log(`Firewall rule ensured for port ${port}`);
  } catch (err) {
    console.error(`Failed to set firewall rule: ${err.message}`);
    console.error('You may need to manually allow port', port, 'in Windows Firewall');
  }

  // Create Express app
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  createRoutes(app, {
    testMode: isDev,
    getPort: () => port,
  });

  // Start server
  let server;
  try {
    server = await new Promise((resolve, reject) => {
      const s = app.listen(port, '0.0.0.0', () => resolve(s));
      s.on('error', reject);
    });
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} in use. Trying next available...`);
      server = await new Promise((resolve) => {
        const s = app.listen(0, '0.0.0.0', () => resolve(s));
      });
      port = server.address().port;
    } else {
      throw err;
    }
  }

  const ip = getLocalIp();
  console.log(`Auto Shutdown server running at http://${ip}:${port}`);

  // Watch config for port changes
  const { getDefaultConfigPath } = require('./config');
  const fs = require('fs');
  const configDir = path.dirname(getDefaultConfigPath());
  // Ensure config directory exists before watching
  fs.mkdirSync(configDir, { recursive: true });
  let restartTimeout = null;
  fs.watch(configDir, { persistent: false }, (eventType, filename) => {
    if (filename === 'config.json' && !restartTimeout) {
      restartTimeout = setTimeout(async () => {
        restartTimeout = null;
        const newConfig = loadConfig();
        if (newConfig.port !== port) {
          console.log(`Port changed from ${port} to ${newConfig.port}. Restarting...`);
          server.close();
          port = newConfig.port;
          await ensureFirewallRule(port);
          server = app.listen(port, '0.0.0.0', () => {
            const newIp = getLocalIp();
            console.log(`Server restarted at http://${newIp}:${port}`);
            updateTrayUrl(newIp, port);
          });
        }
      }, 500);
    }
  });

  // Graceful shutdown handler
  async function gracefulShutdown() {
    console.log('Shutting down gracefully...');
    server.close();
    await new Promise(resolve => setTimeout(resolve, 2000));
    process.exit(0);
  }

  // Start system tray (skip in dev mode for now if systray2 not available)
  try {
    await createTray({
      onQuit: gracefulShutdown,
      getPort: () => port,
    });
  } catch (err) {
    console.error(`Tray icon failed: ${err.message}`);
    console.log('Server is still running. Access at:', `http://${ip}:${port}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
