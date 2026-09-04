/* ============================================================
   players.js - spelarpjaser i tva grafikstilar, banken vid sidan
   och drag & drop av pjaser.
   ============================================================ */
(function (HTB) {
  'use strict';

  var el = HTB.util.el;
  var S = HTB.state;

  /* Dar puckens fastnar pa klubbladet (lokala enheter, heading 0 = hoger) */
  var BLADE = { x: 1.30, y: 0.75 };

  var players = HTB.players = {
    list: [],
    byId: {},
    blade: BLADE,
    selected: null
  };

  /* Markerad spelare far ett vridhandtag. Bara meningsfullt nar man
     placerar ut laget, dvs utanfor rorelselaget. */
  players.canSelect = function () {
    return S.tool === 'select' && !(HTB.anim && HTB.anim.enabled) &&
           !(HTB.anim && HTB.anim.playing);
  };

  players.select = function (id) {
    if (players.selected === id) return;
    players.selected = id;
    players.render();
  };

  players.rotateSelected = function (deltaDeg) {
    var p = players.selected && players.byId[players.selected];
    if (!p || !p.onIce || !players.canSelect()) return false;
    p.heading = (((p.heading + deltaDeg) % 360) + 360) % 360;
    players.updateTransform(p);
    if (HTB.puck.state.carrier === p.id) HTB.puck.follow();
    HTB.anim.notePlayerMoved(p.id);
    return true;
  };

  /* ------------------------------------------------------------
     Grafik
     ------------------------------------------------------------ */
  function figureMarkup(t, role) {
    var big = role === 'G';
    var rx = big ? 0.72 : 0.62;
    var ry = big ? 0.60 : 0.50;
    var m = [];

    // skugga pa isen
    m.push('<ellipse cx="0.04" cy="0.10" rx="' + (rx + 0.06) + '" ry="' + (ry + 0.06) +
           '" fill="rgba(0,0,0,0.14)"/>');

    // klubba: skaft + blad
    m.push('<path d="M0.24 0.42 L1.06 0.62" fill="none" stroke="#b9bec6" ' +
           'stroke-width="0.115" stroke-linecap="round"/>');
    m.push('<path d="M1.02 0.60 L1.46 0.86" fill="none" stroke="#e0a878" ' +
           'stroke-width="0.20" stroke-linecap="round"/>');

    // skridskor
    m.push('<rect x="-0.86" y="-0.44" width="0.42" height="0.20" rx="0.10" fill="' + t.skate + '"/>');
    m.push('<rect x="-0.86" y="0.24" width="0.42" height="0.20" rx="0.10" fill="' + t.skate + '"/>');

    // kropp
    m.push('<ellipse cx="-0.06" cy="0" rx="' + rx + '" ry="' + ry + '" fill="' + t.jersey +
           '" stroke="rgba(0,0,0,0.28)" stroke-width="0.055"/>');

    // axelparti i kontrastfarg
    m.push('<path d="M0.02 ' + (-ry + 0.03) + ' A0.50 0.50 0 0 1 0.02 ' + (ry - 0.03) +
           '" fill="none" stroke="' + t.trim + '" stroke-width="0.20" stroke-linecap="round"/>');

    // malvaktens benskydd
    if (big) {
      m.push('<rect x="0.30" y="-0.62" width="0.26" height="0.52" rx="0.10" fill="' + t.trim +
             '" stroke="rgba(0,0,0,0.25)" stroke-width="0.04"/>');
      m.push('<rect x="0.30" y="0.10" width="0.26" height="0.52" rx="0.10" fill="' + t.trim +
             '" stroke="rgba(0,0,0,0.25)" stroke-width="0.04"/>');
    }

    // handskar
    m.push('<circle cx="0.26" cy="-0.44" r="0.185" fill="' + t.glove +
           '" stroke="rgba(0,0,0,0.28)" stroke-width="0.045"/>');
    m.push('<circle cx="0.26" cy="0.44" r="0.185" fill="' + t.glove +
           '" stroke="rgba(0,0,0,0.28)" stroke-width="0.045"/>');

    // hjalm + ansiktsgaller
    m.push('<circle cx="0.12" cy="0" r="0.29" fill="' + t.helmet +
           '" stroke="rgba(0,0,0,0.32)" stroke-width="0.05"/>');
    m.push('<path d="M0.30 -0.15 A0.29 0.29 0 0 1 0.30 0.15" fill="none" ' +
           'stroke="#f2c9a4" stroke-width="0.10"/>');

    return m.join('');
  }

  function discMarkup(t, role) {
    var r = role === 'G' ? 0.70 : 0.62;
    var m = [];
    m.push('<path d="M' + (r * 0.85) + ' ' + (r * 0.42) + ' L1.30 0.75" fill="none" ' +
           'stroke="#4a5260" stroke-width="0.13" stroke-linecap="round"/>');
    m.push('<path d="M1.20 0.58 L1.44 0.92" fill="none" stroke="#e0a878" ' +
           'stroke-width="0.17" stroke-linecap="round"/>');
    m.push('<circle cx="0" cy="0" r="' + (r + 0.05) + '" fill="rgba(0,0,0,0.14)" ' +
           'transform="translate(0.04,0.08)"/>');
    m.push('<circle cx="0" cy="0" r="' + r + '" fill="' + t.jersey + '" stroke="' + t.trim +
           '" stroke-width="0.11"/>');
    return m.join('');
  }

  /* counterRot = transform som haller bokstaven skarmupprattt */
  function labelMarkup(t, role, style, counterRot) {
    var pos = (style === 'disc') ? { x: 0, y: 0, size: 0.82 } : { x: -0.38, y: 0, size: 0.46 };
    var fill = (style === 'disc') ? t.discText : t.label;
    return '<g transform="translate(' + pos.x + ',' + pos.y + ')">' +
             '<text transform="' + (counterRot || '') + '" x="0" y="0" ' +
             'text-anchor="middle" dominant-baseline="central" ' +
             'font-family="Segoe UI, Arial, sans-serif" font-weight="700" ' +
             'font-size="' + pos.size + '" fill="' + fill + '">' + role + '</text>' +
           '</g>';
  }

  players.shapeMarkup = function (team, role, style, counterRot) {
    var t = HTB.TEAMS[team];
    var body = (style === 'disc') ? discMarkup(t, role) : figureMarkup(t, role);
    return body + labelMarkup(t, role, style, counterRot);
  };

  /* ------------------------------------------------------------
     Data
     ------------------------------------------------------------ */
  players.init = function () {
    players.list = HTB.ROSTER.map(function (r) {
      return { id: r.id, team: r.team, role: r.role, x: 0, y: 0, heading: 0, onIce: false };
    });
    players.byId = {};
    players.selected = null;
    players.list.forEach(function (p) { players.byId[p.id] = p; });
    buildBench();
    players.render();
  };

  players.onIce = function () {
    return players.list.filter(function (p) { return p.onIce; });
  };

  players.place = function (id, x, y) {
    var p = players.byId[id];
    if (!p) return null;
    var c = HTB.board.clampToRink({ x: x, y: y });
    p.x = c.x; p.y = c.y;
    if (!p.onIce) { p.onIce = true; p.heading = 0; }
    return p;
  };

  players.remove = function (id) {
    var p = players.byId[id];
    if (p) p.onIce = false;
    if (players.selected === id) players.selected = null;
    if (HTB.puck.state.carrier === id) HTB.puck.detach();
    if (HTB.anim) HTB.anim.dropPlayer(id);
  };

  players.bladeAnchor = function (p) {
    var s = S.scale;
    var rad = p.heading * Math.PI / 180;
    var lx = BLADE.x * s, ly = BLADE.y * s;
    return {
      x: p.x + lx * Math.cos(rad) - ly * Math.sin(rad),
      y: p.y + lx * Math.sin(rad) + ly * Math.cos(rad)
    };
  };

  players.hitTest = function (x, y, maxDist) {
    var best = null, bestD = maxDist || (1.4 * S.scale);
    players.onIce().forEach(function (p) {
      var d = HTB.util.dist({ x: x, y: y }, p);
      if (d < bestD) { bestD = d; best = p; }
    });
    return best;
  };

  /* ------------------------------------------------------------
     Rendering pa tavlan
     ------------------------------------------------------------ */
  players.render = function () {
    var layer = HTB.board && HTB.board.layers.pieces;
    if (!layer) return;
    HTB.util.clear(layer);

    players.onIce().forEach(function (p) {
      var g = el('g', {
        'class': 'piece',
        'data-kind': 'player',
        'data-id': p.id,
        transform: 'translate(' + p.x + ',' + p.y + ') rotate(' + p.heading + ')'
      }, layer);

      // markering nar spelaren har pucken
      if (HTB.puck.state.carrier === p.id) {
        el('circle', {
          cx: 0, cy: 0, r: 0.95 * S.scale,
          fill: 'none', stroke: HTB.TEAMS[p.team].trail,
          'stroke-width': 0.10 * S.scale, opacity: 0.75
        }, g);
      }

      var inner = el('g', { transform: 'scale(' + S.scale + ')' }, g);
      inner.appendChild(HTB.util.frag(
        players.shapeMarkup(p.team, p.role, S.pieceStyle, HTB.board.uprightMatrix(p.heading))
      ));

      el('circle', { 'class': 'hit', cx: 0, cy: 0, r: 0.9 * S.scale }, g);

      // Markerad spelare: ring + handtag som pekar i akriktningen
      if (players.selected === p.id && players.canSelect()) {
        var sel = el('g', { transform: 'scale(' + S.scale + ')' }, g);
        el('circle', {
          cx: 0, cy: 0, r: 1.02,
          fill: 'none', stroke: '#1552b0', 'stroke-width': 0.075,
          'stroke-dasharray': '0.22 0.17', opacity: 0.85
        }, sel);
        var h = el('g', { 'class': 'rot-handle', 'data-id': p.id }, sel);
        el('line', {
          x1: 1.0, y1: 0, x2: 1.5, y2: 0,
          stroke: '#1552b0', 'stroke-width': 0.09
        }, h);
        el('circle', {
          cx: 1.62, cy: 0, r: 0.27,
          fill: '#ffffff', stroke: '#1552b0', 'stroke-width': 0.11
        }, h);
        el('circle', { cx: 1.62, cy: 0, r: 0.55, fill: 'transparent' }, h);
      }
    });

    HTB.puck.render(layer);
    syncBench();
  };

  /* Snabb uppdatering under drag/animation utan full omritning */
  players.updateTransform = function (p) {
    var node = HTB.board.layers.pieces.querySelector('.piece[data-id="' + p.id + '"]');
    if (!node) { players.render(); return; }
    node.setAttribute('transform',
      'translate(' + p.x + ',' + p.y + ') rotate(' + p.heading + ')');
    var txt = node.querySelector('text');
    if (txt) txt.setAttribute('transform', HTB.board.uprightMatrix(p.heading));
  };

  players.setStyle = function (style) {
    S.pieceStyle = style;
    players.render();
  };

  /* ------------------------------------------------------------
     Dragning
     ------------------------------------------------------------ */
  function pieceNode(id) {
    return HTB.board.layers.pieces.querySelector('.piece[data-id="' + id + '"]');
  }

  function dragHandlers(p, grab) {
    var last = { x: p.x, y: p.y };
    var origin = { x: p.x, y: p.y };
    var moved = false;
    return {
      benchDrop: true,
      moved: function () { return moved; },
      move: function (pt, ev) {
        var raw = { x: pt.x - grab.x, y: pt.y - grab.y };
        if (HTB.util.dist(origin, HTB.board.clampToRink(raw)) > 0.35 * S.scale) moved = true;
        var c = HTB.board.clampToRink(raw);
        var dx = c.x - last.x, dy = c.y - last.y;
        if (dx * dx + dy * dy > 0.09) {
          p.heading = Math.atan2(dy, dx) * 180 / Math.PI;
          last = { x: c.x, y: c.y };
        }
        p.x = c.x; p.y = c.y;
        players.updateTransform(p);
        if (HTB.puck.state.carrier === p.id) HTB.puck.follow();

        HTB.board.updateDragFeedback({
          node: pieceNode(p.id),
          markup: players.chipSvg(p.team, p.role),
          overBench: HTB.board.isOverBench(ev),
          outside: HTB.board.isOutsideRink(raw, 0.8 * S.scale),
          clientX: ev.clientX, clientY: ev.clientY
        });
      },
      end: function (pt, ev) {
        if (HTB.board.isOverBench(ev)) {
          players.remove(p.id);
          if (players.selected === p.id) players.selected = null;
        } else {
          HTB.anim.notePlayerMoved(p.id, p.x - origin.x, p.y - origin.y);
          // Ett klick utan forflyttning markerar spelaren for rotation
          if (!moved && players.canSelect()) {
            players.selected = (players.selected === p.id) ? null : p.id;
          }
        }
        players.render();
      }
    };
  }

  players.beginDrag = function (id, pt) {
    var p = players.byId[id];
    if (!p) return;
    var grab = { x: pt.x - p.x, y: pt.y - p.y };
    HTB.board.startDrag(dragHandlers(p, grab));
  };

  /* Vrid spelaren genom att dra i handtaget */
  players.beginRotate = function (id) {
    var p = players.byId[id];
    if (!p || !p.onIce) return;
    HTB.board.startDrag({
      move: function (pt) {
        var dx = pt.x - p.x, dy = pt.y - p.y;
        if (dx * dx + dy * dy < 0.04) return;
        p.heading = Math.atan2(dy, dx) * 180 / Math.PI;
        players.updateTransform(p);
        if (HTB.puck.state.carrier === p.id) HTB.puck.follow();
      },
      end: function () {
        HTB.anim.notePlayerMoved(p.id);
        players.render();
      }
    });
  };

  players.beginSpawn = function (id, pt) {
    var p = players.place(id, pt.x, pt.y);
    if (!p) return;
    players.render();
    HTB.board.startDrag(dragHandlers(p, { x: 0, y: 0 }));
  };

  /* ------------------------------------------------------------
     Banken
     ------------------------------------------------------------ */
  /* Anvands bade av banken och av slapkopian under drag */
  function chipSvg(team, role) {
    return '<svg viewBox="-1.5 -1.6 3.0 3.0" xmlns="' + HTB.util.NS + '">' +
           '<g transform="rotate(-90)">' +
           players.shapeMarkup(team, role, S.pieceStyle, 'rotate(90)') +
           '</g></svg>';
  }
  players.chipSvg = chipSvg;

  function buildBench() {
    ['A', 'B'].forEach(function (team) {
      var row = document.querySelector('.bench-row[data-row="' + team + '"]');
      if (!row) return;
      row.innerHTML = '';
      players.list.filter(function (p) { return p.team === team; })
        .forEach(function (p) {
          var chip = document.createElement('div');
          chip.className = 'chip';
          chip.setAttribute('data-id', p.id);
          chip.title = p.role === 'G' ? 'Målvakt' : (p.role === 'B' ? 'Back' : 'Forward');
          chip.innerHTML = chipSvg(p.team, p.role);
          chip.addEventListener('pointerdown', function (ev) {
            if (p.onIce || (HTB.anim && HTB.anim.playing)) return;
            ev.preventDefault();
            players.beginSpawn(p.id, HTB.board.eventPoint(ev));
          });
          row.appendChild(chip);
        });
    });
    HTB.puck.buildBenchChip();
  }

  players.rebuildBench = buildBench;

  function syncBench() {
    players.list.forEach(function (p) {
      var chip = document.querySelector('.chip[data-id="' + p.id + '"]');
      if (chip) chip.classList.toggle('used', p.onIce);
    });
    var pc = document.querySelector('.chip[data-id="puck"]');
    if (pc) pc.classList.toggle('used', HTB.puck.state.onIce);
  }

  players.syncBench = syncBench;

})(window.HTB);
