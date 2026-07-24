// =============================================================================
// FICSIT AuditBot — satisfactorymap integration overlay
// =============================================================================
// This script is layered on top of the vendored satisfactorymap frontend
// (map/static/map) at build time (see Dockerfile.map). It adds two behaviors
// without modifying the upstream files' logic:
//
//   1. Server-side save loading via ?apiSave=<abs path>:
//      fetch the .sav bytes from the AuditBot API and feed them into the same
//      upload pipeline the drag/drop UI uses (no manual file picking).
//
//   2. Headless render signaling via ?headless=1:
//      after the save renders, apply the requested view (zoom/center) and set
//      window.__MAP_RENDER_READY__ = true (or __MAP_RENDER_ERROR__ on failure)
//      so the AuditBot headless renderer (src/map/render.ts) knows when to
//      screenshot.
//
// It is intentionally defensive: any failure degrades to the normal manual UI.
// =============================================================================

(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var apiSave = params.get('apiSave');
  var headless = params.get('headless') === '1';

  if (!apiSave) {
    return; // Nothing to do — behave like the stock map.
  }

  var RENDER_SETTLE_MS = 900; // Let WebGL paint a couple of frames before capture.
  var LOAD_TIMEOUT_MS = 120000;

  function fail(message) {
    // Surface to the headless renderer and the console.
    if (headless) {
      window.__MAP_RENDER_ERROR__ = String(message);
    }
    // eslint-disable-next-line no-console
    console.error('[auditbot] ' + message);
  }

  function basename(p) {
    var parts = String(p).split(/[\\/]/);
    return parts[parts.length - 1] || 'save.sav';
  }

  // Inject a fetched save into the existing upload pipeline by setting the
  // hidden file input's files (via DataTransfer) and dispatching "change".
  function injectSave(name, bytes) {
    var input = document.getElementById('uploadFileInput');
    if (!input) {
      throw new Error('upload input not found (frontend layout changed?)');
    }
    var file = new File([bytes], name, { type: 'application/octet-stream' });
    var dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Best-effort application of the requested view once the map exists.
  function applyView() {
    try {
      if (!window.MapApp || !window.MapApp.map) return;
      var map = window.MapApp.map;
      var zoom = params.get('zoom');
      var cx = params.get('centerX');
      var cy = params.get('centerY');
      if (cx !== null && cy !== null && typeof map.setView === 'function') {
        // The map's CRS maps game units to lat/lng directly in most builds;
        // if not, this throws and we fall back to a plain zoom.
        map.setView([Number(cy), Number(cx)], zoom !== null ? Number(zoom) : map.getZoom());
      } else if (zoom !== null && typeof map.setZoom === 'function') {
        map.setZoom(Number(zoom));
      }
    } catch (err) {
      // View is best-effort; keep whatever the map defaulted to.
      // eslint-disable-next-line no-console
      console.warn('[auditbot] applyView failed: ' + (err && err.message || err));
    }
  }

  // Watch the load status line for the terminal "Loaded:" / "Failed" states.
  function watchLoad(onLoaded, onError) {
    var status = document.getElementById('loadStatus');
    if (!status) {
      onError(new Error('loadStatus element not found'));
      return;
    }
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      observer.disconnect();
      onError(new Error('timed out waiting for the save to load'));
    }, LOAD_TIMEOUT_MS);

    function check() {
      var text = status.textContent || '';
      if (/^Loaded:/i.test(text)) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        observer.disconnect();
        onLoaded();
      } else if (/^Failed to load/i.test(text)) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        observer.disconnect();
        onError(new Error(text));
      }
    }

    var observer = new MutationObserver(check);
    observer.observe(status, { childList: true, characterData: true, subtree: true });
    check();
  }

  function start() {
    watchLoad(
      function onLoaded() {
        applyView();
        if (headless) {
          // Give the WebGL layer a moment to paint the applied view.
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              setTimeout(function () {
                window.__MAP_RENDER_READY__ = true;
              }, RENDER_SETTLE_MS);
            });
          });
        }
      },
      function onError(err) {
        fail(err && err.message || err);
      },
    );

    fetch('/api/map/save-file?path=' + encodeURIComponent(apiSave))
      .then(function (res) {
        if (!res.ok) throw new Error('save-file request failed: ' + res.status);
        return res.arrayBuffer();
      })
      .then(function (buffer) {
        injectSave(basename(apiSave), new Uint8Array(buffer));
      })
      .catch(function (err) {
        fail(err && err.message || err);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      // Defer one tick so data.js's DOMContentLoaded handler wires the UI first.
      setTimeout(start, 0);
    });
  } else {
    setTimeout(start, 0);
  }
})();
