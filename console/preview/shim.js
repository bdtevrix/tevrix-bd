/*
 * Preview-only: a google.script.run that calls the Web.gs functions in this page,
 * with a short delay and the same rules as Apps Script (no private "_" functions,
 * no Date objects in what comes back).
 */
(function () {
  'use strict';
  var sheets = __sample.sheets;
  if (window.__HM_EMPTY__) Object.keys(sheets).forEach(function (k) { if (k !== 'Settings') sheets[k] = [sheets[k][0]]; });
  __fakeGAS.install({ sheets: sheets, activeUser: 'founder@tevrix.example', effectiveUser: 'bd@tevrix.example', editors: ['founder@tevrix.example'], url: '' });
  function hasDate(v) {
    if (Object.prototype.toString.call(v) === '[object Date]') return true;
    if (v && typeof v === 'object') return Object.keys(v).some(function (k) { return hasDate(v[k]); });
    return false;
  }
  function runner(ok, fail) {
    return new Proxy({}, {
      get: function (_, name) {
        if (name === 'withSuccessHandler') return function (h) { return runner(h, fail); };
        if (name === 'withFailureHandler') return function (h) { return runner(ok, h); };
        return function () {
          var args = JSON.parse(JSON.stringify(Array.prototype.slice.call(arguments)));
          setTimeout(function () {
            try {
              if (/_$/.test(name) || typeof window[name] !== 'function') throw new Error('Script function not found: ' + name);
              var r = window[name].apply(null, args);
              if (hasDate(r)) throw new Error('A Date came back from ' + name + '; Apps Script would drop this result.');
              if (ok) ok(r === undefined ? null : JSON.parse(JSON.stringify(r)));
            } catch (e) { if (fail) fail(e); else console.error(e); }
          }, 180 + Math.random() * 220);
        };
      }
    });
  }
  window.google = { script: { run: runner(null, null) } };
})();
