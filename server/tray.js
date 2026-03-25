const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { getLocalIp } = require('./api');
const { loadConfig, saveConfig } = require('./config');
const { isAutoStartEnabled, enableAutoStart, disableAutoStart } = require('./startup');

let systrayInstance = null;

// When running inside a pkg binary, systray2's tray binary is trapped
// inside the virtual snapshot filesystem and can't be spawned.
// We extract it to a real temp directory before use.
function ensureTrayBinary() {
  const os = require('os');
  const binName = 'tray_windows_release.exe';

  // Check if already in cwd/traybin/ (works for both dev and extracted scenarios)
  const cwdBin = path.join(process.cwd(), 'traybin', binName);
  if (fs.existsSync(cwdBin)) return; // systray2 will find it here

  // Inside pkg: __dirname is in the snapshot. Copy binary to a real location.
  const snapshotBin = path.join(__dirname, '..', 'node_modules', 'systray2', 'traybin', binName);
  if (!fs.existsSync(snapshotBin)) {
    // Not in pkg, or binary not found — let systray2 handle it
    return;
  }

  // Extract to temp dir and set CWD traybin
  const extractDir = path.join(os.tmpdir(), 'auto-shutdown-tray');
  const extractBinDir = path.join(extractDir, 'traybin');
  const extractBinPath = path.join(extractBinDir, binName);

  if (!fs.existsSync(extractBinPath)) {
    fs.mkdirSync(extractBinDir, { recursive: true });
    fs.copyFileSync(snapshotBin, extractBinPath);
  }

  // systray2 checks ./traybin/ relative to cwd first, so change cwd
  process.chdir(extractDir);
}

async function createTray(options = {}) {
  const { onQuit, getPort = () => 3000 } = options;

  // Ensure tray binary is accessible before loading systray2
  ensureTrayBinary();

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
  const icoPath = getIconPath();
  try {
    const data = fs.readFileSync(icoPath);
    return data.toString('base64');
  } catch {
    return '';
  }
}

function getIconPath() {
  const devPath = path.join(__dirname, '..', 'resources', 'icon.ico');
  const pkgPath = path.join(path.dirname(process.execPath), 'resources', 'icon.ico');

  try {
    fs.accessSync(pkgPath);
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
