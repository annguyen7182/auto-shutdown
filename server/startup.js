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
  await execFileAsync('schtasks', [
    '/create', '/tn', TASK_NAME,
    '/tr', `"${exePath}"`,
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
