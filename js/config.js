/* ============================================================
   config.js - namespace, rinkmatt, farger, roster och hjalpfunktioner
   Alla matt ar i METER enligt IIHF (60 x 30 m).
   ============================================================ */
window.HTB = window.HTB || {};

(function (HTB) {
  'use strict';

  /* ---------- Rinkgeometri (meter) ---------- */
  HTB.RINK = {
    L: 60,              // langd
    W: 30,              // bredd
    cornerR: 8.5,       // hornradie
    goalLine: 4.0,      // mallinje fran kortsida
    blueLine: 22.86,    // blalinje fran kortsida
    center: 30,         // mittlinje
    circleR: 4.5,       // tekningscirkel
    zoneDotX: 10.0,     // zonprick = mallinje + 6 m
    neutralDotX: 24.36, // neutralzonsprick = blalinje + 1,5 m
    dotOffY: 7.0,       // prickarnas avstand fran mitten i sidled
    creaseR: 1.83,      // malgard
    goalW: 1.83,        // malets bredd
    goalD: 1.12,        // malets djup
    crossGoalInset: 2.0 // burarnas bakkant fran langsidan pa zontavlan
  };

  /* ---------- Tavelformat (beskarning av rinken) ----------
     rot0 = startrotation. Zonen oppnas staende och har dessutom tva
     burar vid langsidorna, sa som man oftast spelar tvarsover i zon. */
  HTB.FORMATS = {
    full: { key: 'full', label: 'Helplan',  w: 60,   h: 30, scale: 1.9,  cut: false, rot0: 0 },
    half: { key: 'half', label: 'Halvplan', w: 30.5, h: 30, scale: 1.4,  cut: true,  rot0: 0 },
    zone: { key: 'zone', label: 'Zon',      w: 25,   h: 30, scale: 1.15, cut: true,  rot0: 0,
            crossIceGoals: true }
  };

  /* ---------- Lagfarger ----------
     Lag 1 foljer klubbdrakten: morkbla bas med gult, vita siffror/bokstaver.
     Hjalmen ar en aning ljusare bla an trojan sa att huvudet syns mot kroppen. */
  HTB.TEAMS = {
    A: {
      name: 'Lag 1',
      jersey: '#17243f', trim: '#f5c518', helmet: '#22345c',
      glove: '#f5c518', skate: '#0e1729', label: '#ffffff',
      discText: '#ffffff', trail: '#e8b400'
    },
    B: {
      name: 'Lag 2',
      jersey: '#d8232a', trim: '#ffffff', helmet: '#9d151b',
      glove: '#ffffff', skate: '#6d0f13', label: '#ffffff',
      discText: '#ffffff', trail: '#c81f26'
    }
  };

  /* ---------- Trupp: 2 backar + 3 forwards per lag, plus valfri malvakt ---------- */
  HTB.ROSTER = [];
  ['A', 'B'].forEach(function (team) {
    ['B', 'B', 'F', 'F', 'F', 'G'].forEach(function (role, i) {
      HTB.ROSTER.push({ id: team + '-' + role + i, team: team, role: role });
    });
  });

  /* ---------- Ritfarger ---------- */
  HTB.COLORS = ['#16243d', '#d8232a', '#1552b0', '#0f8a4d'];

  /* ---------- Verktyg som ritar linjer ---------- */
  HTB.DRAW_TOOLS = ['skate', 'skatepuck', 'pass', 'shot', 'pen'];

  /* ---------- Globalt apptillstand ---------- */
  HTB.state = {
    format: 'full',
    rotation: 0,           // 0 | 90 | 180 | 270
    flipX: false,
    flipY: false,
    pieceStyle: 'figure',  // 'figure' | 'disc'
    tool: 'select',
    color: HTB.COLORS[0],
    skateDir: 'fwd',       // 'fwd' | 'bwd' - riktning for nya rorelsebanor
    scale: 1.9             // pjas- och linjeskala for aktuellt format
  };

  /* ============================================================
     Hjalpfunktioner
     ============================================================ */
  var SVGNS = 'http://www.w3.org/2000/svg';
  var util = HTB.util = {};

  util.NS = SVGNS;

  util.el = function (tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    if (attrs) {
      for (var k in attrs) {
        if (attrs[k] !== null && attrs[k] !== undefined) {
          e.setAttribute(k, attrs[k]);
        }
      }
    }
    if (parent) parent.appendChild(e);
    return e;
  };

  /* Bygger SVG-noder ur en markup-strang */
  util.frag = function (markup) {
    var doc = new DOMParser().parseFromString(
      '<svg xmlns="' + SVGNS + '">' + markup + '</svg>', 'image/svg+xml');
    var f = document.createDocumentFragment();
    Array.prototype.slice.call(doc.documentElement.childNodes).forEach(function (n) {
      f.appendChild(document.importNode(n, true));
    });
    return f;
  };

  util.clear = function (node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  };

  util.dist = function (a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  util.clamp = function (v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  };

  /* Ramer-Douglas-Peucker */
  util.simplify = function (pts, tol) {
    if (!pts || pts.length < 3) return (pts || []).slice();
    var keep = [pts[0]];
    (function rdp(first, last) {
      var maxD = 0, idx = -1;
      var a = pts[first], b = pts[last];
      var dx = b.x - a.x, dy = b.y - a.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1e-9;
      for (var i = first + 1; i < last; i++) {
        var d = Math.abs((pts[i].x - a.x) * dy - (pts[i].y - a.y) * dx) / len;
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > tol && idx > 0) {
        rdp(first, idx);
        keep.push(pts[idx]);
        rdp(idx, last);
      }
    })(0, pts.length - 1);
    keep.push(pts[pts.length - 1]);
    return keep;
  };

  /* Catmull-Rom -> kubiska bezier: ger mjuka bagar och raka streck */
  util.smoothPath = function (pts) {
    if (!pts || pts.length < 2) return '';
    var r = function (n) { return Math.round(n * 1000) / 1000; };
    if (pts.length === 2) {
      return 'M' + r(pts[0].x) + ' ' + r(pts[0].y) + ' L' + r(pts[1].x) + ' ' + r(pts[1].y);
    }
    var d = 'M' + r(pts[0].x) + ' ' + r(pts[0].y);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i];
      var p1 = pts[i];
      var p2 = pts[i + 1];
      var p3 = pts[i + 2] || p2;
      d += ' C' + r(p1.x + (p2.x - p0.x) / 6) + ' ' + r(p1.y + (p2.y - p0.y) / 6) +
           ' ' + r(p2.x - (p3.x - p1.x) / 6) + ' ' + r(p2.y - (p3.y - p1.y) / 6) +
           ' ' + r(p2.x) + ' ' + r(p2.y);
    }
    return d;
  };

  /* Dold mat-SVG for getPointAtLength / getTotalLength */
  var measurePath = null;
  function measure() {
    if (!measurePath) {
      var svg = util.el('svg', {
        width: 0, height: 0,
        style: 'position:absolute;left:-9999px;top:-9999px;overflow:hidden'
      });
      measurePath = util.el('path', {}, svg);
      document.body.appendChild(svg);
    }
    return measurePath;
  }

  util.pathLength = function (d) {
    var p = measure();
    p.setAttribute('d', d);
    try { return p.getTotalLength(); } catch (e) { return 0; }
  };

  /* Samplar en path-strang till jamnt fordelade punkter */
  util.samplePath = function (d, step) {
    var p = measure();
    p.setAttribute('d', d);
    var total = 0;
    try { total = p.getTotalLength(); } catch (e) { return []; }
    if (!total) return [];
    var n = Math.max(2, Math.ceil(total / step));
    var out = [];
    for (var i = 0; i <= n; i++) {
      var s = total * i / n;
      var pt = p.getPointAtLength(s);
      out.push({ x: pt.x, y: pt.y, s: s });
    }
    out.total = total;
    return out;
  };

  /* Punkten en viss andel in i en path (0-1) */
  util.pointAtFraction = function (d, f) {
    var p = measure();
    p.setAttribute('d', d);
    var total = 0;
    try { total = p.getTotalLength(); } catch (e) { return null; }
    if (!total) return null;
    var pt = p.getPointAtLength(total * util.clamp(f, 0, 1));
    return { x: pt.x, y: pt.y };
  };

  /* Gor en vagig variant av en path (akning med puck) */
  util.wavy = function (d, amp, wavelength, straightTail) {
    var pts = util.samplePath(d, Math.min(0.25, wavelength / 8));
    if (!pts.length || pts.length < 3) return d;
    var total = pts.total;
    var tail = straightTail || 0;
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      var prev = pts[Math.max(0, i - 1)];
      var next = pts[Math.min(pts.length - 1, i + 1)];
      var tx = next.x - prev.x, ty = next.y - prev.y;
      var len = Math.sqrt(tx * tx + ty * ty) || 1e-9;
      var nx = -ty / len, ny = tx / len;
      var fadeIn = Math.min(1, p.s / (wavelength * 0.5));
      var left = total - p.s;
      var fadeOut = tail > 0 ? util.clamp((left - tail) / (wavelength * 0.5), 0, 1) : 1;
      var a = amp * fadeIn * fadeOut;
      var off = Math.sin(p.s * 2 * Math.PI / wavelength) * a;
      out.push({ x: p.x + nx * off, y: p.y + ny * off });
    }
    return util.smoothPath(out);
  };

  /* Tvarstreck langs en path - markerar bakatakning */
  util.hatch = function (d, spacing, size) {
    var pts = util.samplePath(d, spacing);
    if (!pts.length || pts.length < 3) return '';
    var r = function (n) { return Math.round(n * 1000) / 1000; };
    var out = [];
    for (var i = 1; i < pts.length - 1; i++) {
      var p = pts[i];
      var a = pts[i - 1], b = pts[i + 1];
      var tx = b.x - a.x, ty = b.y - a.y;
      var len = Math.sqrt(tx * tx + ty * ty) || 1e-9;
      var nx = -ty / len * size, ny = tx / len * size;
      out.push('M' + r(p.x - nx) + ' ' + r(p.y - ny) +
               ' L' + r(p.x + nx) + ' ' + r(p.y + ny));
    }
    return out.join(' ');
  };

  util.uid = (function () {
    var n = 0;
    return function (p) { return (p || 'id') + (++n); };
  })();

})(window.HTB);
