const path = require('path');
const { exec } = require('child_process');
const { getLocalIp } = require('./api');
const { loadConfig, saveConfig } = require('./config');
const { isAutoStartEnabled, enableAutoStart, disableAutoStart } = require('./startup');

let systrayInstance = null;

async function createTray(options = {}) {
  const { onQuit, getPort = () => 3000 } = options;

  const SysTray = require('systray2').default || require('systray2');

  const config = loadConfig();
  const ip = getLocalIp();
  const port = getPort();
  const autoStart = await isAutoStartEnabled();

  const systray = new SysTray({
    menu: {
      icon: getIconBase64(),
      title: 'Auto Shutdown',
      tooltip: `Auto Shutdown - ${ip}:${port}`,
      items: [
        { title: `${ip}:${port}`, tooltip: 'Server address', enabled: false },
        { title: 'Network Settings', tooltip: 'Open network settings in browser', enabled: true },
        { title: autoStart ? '✓ Start with Windows' : '  Start with Windows', tooltip: 'Toggle auto-start', enabled: true },
        { title: 'Open in Browser', tooltip: 'Open the app', enabled: true },
        { title: 'Quit', tooltip: 'Stop server and exit', enabled: true },
      ],
    },
  });

  systray.onClick(async (action) => {
    switch (action.seq_id) {
      case 1:
        exec(`start http://${ip}:${port}/#settings`);
        break;

      case 2: {
        const enabled = await isAutoStartEnabled();
        if (enabled) {
          await disableAutoStart();
        } else {
          await enableAutoStart(process.execPath);
        }
        const nowEnabled = await isAutoStartEnabled();
        systray.sendAction({
          type: 'update-item',
          item: { title: nowEnabled ? '✓ Start with Windows' : '  Start with Windows', tooltip: 'Toggle auto-start', enabled: true },
          seq_id: 2,
        });
        break;
      }

      case 3:
        exec(`start http://${ip}:${port}`);
        break;

      case 4:
        if (onQuit) await onQuit();
        systray.kill(false);
        process.exit(0);
        break;
    }
  });

  systrayInstance = systray;
  return systray;
}

function getIconBase64() {
  // Try to load icon.ico from resources/ and convert to base64
  const icoPath = getIconPath();
  try {
    const data = require('fs').readFileSync(icoPath);
    return data.toString('base64');
  } catch {
    // Return empty string if icon not found (systray2 will use default)
    return '';
  }
}

function getIconPath() {
  const devPath = path.join(__dirname, '..', 'resources', 'icon.ico');
  const pkgPath = path.join(path.dirname(process.execPath), 'resources', 'icon.ico');

  try {
    require('fs').accessSync(pkgPath);
    return pkgPath;
  } catch {
    return devPath;
  }
}

function updateTrayUrl(ip, port) {
  if (systrayInstance) {
    systrayInstance.sendAction({
      type: 'update-item',
      item: { title: `${ip}:${port}`, tooltip: 'Server address', enabled: false },
      seq_id: 0,
    });
  }
}

module.exports = { createTray, updateTrayUrl };
