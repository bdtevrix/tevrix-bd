/*
 * A small stand-in for the Apps Script services Web.gs uses, so the same
 * server code runs in the browser preview and in the Node tests.
 * Covers only what Web.gs touches: SpreadsheetApp, Session, CacheService,
 * LockService, Utilities (formatDate, computeDigest) and HtmlService.
 */
(function (root) {
  'use strict';

  function Sheet(name, rows) { this.name = name; this.data = rows.map(function (r) { return r.slice(); }); }
  Sheet.prototype.getName = function () { return this.name; };
  Sheet.prototype.getLastRow = function () {
    for (var i = this.data.length - 1; i >= 0; i--) {
      if (this.data[i].some(function (v) { return v !== '' && v !== null && v !== undefined; })) return i + 1;
    }
    return 0;
  };
  Sheet.prototype.getLastColumn = function () {
    var max = 0;
    this.data.forEach(function (r) {
      for (var j = r.length - 1; j >= 0; j--) { if (r[j] !== '' && r[j] !== null && r[j] !== undefined) { max = Math.max(max, j + 1); break; } }
    });
    return max;
  };
  Sheet.prototype.getRange = function (r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); };
  Sheet.prototype.appendRow = function (row) {
    this.data.length = this.getLastRow();
    this.data.push(row.slice());
    return this;
  };

  function Range(sheet, r, c, nr, nc) { this.sheet = sheet; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
  Range.prototype.getValues = function () {
    var out = [];
    for (var i = 0; i < this.nr; i++) {
      var src = this.sheet.data[this.r - 1 + i] || [], row = [];
      for (var j = 0; j < this.nc; j++) { var v = src[this.c - 1 + j]; row.push(v === undefined || v === null ? '' : v); }
      out.push(row);
    }
    return out;
  };
  Range.prototype.getValue = function () { return this.getValues()[0][0]; };
  Range.prototype.setValues = function (vals) {
    var self = this;
    vals.forEach(function (rowVals, i) {
      rowVals.forEach(function (v, j) { new Range(self.sheet, self.r + i, self.c + j, 1, 1).setValue(v); });
    });
    return this;
  };
  Range.prototype.setValue = function (v) {
    while (this.sheet.data.length < this.r) this.sheet.data.push([]);
    var row = this.sheet.data[this.r - 1];
    while (row.length < this.c) row.push('');
    row[this.c - 1] = (typeof v === 'string' && v.charAt(0) === "'") ? v.slice(1) : v; // like Sheets: the apostrophe only marks text
    this.sheet.writes = (this.sheet.writes || []).concat([v]);
    return this;
  };

  function User(email) { this.email = email; }
  User.prototype.getEmail = function () { return this.email; };

  function sha1Bytes(str) {
    var bytes = [], i;
    var utf8 = unescape(encodeURIComponent(str));
    for (i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));
    var ml = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (ml >>> (i * 8)) & 0xff);
    var h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
    var w = new Array(80);
    for (var off = 0; off < bytes.length; off += 64) {
      for (i = 0; i < 16; i++) w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3];
      for (i = 16; i < 80; i++) { var x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = (x << 1) | (x >>> 31); }
      var a = h0, b = h1, c = h2, d = h3, e = h4;
      for (i = 0; i < 80; i++) {
        var f, k;
        if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
        else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
        else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
        else { f = b ^ c ^ d; k = 0xCA62C1D6; }
        var t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) | 0;
        e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
    }
    var out = [];
    [h0, h1, h2, h3, h4].forEach(function (h) {
      for (var s = 24; s >= 0; s -= 8) { var byte = (h >>> s) & 0xff; out.push(byte > 127 ? byte - 256 : byte); }
    });
    return out; // signed bytes, like Apps Script
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function install(opts) {
    opts = opts || {};
    var tz = opts.tz || 'Asia/Kolkata';
    var sheets = {};
    Object.keys(opts.sheets || {}).forEach(function (name) { sheets[name] = new Sheet(name, opts.sheets[name]); });
    var env = {
      activeUser: opts.activeUser || '', effectiveUser: opts.effectiveUser || 'bd@tevrixai.com',
      editors: opts.editors || [], owner: opts.owner || opts.effectiveUser || 'bd@tevrixai.com', sheets: sheets, cache: {}
    };
    var ss = {
      getSheetByName: function (n) { return sheets[n] || null; },
      getEditors: function () { return env.editors.map(function (e) { return new User(e); }); },
      getOwner: function () { return new User(env.owner); },
      getUrl: function () { return opts.url !== undefined ? opts.url : 'https://docs.google.com/spreadsheets/d/preview/edit'; }
    };
    root.SpreadsheetApp = { getActive: function () { return ss; }, getActiveSpreadsheet: function () { return ss; } };
    root.Session = {
      getActiveUser: function () { return new User(env.activeUser); },
      getEffectiveUser: function () { return new User(env.effectiveUser); },
      getScriptTimeZone: function () { return tz; }
    };
    root.CacheService = { getScriptCache: function () { return {
      get: function (k) { return Object.prototype.hasOwnProperty.call(env.cache, k) ? env.cache[k] : null; },
      put: function (k, v) { env.cache[k] = String(v); },
      remove: function (k) { delete env.cache[k]; }
    }; } };
    root.LockService = { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };
    root.Utilities = {
      DigestAlgorithm: { SHA_1: 'SHA_1' }, Charset: { UTF_8: 'UTF_8' },
      computeDigest: function (alg, s) { return sha1Bytes(String(s)); },
      formatDate: function (d, zone, fmt) {
        var parts = {};
        new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
          .formatToParts(d).forEach(function (p) { parts[p.type] = p.value; });
        return fmt.replace('yyyy', parts.year).replace('MM', parts.month).replace('dd', parts.day).replace('HH', parts.hour).replace('mm', parts.minute);
      }
    };
    function Out(content) { this.content = content; this.title = ''; }
    Out.prototype.setTitle = function (t) { this.title = t; return this; };
    Out.prototype.addMetaTag = function () { return this; };
    Out.prototype.getContent = function () { return this.content; };
    root.HtmlService = {
      createHtmlOutput: function (h) { return new Out(h); },
      createHtmlOutputFromFile: function (n) { return new Out('FILE:' + n); }
    };
    return env;
  }

  root.__fakeGAS = { install: install, sha1Bytes: sha1Bytes, pad: pad };
})(typeof window !== 'undefined' ? window : this);
