'use strict';

/** Minimal fetch helpers. */
async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

function setStatusMessage(message) {
  const html = `<tr><td>Status</td><td>${escapeHtml(message)}</td></tr>`;
  for (const id of ['statusTable', 'apiStatusTable']) {
    const table = document.getElementById(id);
    if (table) table.innerHTML = html;
  }
}
async function sendJSON(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function toast(message, kind) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = 'toast ' + (kind || '');
  setTimeout(() => el.classList.add('hidden'), 3200);
}

function fmtDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

// ---- Tabs ----
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'status') loadStatus();
    if (tab.dataset.tab === 'config') loadConfig();
  });
});

// ---- Config ----
async function loadConfig() {
  try {
    const cfg = await getJSON('/api/config');
    const f = document.getElementById('configForm');
    f.savesDir.value = cfg.savesDir || '';
    f.canonicalSaveSuffix.value = cfg.canonicalSaveSuffix || '';
    f.autosaveIntervalMinutes.value = cfg.autosaveIntervalMinutes ?? 0;
    f.autosaveTimeToleranceSeconds.value = cfg.autosaveTimeToleranceSeconds ?? 2;
    f.docsPath.value = cfg.docsPath || '';
    f.postToDiscord.checked = !!cfg.postToDiscord;
    f.skipEmptySummaries.checked = !!cfg.skipEmptySummaries;
    f.watchUsePolling.checked = !!cfg.watchUsePolling;
    f.watchDebounceMs.value = cfg.watchDebounceMs ?? 5000;
    f.phaseCostMultiplier.value = cfg.phaseCostMultiplier ?? 0;
    f.serverApiUrl.value = cfg.serverApi?.url || '';
    f.serverApiAllowInsecureTls.checked = !!cfg.serverApi?.allowInsecureTls;
    f.serverApiTimeoutMs.value = cfg.serverApi?.timeoutMs ?? 5000;
    f.channelId.value = cfg.discord.channelId || '';
    f.webPort.value = cfg.webPort ?? 8080;
    setState('webhookState', cfg.discord.webhookUrlSet);
    setState('botState', cfg.discord.botTokenSet);
    setState('serverApiTokenState', !!cfg.serverApi?.tokenSet);
    f.webhookUrl.value = '';
    f.botToken.value = '';
    f.serverApiToken.value = '';
    document.getElementById('clearWebhook').checked = false;
    document.getElementById('clearBot').checked = false;
    document.getElementById('clearServerApiToken').checked = false;
    refreshDocsState();
  } catch (err) {
    toast('Failed to load config: ' + err.message, 'err');
  }
}

function setState(id, isSet) {
  const el = document.getElementById(id);
  el.textContent = isSet ? '(set)' : '(not set)';
  el.classList.toggle('unset', !isSet);
}

async function refreshDocsState() {
  const el = document.getElementById('docsState');
  if (!el) return;
  try {
    const s = await getJSON('/api/status');
    if (s.docs && s.docs.loaded) {
      el.textContent = `Loaded: ${s.docs.schematics} schematics, ${s.docs.recipes} recipes, ${s.docs.items} items`;
    } else {
      el.textContent = (s.docs && s.docs.error) || 'Not loaded';
    }
  } catch {
    el.textContent = '';
  }
}

document.getElementById('btnReloadDocs').addEventListener('click', async () => {
  const el = document.getElementById('docsState');
  el.textContent = 'Reloading…';
  try {
    // Save current path first so reload uses it.
    await sendJSON('/api/config', 'PUT', { docsPath: document.getElementById('configForm').docsPath.value.trim() });
    const status = await sendJSON('/api/docs/reload', 'POST');
    if (status.loaded) {
      el.textContent = `Loaded: ${status.schematics} schematics, ${status.recipes} recipes, ${status.items} items`;
      toast('Game data loaded', 'ok');
    } else {
      el.textContent = status.error || 'Not loaded';
      toast('Game data not loaded', 'err');
    }
  } catch (err) {
    el.textContent = err.message;
    toast('Reload failed: ' + err.message, 'err');
  }
});

document.getElementById('configForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const clearWebhook = document.getElementById('clearWebhook').checked;
  const clearBot = document.getElementById('clearBot').checked;
  const clearServerApiToken = document.getElementById('clearServerApiToken').checked;

  const patch = {
    savesDir: f.savesDir.value.trim(),
    canonicalSaveSuffix: f.canonicalSaveSuffix.value.trim(),
    autosaveIntervalMinutes: Number(f.autosaveIntervalMinutes.value),
    autosaveTimeToleranceSeconds: Number(f.autosaveTimeToleranceSeconds.value),
    docsPath: f.docsPath.value.trim(),
    postToDiscord: f.postToDiscord.checked,
    skipEmptySummaries: f.skipEmptySummaries.checked,
    watchUsePolling: f.watchUsePolling.checked,
    watchDebounceMs: Number(f.watchDebounceMs.value),
    phaseCostMultiplier: Number(f.phaseCostMultiplier.value),
    webPort: Number(f.webPort.value),
    serverApi: {
      url: f.serverApiUrl.value.trim(),
      allowInsecureTls: f.serverApiAllowInsecureTls.checked,
      timeoutMs: Number(f.serverApiTimeoutMs.value),
      token: clearServerApiToken ? null : (f.serverApiToken.value.trim() || undefined),
    },
    discord: {
      channelId: f.channelId.value.trim(),
      // null clears, undefined keeps, string sets
      webhookUrl: clearWebhook ? null : (f.webhookUrl.value.trim() || undefined),
      botToken: clearBot ? null : (f.botToken.value.trim() || undefined),
    },
  };

  try {
    await sendJSON('/api/config', 'PUT', patch);
    document.getElementById('configSaved').textContent = 'Saved ✓ ' + new Date().toLocaleTimeString();
    toast('Configuration saved', 'ok');
    await loadConfig();
    await loadStatus();
  } catch (err) {
    toast('Save failed: ' + err.message, 'err');
  }
});

// ---- Status ----
async function loadStatus() {
  setStatusMessage('Loading status…');
  try {
    const s = await getJSON('/api/status');
    const rows = [
      ['Saves directory', s.savesDir],
      ['Canonical suffix', '*' + s.canonicalSuffix],
      ['Autosave interval', s.autosaveIntervalMinutes > 0 ? `${s.autosaveIntervalMinutes} min` : 'disabled'],
      ['Autosave tolerance', `${s.autosaveTimeToleranceSeconds}s`],
      ['Canonical save', s.canonicalSaveName || '(none found)'],
      ['Watching', s.watching ? 'yes' : 'no'],
      ['Post to Discord', s.postToDiscord ? 'enabled' : 'disabled'],
      ['Discord configured', s.discordReady ? 'yes' : 'no'],
      ['Server API configured', s.serverApi?.configured ? 'yes' : 'no'],
      ['Server API reachable', s.serverApi?.reachable ? 'yes' : 'no'],
      ['Server API endpoint', s.serverApi?.configured ? (s.serverApi?.endpointUrl || 'auto-detect pending') : '—'],
      ['Server API auto-detected', s.serverApi?.autoDetected == null ? '—' : (s.serverApi.autoDetected ? 'yes' : 'no')],
      ['Server connected players', s.serverApi?.gameState?.numConnectedPlayers ?? '—'],
      ['Server paused', s.serverApi?.gameState?.isGamePaused == null ? '—' : (s.serverApi.gameState.isGamePaused ? 'yes' : 'no')],
      ['Active milestone', s.serverApi?.gameState?.activeSchematic || '—'],
      ['Game phase', s.serverApi?.gameState?.gamePhase || '—'],
      ['Server API last error', s.serverApi?.error || '—'],
      ['Game data (Docs.json)', s.docs && s.docs.loaded
        ? `loaded — ${s.docs.schematics} schematics, ${s.docs.recipes} recipes, ${s.docs.items} items`
        : (s.docs && s.docs.error ? s.docs.error : 'not loaded')],
      ['Parts cost multiplier', s.phaseCostMultiplier
        ? `×${s.phaseCostMultiplier.value} (${s.phaseCostMultiplier.source})`
        : '—'],
      ['Has baseline', s.baseline.hasBaseline ? 'yes' : 'no'],
      ['Baseline save', s.baseline.lastSaveName || '—'],
      ['Baseline playtime', s.baseline.playDurationSeconds != null ? fmtDuration(s.baseline.playDurationSeconds) : '—'],
      ['Last processed', s.baseline.lastProcessedAt ? new Date(s.baseline.lastProcessedAt).toLocaleString() : '—'],
      ['Last result', s.lastResult ? `${s.lastResult.status} — ${s.lastResult.message}` : '—'],
    ];
    const tableHtml = rows
      .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>`)
      .join('');
    for (const id of ['statusTable', 'apiStatusTable']) {
      const table = document.getElementById(id);
      if (table) table.innerHTML = tableHtml;
    }

    const pill = document.getElementById('statusPill');
    if (s.postToDiscord && !s.discordReady) {
      pill.className = 'pill pill-warn';
      pill.textContent = 'Discord on, not configured';
    } else if (s.watching) {
      pill.className = 'pill pill-ok';
      pill.textContent = 'Watching';
    } else {
      pill.className = 'pill pill-muted';
      pill.textContent = 'Idle';
    }
  } catch (err) {
    setStatusMessage('Failed to load status: ' + err.message);
    toast('Failed to load status: ' + err.message, 'err');
  }
}

async function loadLogs() {
  const pane = document.getElementById('logsPane');
  if (!pane) return;
  pane.textContent = 'Loading logs…';
  try {
    const logs = await getJSON('/api/logs?limit=250');
    if (!Array.isArray(logs) || logs.length === 0) {
      pane.textContent = 'No logs available yet.';
      return;
    }
    pane.textContent = logs
      .map((e) => {
        const ts = e.at ? new Date(e.at).toLocaleTimeString() : '—';
        const level = (e.level || 'log').toUpperCase().padEnd(5, ' ');
        return `${ts} [${level}] ${e.message || ''}`;
      })
      .join('\n');
    pane.scrollTop = pane.scrollHeight;
  } catch (err) {
    pane.textContent = 'Failed to load logs: ' + err.message;
  }
}

// ---- Saves dropdowns ----
async function loadSaves() {
  try {
    const saves = await getJSON('/api/saves');
    const before = document.getElementById('selBefore');
    const after = document.getElementById('selAfter');
    const opts = saves
      .map((s) => `<option value="${escapeHtml(s.path)}">${escapeHtml(s.name)}${s.isCanonical ? ' ★' : ''}</option>`)
      .join('');
    before.innerHTML = opts;
    after.innerHTML = opts;
    if (saves.length > 1) {
      before.selectedIndex = 1;
      after.selectedIndex = 0;
    }
  } catch (err) {
    toast('Failed to load saves: ' + err.message, 'err');
  }
}

// ---- Preview rendering ----
let currentPreview = null;

function renderPreview(p) {
  currentPreview = p;
  const meta = document.getElementById('previewMeta');
  const empty = document.getElementById('previewEmpty');
  const body = document.getElementById('previewBody');

  if (!p) {
    empty.classList.remove('hidden');
    body.classList.add('hidden');
    return;
  }

  const tag = p.live ? 'LIVE' : 'preview';
  meta.textContent = `${p.source} · ${tag} · ${new Date(p.generatedAt).toLocaleTimeString()}`;

  if (!p.embed) {
    empty.classList.remove('hidden');
    body.classList.add('hidden');
    empty.textContent =
      p.kind === 'first-run'
        ? 'This save would become the baseline (nothing to compare yet).'
        : p.kind === 'unchanged'
        ? 'No canonical save found / nothing changed.'
        : 'No summary available.';
    return;
  }

  empty.classList.add('hidden');
  body.classList.remove('hidden');

  const e = p.embed;
  document.querySelector('.embed-bar').style.background = '#' + (e.color || 0).toString(16).padStart(6, '0');
  document.getElementById('embedTitle').textContent = e.title || '';
  document.getElementById('embedDescription').textContent = e.description || '';
  document.getElementById('embedFields').innerHTML = (e.fields || [])
    .map(
      (f) =>
        `<div class="embed-field"><div class="embed-field-name">${escapeHtml(f.name)}</div>` +
        `<div class="embed-field-value">${escapeHtml(f.value)}</div></div>`,
    )
    .join('');
  document.getElementById('embedTimestamp').textContent = e.timestamp
    ? new Date(e.timestamp).toLocaleString()
    : '';

  document.getElementById('rawText').textContent = p.text || '';
  document.getElementById('rawJson').textContent = JSON.stringify(e, null, 2);
}

document.getElementById('btnPreviewBaseline').addEventListener('click', async () => {
  try {
    renderPreview(await sendJSON('/api/preview', 'POST'));
    toast('Preview generated', 'ok');
  } catch (err) {
    toast('Preview failed: ' + err.message, 'err');
  }
});

document.getElementById('btnPreviewBetween').addEventListener('click', async () => {
  const beforePath = document.getElementById('selBefore').value;
  const afterPath = document.getElementById('selAfter').value;
  if (!beforePath || !afterPath) return toast('Pick two saves', 'err');
  try {
    renderPreview(await sendJSON('/api/preview/between', 'POST', { beforePath, afterPath }));
    toast('Comparison generated', 'ok');
  } catch (err) {
    toast('Comparison failed: ' + err.message, 'err');
  }
});

document.getElementById('btnProcessNow').addEventListener('click', async () => {
  try {
    const r = await sendJSON('/api/process-now', 'POST');
    toast(`Processed: ${r.status}`, 'ok');
    setTimeout(refreshLatestPreview, 600);
    loadStatus();
  } catch (err) {
    toast('Process failed: ' + err.message, 'err');
  }
});

document.getElementById('btnTestPost').addEventListener('click', async () => {
  if (!confirm('Send the current preview summary to Discord now?')) return;
  try {
    const r = await sendJSON('/api/test-post', 'POST');
    toast(r.message, r.delivered ? 'ok' : 'err');
  } catch (err) {
    toast('Test post failed: ' + err.message, 'err');
  }
});

document.getElementById('btnToggleRaw').addEventListener('click', (e) => {
  const text = document.getElementById('rawText');
  const json = document.getElementById('rawJson');
  const hidden = text.classList.contains('hidden');
  text.classList.toggle('hidden', !hidden);
  json.classList.toggle('hidden', !hidden);
  e.target.textContent = hidden ? 'Hide raw' : 'Show raw';
});

document.getElementById('btnRefreshLogs')?.addEventListener('click', async () => {
  await loadLogs();
});

async function refreshLatestPreview() {
  try {
    const p = await getJSON('/api/preview');
    if (p) renderPreview(p);
  } catch {
    /* ignore */
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---- Init ----
(async function init() {
  await loadStatus();
  await loadLogs();
  await loadSaves();
  await refreshLatestPreview();
  setInterval(loadStatus, 10000);
  setInterval(loadLogs, 5000);
})();
