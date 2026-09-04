/* ============================================================
   board.js - SVG-stomme, vy-transform (rotation/spegling),
   koordinatkonvertering och all pekar-/musrouting.
   ============================================================ */
(function (HTB) {
  'use strict';

  var el = HTB.util.el;
  var S = HTB.state;

  var board = HTB.board = {
    svg: null,
    view: null,
    layers: {},
    dragging: null
  };

  /* ------------------------------------------------------------
     Uppbyggnad
     ------------------------------------------------------------ */
  board.init = function () {
    board.svg = document.getElementById('board');
    HTB.util.clear(board.svg);

    board.defs = el('defs', {}, board.svg);

    // Klippning mot formatets kant. Ligger pa en otransformerad wrapper
    // sa att klipprektangeln alltid ar i viewBox-koordinater.
    var cp = el('clipPath', { id: 'boardClip', clipPathUnits: 'userSpaceOnUse' }, board.defs);
    board.clipRect = el('rect', {}, cp);

    var wrap = el('g', { 'clip-path': 'url(#boardClip)' }, board.svg);
    board.view = el('g', { id: 'view' }, wrap);

    ['rink', 'drawings', 'trails', 'paths', 'pieces'].forEach(function (name) {
      board.layers[name] = el('g', { id: 'layer-' + name }, board.view);
    });

    board.setFormat(S.format);
    installInput();
  };

  board.setFormat = function (key) {
    S.format = HTB.FORMATS[key] ? key : 'full';
    S.scale = HTB.FORMATS[S.format].scale;
    HTB.rink.draw(board.layers.rink, S.format);
    board.applyView();
  };

  /* ------------------------------------------------------------
     Vy: rotation och spegling
     ------------------------------------------------------------ */
  board.applyView = function () {
    var fmt = HTB.FORMATS[S.format];
    var w = fmt.w, h = fmt.h;
    var pad = 0.6;
    var rot = ((S.rotation % 360) + 360) % 360;

    var vw = (rot === 90 || rot === 270) ? h : w;
    var vh = (rot === 90 || rot === 270) ? w : h;
    board.svg.setAttribute('viewBox',
      (-pad) + ' ' + (-pad) + ' ' + (vw + pad * 2) + ' ' + (vh + pad * 2));

    // Klipp tatt mot rinkens kant (bara plats for sargens linjebredd),
    // annars syns en strimma av isen utanfor beskarningen.
    var cm = 0.2;
    board.clipRect.setAttribute('x', -cm);
    board.clipRect.setAttribute('y', -cm);
    board.clipRect.setAttribute('width', vw + cm * 2);
    board.clipRect.setAttribute('height', vh + cm * 2);

    var rotPart = '';
    if (rot === 90)  rotPart = 'translate(' + h + ',0) rotate(90)';
    if (rot === 180) rotPart = 'translate(' + w + ',' + h + ') rotate(180)';
    if (rot === 270) rotPart = 'translate(0,' + w + ') rotate(270)';

    var flipPart = '';
    if (S.flipX && S.flipY) flipPart = 'translate(' + w + ',' + h + ') scale(-1,-1)';
    else if (S.flipX)       flipPart = 'translate(' + w + ',0) scale(-1,1)';
    else if (S.flipY)       flipPart = 'translate(0,' + h + ') scale(1,-1)';

    board.view.setAttribute('transform', (rotPart + ' ' + flipPart).trim());

    // Etiketter och puck maste ritas om sa att texten star ratt pa skarmen
    if (HTB.players && HTB.players.render) HTB.players.render();
  };

  board.rotate = function (deltaDeg) {
    S.rotation = (((S.rotation + deltaDeg) % 360) + 360) % 360;
    board.applyView();
  };

  board.toggleFlip = function (axis) {
    if (axis === 'x') S.flipX = !S.flipX;
    else S.flipY = !S.flipY;
    board.applyView();
  };

  /* Linjardelen av vy-transformen som SVG-matris {a,b,c,d} */
  function viewLinear() {
    var rad = S.rotation * Math.PI / 180;
    var cos = Math.round(Math.cos(rad) * 1e6) / 1e6;
    var sin = Math.round(Math.sin(rad) * 1e6) / 1e6;
    var fx = S.flipX ? -1 : 1;
    var fy = S.flipY ? -1 : 1;
    return { a: cos * fx, b: sin * fx, c: -sin * fy, d: cos * fy };
  }

  /* Transform som gor ett element skarmupprattt och ospeglat,
     trots vyns rotation/spegling och pjasens egen riktning. */
  board.uprightMatrix = function (headingDeg) {
    var v = viewLinear();
    var rad = (headingDeg || 0) * Math.PI / 180;
    var ch = Math.cos(rad), sh = Math.sin(rad);

    // A = V * R(heading)
    var a = v.a * ch + v.c * sh;
    var b = v.b * ch + v.d * sh;
    var c = -v.a * sh + v.c * ch;
    var d = -v.b * sh + v.d * ch;

    var det = a * d - b * c;
    if (!det) return '';
    var r = function (n) { return Math.round(n * 1e6) / 1e6; };
    return 'matrix(' + r(d / det) + ',' + r(-b / det) + ',' +
                       r(-c / det) + ',' + r(a / det) + ',0,0)';
  };

  /* ------------------------------------------------------------
     Koordinater
     ------------------------------------------------------------ */
  board.toRink = function (clientX, clientY) {
    var ctm = board.view.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    var pt = board.svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    var p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  board.eventPoint = function (ev) {
    return board.toRink(ev.clientX, ev.clientY);
  };

  board.clampToRink = function (p) {
    var fmt = HTB.FORMATS[S.format];
    var m = 0.5;
    return {
      x: HTB.util.clamp(p.x, m, fmt.w - m),
      y: HTB.util.clamp(p.y, m, fmt.h - m)
    };
  };

  /* Sant nar punkten hamnat sa langt utanfor rinken att pjasen
     tydligt slutat folja pekaren. Marginalen hindrar att
     slapkopian blinkar fram nar man bara lagger en pjas mot sargen. */
  board.isOutsideRink = function (p, margin) {
    var m = margin || 0;
    var c = board.clampToRink(p);
    return Math.abs(c.x - p.x) > m || Math.abs(c.y - p.y) > m;
  };

  board.isOverBench = function (ev) {
    var bench = document.getElementById('bench');
    if (!bench) return false;
    var r = bench.getBoundingClientRect();
    return ev.clientX >= r.left && ev.clientX <= r.right &&
           ev.clientY >= r.top && ev.clientY <= r.bottom;
  };

  /* ------------------------------------------------------------
     Verktygsbyte -> styr vilka lager som tar emot klick
     ------------------------------------------------------------ */
  board.setTool = function (tool) {
    S.tool = tool;
    var drawing = HTB.DRAW_TOOLS.indexOf(tool) >= 0;
    var erasing = tool === 'erase';

    board.layers.pieces.style.pointerEvents = (drawing || erasing) ? 'none' : 'auto';
    board.layers.drawings.style.pointerEvents = erasing ? 'auto' : 'none';
    board.layers.paths.style.pointerEvents = erasing ? 'auto' : 'none';

    board.svg.classList.remove('tool-draw', 'tool-erase', 'tool-select');
    board.svg.classList.add(drawing ? 'tool-draw' : (erasing ? 'tool-erase' : 'tool-select'));

    if (tool !== 'select' && HTB.players) HTB.players.select(null);
  };

  /* ------------------------------------------------------------
     Slapkopia som foljer pekaren nar pjasen sjalv har fastnat
     mot sargen, sa att det syns att man fortfarande haller i den.
     ------------------------------------------------------------ */
  var ghost = null;

  function ghostEl() {
    if (!ghost) {
      ghost = document.createElement('div');
      ghost.id = 'dragGhost';
      ghost.hidden = true;
      document.body.appendChild(ghost);
    }
    return ghost;
  }

  board.showGhost = function (markup, clientX, clientY, remove) {
    var g = ghostEl();
    if (g.getAttribute('data-markup') !== markup) {
      g.innerHTML = markup + '<span class="x">&times;</span>';
      g.setAttribute('data-markup', markup);
    }
    g.classList.toggle('remove', !!remove);
    g.style.left = clientX + 'px';
    g.style.top = clientY + 'px';
    g.hidden = false;
  };

  board.hideGhost = function () {
    if (ghost) {
      ghost.hidden = true;
      ghost.classList.remove('remove');
    }
  };

  /* Gemensam aterkoppling under drag av en pjas:
     slapkopia + nedtonad pjas nar pekaren lamnat isen. */
  board.updateDragFeedback = function (opts) {
    var away = opts.overBench || opts.outside;
    if (away) board.showGhost(opts.markup, opts.clientX, opts.clientY, opts.overBench);
    else board.hideGhost();
    if (opts.node) opts.node.classList.toggle('detached', away);
    return away;
  };

  /* ------------------------------------------------------------
     Generisk dragning: lyssnare pa window sa att draget
     overlever att pekaren lamnar SVG:n eller gar ut over banken.
     ------------------------------------------------------------ */
  var detachDrag = null;

  board.startDrag = function (handlers) {
    // Ett pagaende drag maste avslutas helt, annars ligger bada
    // uppsattningarna lyssnare kvar och skriver over varandra.
    if (detachDrag) board.endDrag();
    board.dragging = handlers;

    var bench = document.getElementById('bench');

    function onMove(ev) {
      if (ev.cancelable) ev.preventDefault();
      // Visa banken som slappyta nar pjasen ar pa vag dit
      if (handlers.benchDrop && bench) {
        bench.classList.toggle('drop-active', board.isOverBench(ev));
      }
      if (handlers.move) handlers.move(board.eventPoint(ev), ev);
    }
    function onUp(ev) {
      detach();
      if (handlers.end) handlers.end(board.eventPoint(ev), ev);
    }
    function detach() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (bench) bench.classList.remove('drop-active');
      board.hideGhost();
      detachDrag = null;
      board.dragging = null;
    }

    detachDrag = detach;
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  /* Avbryter ett pagaende drag utan att kora dess end-hanterare */
  board.endDrag = function () {
    if (detachDrag) detachDrag();
  };

  /* ------------------------------------------------------------
     Routing av pointerdown pa tavlan
     ------------------------------------------------------------ */
  function installInput() {
    board.svg.addEventListener('pointerdown', function (ev) {
      if (ev.button !== undefined && ev.button !== 0) return;
      if (HTB.anim && HTB.anim.playing) return;

      var tool = S.tool;
      var pt = board.eventPoint(ev);

      if (HTB.DRAW_TOOLS.indexOf(tool) >= 0) {
        ev.preventDefault();
        HTB.draw.begin(pt);
        return;
      }

      if (tool === 'erase') {
        // hanteras av klick-lyssnare pa de ritade elementen
        return;
      }

      // tool === 'select'
      // Vridhandtaget ligger inuti pjasgruppen och maste testas forst
      var handle = ev.target.closest ? ev.target.closest('.rot-handle') : null;
      if (handle) {
        ev.preventDefault();
        HTB.players.beginRotate(handle.getAttribute('data-id'));
        return;
      }

      var piece = ev.target.closest ? ev.target.closest('.piece') : null;
      if (!piece) {
        HTB.players.select(null);
        return;
      }
      ev.preventDefault();

      var kind = piece.getAttribute('data-kind');
      var id = piece.getAttribute('data-id');

      if (kind === 'puck') {
        // I rorelselaget blir ett puckdrag till en spelare antingen en
        // passning (nagon har pucken) eller ett upplock (pucken ar los).
        if (!(HTB.anim.enabled && HTB.anim.beginPuckEvent())) HTB.puck.beginDrag(pt);
      } else if (kind === 'player') {
        // Ctrl (eller Cmd) flyttar pjasen aven i rorelselaget, sa att man
        // kan justera utgangslaget utan att det blir en ny akbana.
        var moveInstead = ev.ctrlKey || ev.metaKey;
        if (HTB.anim.enabled && !moveInstead) HTB.anim.beginPath(id, pt);
        else HTB.players.beginDrag(id, pt);
      }
    });

    // Hindra att sidan panorerar pa surfplatta
    board.svg.addEventListener('touchstart', function (ev) {
      if (ev.cancelable) ev.preventDefault();
    }, { passive: false });
  }

})(window.HTB);
