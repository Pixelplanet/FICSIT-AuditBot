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

  var RENDER_SETTLE_MS = 1800; // Let tiles + the WebGL layer paint before capture.
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

  // Headless: strip every bit of UI chrome and make the map fill the frame, so
  // the screenshot is purely the map + markers with nothing cut off.
  function injectHeadlessStyles() {
    if (document.getElementById('auditbot-headless-style')) return;
    var css =
      '#topBar,#sidebar,#categoryDetailColumn,#categoryNavPanel,' +
      '.leaflet-control-container,.leaflet-control,#busyOverlay,#searchSuggestions,' +
      '#loadProgressBar,#statusMenu,.smapFooter,footer{display:none !important;}' +
      'html,body{margin:0 !important;padding:0 !important;background:#0d0f13 !important;overflow:hidden !important;}' +
      '#map{position:fixed !important;top:0 !important;left:0 !important;right:0 !important;' +
      'bottom:0 !important;width:100vw !important;height:100vh !important;margin:0 !important;}';
    var style = document.createElement('style');
    style.id = 'auditbot-headless-style';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  // Frame the whole factory once the map exists. An explicit centerX/centerY
  // overrides the auto-fit; otherwise we fit the map's content bounds so the
  // full overview is captured with nothing cropped.
  function applyView() {
    try {
      if (!window.MapApp || !window.MapApp.map) return;
      var map = window.MapApp.map;
      if (typeof map.invalidateSize === 'function') map.invalidateSize(false);
      var zoom = params.get('zoom');
      var cx = params.get('centerX');
      var cy = params.get('centerY');
      if (cx !== null && cy !== null && typeof map.setView === 'function') {
        map.setView([Number(cy), Number(cx)], zoom !== null ? Number(zoom) : map.getZoom());
        return;
      }
      if (typeof map.getMaxBounds === 'function' && typeof map.fitBounds === 'function') {
        var bounds = map.getMaxBounds();
        if (bounds && (!bounds.isValid || bounds.isValid())) {
          map.fitBounds(bounds, { animate: false, padding: [0, 0] });
          return;
        }
      }
      if (zoom !== null && typeof map.setZoom === 'function') map.setZoom(Number(zoom));
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
    if (headless) {
      // Hide chrome up front so there's no flash of UI before the capture.
      injectHeadlessStyles();
    }
    watchLoad(
      function onLoaded() {
        applyView();
        if (headless) {
          // Re-fit after a tick (tiles/labels settle) then signal readiness.
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              applyView();
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
