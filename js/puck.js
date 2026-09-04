/* ============================================================
   puck.js - pucken: los pa isen eller kopplad till en spelares klubba.
   ============================================================ */
(function (HTB) {
  'use strict';

  var el = HTB.util.el;
  var S = HTB.state;

  var puck = HTB.puck = {
    state: { onIce: false, x: 0, y: 0, carrier: null }
  };

  /* Hur nara en spelare pucken maste slappas for att fastna pa klubban */
  function snapRadius() { return 1.6 * S.scale; }
  function radius() { return 0.34 * S.scale; }

  puck.attach = function (playerId) {
    puck.state.carrier = playerId;
    puck.follow();
  };

  puck.detach = function () {
    puck.state.carrier = null;
  };

  /* Flyttar pucken till barararens klubbblad */
  puck.follow = function () {
    var id = puck.state.carrier;
    if (!id) return;
    var p = HTB.players.byId[id];
    if (!p || !p.onIce) { puck.detach(); return; }
    var a = HTB.players.bladeAnchor(p);
    puck.state.x = a.x;
    puck.state.y = a.y;
    var node = HTB.board.layers.pieces.querySelector('.piece[data-kind="puck"]');
    if (node) node.setAttribute('transform', 'translate(' + a.x + ',' + a.y + ')');
  };

  /* Flyttar pucken utan att rora vid barar-kopplingen (anvands av passningar) */
  puck.moveTo = function (x, y) {
    puck.state.x = x;
    puck.state.y = y;
    var node = HTB.board.layers.pieces.querySelector('.piece[data-kind="puck"]');
    if (node) node.setAttribute('transform', 'translate(' + x + ',' + y + ')');
  };

  puck.place = function (x, y) {
    var c = HTB.board.clampToRink({ x: x, y: y });
    puck.state.x = c.x;
    puck.state.y = c.y;
    puck.state.onIce = true;
  };

  puck.removeFromIce = function () {
    puck.state.onIce = false;
    puck.state.carrier = null;
  };

  /* ------------------------------------------------------------
     Rendering
     ------------------------------------------------------------ */
  puck.render = function (layer) {
    if (!puck.state.onIce) return;
    if (puck.state.carrier) puck.state.carrier = HTB.players.byId[puck.state.carrier] &&
      HTB.players.byId[puck.state.carrier].onIce ? puck.state.carrier : null;
    if (puck.state.carrier) {
      var a = HTB.players.bladeAnchor(HTB.players.byId[puck.state.carrier]);
      puck.state.x = a.x;
      puck.state.y = a.y;
    }

    var r = radius();
    var g = el('g', {
      'class': 'piece',
      'data-kind': 'puck',
      'data-id': 'puck',
      transform: 'translate(' + puck.state.x + ',' + puck.state.y + ')'
    }, layer);

    el('ellipse', { cx: 0.03 * S.scale, cy: 0.07 * S.scale, rx: r, ry: r * 0.92,
      fill: 'rgba(0,0,0,0.22)' }, g);
    el('circle', { cx: 0, cy: 0, r: r, fill: '#15171b', stroke: '#4c525c',
      'stroke-width': r * 0.16 }, g);
    el('circle', { 'class': 'hit', cx: 0, cy: 0, r: Math.max(r * 2.2, 0.7 * S.scale) }, g);
  };

  /* ------------------------------------------------------------
     Dragning
     ------------------------------------------------------------ */
  function handlers() {
    puck.detach();
    return {
      benchDrop: true,
      move: function (pt, ev) {
        puck.place(pt.x, pt.y);
        var node = HTB.board.layers.pieces.querySelector('.piece[data-kind="puck"]');
        if (node) node.setAttribute('transform',
          'translate(' + puck.state.x + ',' + puck.state.y + ')');

        HTB.board.updateDragFeedback({
          node: node,
          markup: puck.chipSvg(),
          overBench: HTB.board.isOverBench(ev),
          outside: HTB.board.isOutsideRink(pt, 0.8 * S.scale),
          clientX: ev.clientX, clientY: ev.clientY
        });
      },
      end: function (pt, ev) {
        if (HTB.board.isOverBench(ev)) {
          puck.removeFromIce();
          HTB.players.render();
          return;
        }
        var near = HTB.players.hitTest(pt.x, pt.y, snapRadius());
        if (near) puck.attach(near.id);
        HTB.anim.notePuckMoved();
        HTB.players.render();
      }
    };
  }

  puck.beginDrag = function () {
    HTB.board.startDrag(handlers());
  };

  puck.beginSpawn = function (pt) {
    puck.place(pt.x, pt.y);
    HTB.players.render();
    HTB.board.startDrag(handlers());
  };

  /* ------------------------------------------------------------
     Bank-chip
     ------------------------------------------------------------ */
  /* Anvands bade av banken och av slapkopian under drag */
  puck.chipSvg = function () {
    return '<svg viewBox="-1 -1 2 2" xmlns="' + HTB.util.NS + '">' +
      '<ellipse cx="0.05" cy="0.1" rx="0.56" ry="0.5" fill="rgba(0,0,0,0.18)"/>' +
      '<circle cx="0" cy="0" r="0.54" fill="#15171b" stroke="#4c525c" stroke-width="0.09"/>' +
      '</svg>';
  };

  puck.buildBenchChip = function () {
    var row = document.querySelector('.bench-row[data-row="puck"]');
    if (!row) return;
    row.innerHTML = '';
    var chip = document.createElement('div');
    chip.className = 'chip';
    chip.setAttribute('data-id', 'puck');
    chip.title = 'Puck';
    chip.innerHTML = puck.chipSvg();
    chip.addEventListener('pointerdown', function (ev) {
      if (puck.state.onIce || (HTB.anim && HTB.anim.playing)) return;
      ev.preventDefault();
      puck.beginSpawn(HTB.board.eventPoint(ev));
    });
    row.appendChild(chip);
  };

})(window.HTB);
