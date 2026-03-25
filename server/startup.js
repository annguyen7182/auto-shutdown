const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const TASK_NAME = 'AutoShutdownServer';

async function isAutoStartEnabled() {
  try {
    await execFileAsync('schtasks', ['/query', '/tn', TASK_NAME]);
    return true;
  } catch {
    return false;
  }
}

async function enableAutoStart(exePath) {
  // Use VBS launcher to run the exe without a console window
  const path = require('path');
  const vbsPath = path.join(path.dirname(exePath), 'auto-shutdown.vbs');
  await execFileAsync('schtasks', [
    '/create', '/tn', TASK_NAME,
    '/tr', `wscript.exe "${vbsPath}"`,
    '/sc', 'onlogon',
    '/rl', 'highest',
    '/f',
  ]);
}

async function disableAutoStart() {
  try {
    await execFileAsync('schtasks', ['/delete', '/tn', TASK_NAME, '/f']);
  } catch {
    // Already gone
  }
}

module.exports = { isAutoStartEnabled, enableAutoStart, disableAutoStart, TASK_NAME };
