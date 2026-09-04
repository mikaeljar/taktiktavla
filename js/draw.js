/* ============================================================
   draw.js - ritverktygen: akning, akning med puck, passning,
   skott, frihand samt sudd, angra och gor om.
   ============================================================ */
(function (HTB) {
  'use strict';

  var util = HTB.util;
  var el = util.el;
  var S = HTB.state;

  var draw = HTB.draw = {
    items: []
  };

  var undoStack = [];
  var redoStack = [];
  var live = null;

  /* ------------------------------------------------------------
     Pilspetsar - en marker per farg, skapas vid behov
     ------------------------------------------------------------ */
  var markerCache = {};

  function markerKey(kind, color) {
    return kind + '-' + color.replace(/[^a-z0-9]/gi, '');
  }

  draw.marker = function (kind, color) {
    var id = markerKey(kind, color);
    if (markerCache[id]) return id;

    var defs = HTB.board.defs;
    var m;
    if (kind === 'chv') {
      m = el('marker', {
        id: id, viewBox: '0 0 12 10', refX: 11, refY: 5,
        markerWidth: 5.5, markerHeight: 5.5, orient: 'auto'
      }, defs);
      el('path', {
        d: 'M1 1.2 L5.6 5 L1 8.8', fill: 'none', stroke: color,
        'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
      }, m);
      el('path', {
        d: 'M6 1.2 L10.6 5 L6 8.8', fill: 'none', stroke: color,
        'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
      }, m);
    } else {
      m = el('marker', {
        id: id, viewBox: '0 0 10 10', refX: 8.6, refY: 5,
        markerWidth: 4.6, markerHeight: 4.6, orient: 'auto'
      }, defs);
      el('path', { d: 'M0.4 0.9 L9.2 5 L0.4 9.1 L2.6 5 Z', fill: color }, m);
    }
    markerCache[id] = true;
    return id;
  };

  draw.resetMarkers = function () { markerCache = {}; };

  /* ------------------------------------------------------------
     Rendering
     ------------------------------------------------------------ */
  function strokeWidth() { return 0.21 * S.scale; }

  function pathData(item) {
    var d = util.smoothPath(item.points);
    if (item.type === 'skatepuck') {
      d = util.wavy(d, 0.40 * S.scale, 1.55 * S.scale, 1.1 * S.scale);
    }
    return d;
  }

  function renderItem(item, layer) {
    var d = pathData(item);
    if (!d) return;

    var g = el('g', { 'class': 'stroke-item', 'data-id': item.id }, layer);
    var attrs = {
      d: d, fill: 'none', stroke: item.color,
      'stroke-width': strokeWidth(),
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'pointer-events': 'none'
    };

    if (item.type === 'pass') {
      attrs['stroke-dasharray'] = (0.42 * S.scale) + ' ' + (0.40 * S.scale);
    }
    if (item.type === 'skate' || item.type === 'skatepuck' || item.type === 'pass') {
      attrs['marker-end'] = 'url(#' + draw.marker('arw', item.color) + ')';
    }
    if (item.type === 'shot') {
      attrs['marker-end'] = 'url(#' + draw.marker('chv', item.color) + ')';
    }
    el('path', attrs, g);

    // bred osynlig traffyta for suddet
    el('path', {
      d: d, fill: 'none', stroke: 'transparent',
      'stroke-width': Math.max(strokeWidth() * 4, 0.9),
      'pointer-events': 'stroke'
    }, g);
  }

  draw.renderAll = function () {
    var layer = HTB.board.layers.drawings;
    util.clear(layer);
    draw.items.forEach(function (it) { renderItem(it, layer); });
  };

  /* ------------------------------------------------------------
     Historik
     ------------------------------------------------------------ */
  function pushHistory() {
    undoStack.push(draw.items.slice());
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
  }

  draw.undo = function () {
    if (!undoStack.length) return;
    redoStack.push(draw.items.slice());
    draw.items = undoStack.pop();
    draw.renderAll();
  };

  draw.redo = function () {
    if (!redoStack.length) return;
    undoStack.push(draw.items.slice());
    draw.items = redoStack.pop();
    draw.renderAll();
  };

  draw.canUndo = function () { return undoStack.length > 0; };
  draw.canRedo = function () { return redoStack.length > 0; };

  draw.clearAll = function () {
    if (!draw.items.length) return;
    pushHistory();
    draw.items = [];
    draw.renderAll();
  };

  /* ------------------------------------------------------------
     Ritning
     ------------------------------------------------------------ */
  draw.begin = function (pt) {
    var type = S.tool;
    if (HTB.DRAW_TOOLS.indexOf(type) < 0) return;

    // Lokal referens: ett nytt drag far inte kapa det pagaendes tillstand.
    var current = {
      id: util.uid('d'),
      type: type,
      color: S.color,
      points: [{ x: pt.x, y: pt.y }],
      node: el('path', {
        fill: 'none', stroke: S.color,
        'stroke-width': strokeWidth(),
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        opacity: 0.85, 'pointer-events': 'none'
      }, HTB.board.layers.drawings)
    };
    live = current;

    HTB.board.startDrag({
      move: function (p) {
        var last = current.points[current.points.length - 1];
        if (util.dist(last, p) < 0.15) return;
        current.points.push({ x: p.x, y: p.y });
        current.node.setAttribute('d', util.smoothPath(current.points));
      },
      end: function () {
        var pts = current.points;
        if (current.node.parentNode) current.node.parentNode.removeChild(current.node);

        var longEnough = pts.length > 1 &&
          util.pathLength(util.smoothPath(pts)) > 0.6 * S.scale;
        if (longEnough) {
          var tol = (type === 'pen') ? 0.10 * S.scale : 0.22 * S.scale;
          pushHistory();
          draw.items.push({
            id: current.id, type: type, color: current.color,
            points: util.simplify(pts, tol)
          });
        }
        if (live === current) live = null;
        draw.renderAll();
      }
    });
  };

  /* ------------------------------------------------------------
     Sudd
     ------------------------------------------------------------ */
  draw.eraseAt = function (target) {
    var node = target.closest ? target.closest('.stroke-item') : null;
    if (!node) return false;
    var id = node.getAttribute('data-id');
    var idx = -1;
    draw.items.forEach(function (it, i) { if (it.id === id) idx = i; });
    if (idx < 0) return false;
    pushHistory();
    draw.items.splice(idx, 1);
    draw.renderAll();
    return true;
  };

  draw.init = function () {
    HTB.board.layers.drawings.addEventListener('pointerdown', function (ev) {
      if (S.tool !== 'erase') return;
      ev.preventDefault();
      draw.eraseAt(ev.target);
    });
  };

})(window.HTB);
