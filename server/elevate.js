const { execSync } = require('child_process');

function isElevated() {
  try {
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function relaunchElevated() {
  const exePath = process.execPath;
  const args = process.argv.slice(1);

  const psArgs = args.length > 0 ? ` -ArgumentList '${args.join("','")}'` : '';
  const cmd = `Start-Process -FilePath '${exePath}'${psArgs} -Verb RunAs -WindowStyle Hidden`;

  try {
    execSync(`powershell -Command "${cmd}"`, { stdio: 'ignore' });
  } catch {
    console.error('Failed to elevate. Please run as administrator.');
  }
  process.exit(0);
}

module.exports = { isElevated, relaunchElevated };
