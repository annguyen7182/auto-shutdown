const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');

function request(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const options = { hostname: '127.0.0.1', port: 0, path, method };
    options.port = globalThis._testPort;
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('API routes', () => {
  let server;

  before(async () => {
    const express = require('express');
    const { createRoutes } = require('../server/api');
    const app = express();
    app.use(express.json());
    createRoutes(app, { testMode: true });
    server = app.listen(0);
    globalThis._testPort = server.address().port;
  });

  after(() => {
    server.close();
  });

  it('GET /api/status returns pc info', async () => {
    const { status, body } = await request('/api/status');
    assert.strictEqual(status, 200);
    assert.ok(body.pcName);
    assert.ok(typeof body.uptime === 'number');
    assert.ok(body.ip);
    assert.ok(body.port);
  });

  it('POST /api/sleep returns ok in test mode', async () => {
    const { status, body } = await request('/api/sleep', 'POST');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.testMode, true);
  });

  it('POST /api/shutdown returns ok in test mode', async () => {
    const { status, body } = await request('/api/shutdown', 'POST');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
  });

  it('POST /api/restart returns ok in test mode', async () => {
    const { status, body } = await request('/api/restart', 'POST');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
  });

  it('debounces rapid power commands', async () => {
    const first = await request('/api/sleep', 'POST');
    assert.strictEqual(first.body.ok, true);
    const second = await request('/api/sleep', 'POST');
    assert.strictEqual(second.body.ok, true);
    assert.strictEqual(second.body.debounced, true);
  });
});
