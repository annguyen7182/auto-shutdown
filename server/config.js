const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  port: 3000,
  interface: '',
  startWithWindows: false,
};

function getDefaultConfigPath() {
  const appData = process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'AutoShutdown', 'config.json');
}

function loadConfig(configPath) {
  configPath = configPath || getDefaultConfigPath();
  try {
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return { ...DEFAULTS, ...data };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveConfig(configPath, config) {
  configPath = configPath || getDefaultConfigPath();
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

module.exports = { loadConfig, saveConfig, getDefaultConfigPath, DEFAULTS };
