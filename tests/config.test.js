const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_DIR = path.join(os.tmpdir(), 'auto-shutdown-test-' + Date.now());
const TEST_CONFIG = path.join(TEST_DIR, 'config.json');

describe('config', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('returns defaults when config file does not exist', () => {
    const { loadConfig } = require('../server/config');
    const config = loadConfig(TEST_CONFIG);
    assert.strictEqual(config.port, 3000);
    assert.strictEqual(config.interface, '');
    assert.strictEqual(config.startWithWindows, false);
  });

  it('reads config from file', () => {
    fs.writeFileSync(TEST_CONFIG, JSON.stringify({ port: 8080, interface: 'Ethernet', startWithWindows: true }));
    const { loadConfig } = require('../server/config');
    const config = loadConfig(TEST_CONFIG);
    assert.strictEqual(config.port, 8080);
    assert.strictEqual(config.interface, 'Ethernet');
    assert.strictEqual(config.startWithWindows, true);
  });

  it('saves config to file', () => {
    const { saveConfig } = require('../server/config');
    saveConfig(TEST_CONFIG, { port: 9090, interface: 'Wi-Fi', startWithWindows: false });
    const data = JSON.parse(fs.readFileSync(TEST_CONFIG, 'utf8'));
    assert.strictEqual(data.port, 9090);
  });

  it('merges partial updates with existing config', () => {
    fs.writeFileSync(TEST_CONFIG, JSON.stringify({ port: 3000, interface: 'Wi-Fi', startWithWindows: false }));
    const { loadConfig, saveConfig } = require('../server/config');
    const current = loadConfig(TEST_CONFIG);
    saveConfig(TEST_CONFIG, { ...current, port: 4000 });
    const updated = loadConfig(TEST_CONFIG);
    assert.strictEqual(updated.port, 4000);
    assert.strictEqual(updated.interface, 'Wi-Fi');
  });
});
