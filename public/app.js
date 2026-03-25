/* Auto Shutdown — PWA Frontend */
(function () {
  'use strict';

  // --- State ---
  var connected = false;
  var pollTimer = null;
  var backoffMs = 2000;
  var POLL_INTERVAL = 5000;
  var BACKOFF_MAX = 30000;
  var currentAction = null;
  var networkMode = 'dhcp';

  // --- DOM refs ---
  var $ = function (sel) { return document.querySelector(sel); };
  var pcNameEl = $('#pc-name');
  var uptimeEl = $('#uptime');
  var dotEl = $('#connection-dot');
  var connLabel = $('#connection-label');
  var readoutText = $('#readout-text');
  var mainPage = $('#main-page');
  var settingsPage = $('#settings-page');
  var settingsBtn = $('#settings-btn');
  var backBtn = $('#back-btn');
  var modalOverlay = $('#modal-overlay');
  var modalTitle = $('#modal-title');
  var modalText = $('#modal-text');
  var modalIcon = $('#modal-icon');
  var modalConfirm = $('#modal-confirm');
  var modalCancel = $('#modal-cancel');
  var toastContainer = $('#toast-container');

  // Settings
  var serverUrlEl = $('#server-url');
  var portInput = $('#port-input');
  var savePortBtn = $('#save-port-btn');
  var interfaceSelect = $('#interface-select');
  var dhcpToggle = $('#dhcp-toggle');
  var staticToggle = $('#static-toggle');
  var staticFields = $('#static-fields');
  var ipInput = $('#ip-input');
  var subnetInput = $('#subnet-input');
  var gatewayInput = $('#gateway-input');
  var saveNetworkBtn = $('#save-network-btn');

  // --- Utility ---
  function formatUptime(seconds) {
    if (seconds == null || isNaN(seconds)) return '--:--';
    var s = Math.floor(seconds);
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    if (d > 0) return d + 'd ' + pad(h) + 'h';
    return pad(h) + ':' + pad(m);
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // --- Toast ---
  function showToast(message, type) {
    type = type || 'success';
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = '<span class="toast-dot"></span>' + escapeHtml(message);
    toastContainer.appendChild(toast);
    setTimeout(function () {
      toast.classList.add('dismissing');
      setTimeout(function () { toast.remove(); }, 300);
    }, 3500);
  }

  // --- API helpers ---
  function apiGet(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function apiPost(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(data.error || 'Request failed');
        return data;
      });
    });
  }

  // --- Connection status ---
  function setConnected(val) {
    connected = val;
    if (val) {
      dotEl.classList.remove('disconnected');
      connLabel.textContent = 'ONLINE';
      connLabel.classList.remove('offline');
      readoutText.textContent = 'SYS READY';
      readoutText.classList.remove('active-cmd');
      backoffMs = 2000;
    } else {
      dotEl.classList.add('disconnected');
      connLabel.textContent = 'OFFLINE';
      connLabel.classList.add('offline');
      readoutText.textContent = 'NO SIGNAL';
    }
  }

  // --- Status polling ---
  function pollStatus() {
    apiGet('/api/status')
      .then(function (data) {
        setConnected(true);
        pcNameEl.textContent = (data.pcName || '---').toUpperCase();
        uptimeEl.textContent = formatUptime(data.uptime);
        serverUrlEl.value = location.protocol + '//' + (data.ip || location.hostname) + ':' + (data.port || location.port);
        portInput.placeholder = String(data.port || 3000);
        schedulePoll(POLL_INTERVAL);
      })
      .catch(function () {
        setConnected(false);
        pcNameEl.textContent = '---';
        uptimeEl.textContent = '--:--';
        schedulePoll(backoffMs);
        backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX);
      });
  }

  function schedulePoll(ms) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(pollStatus, ms);
  }

  // --- Action buttons ---
  var actionLabels = { sleep: 'Sleep', shutdown: 'Shut Down', restart: 'Restart' };
  var actionIcons = {
    sleep: '<svg width="26" height="26" viewBox="0 0 48 48" fill="none"><path d="M34 20c0-7.18-5.82-13-13-13a13 13 0 0 0-4.5.8C20.07 9.28 23 13.3 23 18c0 6.08-4.92 11-11 11-1.97 0-3.82-.52-5.42-1.43A13.003 13.003 0 0 0 21 36c7.18 0 13-5.82 13-13z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    shutdown: '<svg width="26" height="26" viewBox="0 0 48 48" fill="none"><path d="M24 8v12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M16.5 12.2A13 13 0 1 0 31.5 12.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    restart: '<svg width="26" height="26" viewBox="0 0 48 48" fill="none"><path d="M34 18A12 12 0 0 0 14.5 12.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 8v8h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 30a12 12 0 0 0 19.5 5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M38 40v-8h-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  document.querySelectorAll('.action-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var action = btn.dataset.action;
      if (!action) return;
      showConfirmModal(action);
    });
  });

  function showConfirmModal(action) {
    currentAction = action;
    modalTitle.textContent = 'CONFIRM ' + action.toUpperCase();
    modalText.textContent = 'Are you sure you want to ' + actionLabels[action] + '?';
    modalIcon.innerHTML = actionIcons[action] || '';

    var colors = {
      sleep:    { color: 'var(--cyan)',  bg: 'var(--cyan-06)' },
      shutdown: { color: 'var(--red)',   bg: 'var(--red-06)' },
      restart:  { color: 'var(--amber)', bg: 'var(--amber-06)' },
    };
    var c = colors[action] || colors.sleep;
    modalIcon.style.color = c.color;
    modalIcon.style.background = c.bg;
    modalIcon.style.borderColor = 'rgba(255,255,255,0.06)';

    modalConfirm.className = 'modal-btn confirm-btn ' + action;
    modalConfirm.textContent = actionLabels[action].toUpperCase();
    modalOverlay.classList.add('visible');
  }

  function hideModal() {
    modalOverlay.classList.remove('visible');
    currentAction = null;
  }

  modalCancel.addEventListener('click', hideModal);
  modalOverlay.addEventListener('click', function (e) {
    if (e.target === modalOverlay) hideModal();
  });

  modalConfirm.addEventListener('click', function () {
    if (!currentAction) return;
    var action = currentAction;
    hideModal();

    // Show active state
    readoutText.textContent = 'EXECUTING ' + action.toUpperCase();
    readoutText.classList.add('active-cmd');

    // Disable buttons
    document.querySelectorAll('.action-btn').forEach(function (b) {
      b.classList.add('loading');
    });

    apiPost('/api/' + action)
      .then(function (data) {
        if (data.debounced) {
          showToast('Command already pending', 'success');
        } else {
          showToast(actionLabels[action] + ' command sent', 'success');
        }
      })
      .catch(function (err) {
        showToast('Failed: ' + err.message, 'error');
        readoutText.textContent = 'CMD FAILED';
      })
      .finally(function () {
        setTimeout(function () {
          document.querySelectorAll('.action-btn').forEach(function (b) {
            b.classList.remove('loading');
          });
          if (connected) {
            readoutText.textContent = 'SYS READY';
            readoutText.classList.remove('active-cmd');
          }
        }, 2500);
      });
  });

  // --- Page navigation ---
  function showPage(page) {
    mainPage.classList.remove('active');
    settingsPage.classList.remove('active');
    page.classList.add('active');
  }

  settingsBtn.addEventListener('click', function () {
    showPage(settingsPage);
    fetchNetworkConfig();
  });

  backBtn.addEventListener('click', function () {
    showPage(mainPage);
  });

  // --- Network settings ---
  function fetchNetworkConfig() {
    apiGet('/api/network')
      .then(function (data) {
        interfaceSelect.innerHTML = '';
        if (data.availableInterfaces && data.availableInterfaces.length) {
          data.availableInterfaces.forEach(function (name) {
            var opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            if (name === data.interface) opt.selected = true;
            interfaceSelect.appendChild(opt);
          });
        } else {
          var opt = document.createElement('option');
          opt.value = '';
          opt.textContent = 'No interfaces';
          interfaceSelect.appendChild(opt);
        }
        setNetworkMode(data.dhcp ? 'dhcp' : 'static');
        ipInput.value = data.ip || '';
        subnetInput.value = data.subnet || '';
        gatewayInput.value = data.gateway || '';
      })
      .catch(function () {
        showToast('Failed to load network config', 'error');
      });
  }

  function setNetworkMode(mode) {
    networkMode = mode;
    if (mode === 'dhcp') {
      dhcpToggle.classList.add('active');
      staticToggle.classList.remove('active');
      staticFields.classList.add('hidden');
    } else {
      dhcpToggle.classList.remove('active');
      staticToggle.classList.add('active');
      staticFields.classList.remove('hidden');
    }
  }

  dhcpToggle.addEventListener('click', function () { setNetworkMode('dhcp'); });
  staticToggle.addEventListener('click', function () { setNetworkMode('static'); });

  // Save network
  saveNetworkBtn.addEventListener('click', function () {
    var body = {
      mode: networkMode,
      interface: interfaceSelect.value,
    };
    if (networkMode === 'static') {
      body.ip = ipInput.value.trim();
      body.subnet = subnetInput.value.trim();
      body.gateway = gatewayInput.value.trim();
    }
    saveNetworkBtn.disabled = true;
    saveNetworkBtn.textContent = 'APPLYING...';
    apiPost('/api/network', body)
      .then(function (data) {
        showToast(data.message || 'Network updated', 'success');
      })
      .catch(function (err) {
        showToast(err.message || 'Network update failed', 'error');
      })
      .finally(function () {
        saveNetworkBtn.disabled = false;
        saveNetworkBtn.textContent = 'APPLY NETWORK';
      });
  });

  // Save port
  savePortBtn.addEventListener('click', function () {
    var port = parseInt(portInput.value, 10);
    if (isNaN(port) || port < 1024 || port > 65535) {
      showToast('Port must be 1024-65535', 'error');
      return;
    }
    savePortBtn.disabled = true;
    savePortBtn.textContent = 'SAVING...';
    apiPost('/api/config', { port: port })
      .then(function (data) {
        showToast(data.message || 'Port updated', 'success');
        if (data.newPort) {
          setTimeout(function () {
            var newUrl = location.protocol + '//' + location.hostname + ':' + data.newPort;
            showToast('Reconnecting to ' + newUrl + '...', 'success');
            setTimeout(function () {
              window.location.href = newUrl;
            }, 1500);
          }, 2000);
        }
      })
      .catch(function (err) {
        showToast(err.message || 'Port update failed', 'error');
      })
      .finally(function () {
        savePortBtn.disabled = false;
        savePortBtn.textContent = 'SAVE';
      });
  });

  // --- Init ---
  pollStatus();
})();
