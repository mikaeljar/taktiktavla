/* ============================================================
   rink.js - ritar sjalva isen. Samma kod anvands bade for tavlan
   och for miniatyrerna i startmenyn; bara viewBox skiljer.
   ============================================================ */
(function (HTB) {
  'use strict';

  var el = HTB.util.el;
  var R = HTB.RINK;

  var C = {
    board: '#20262e',
    ice: '#ffffff',
    red: '#e11d2e',
    blue: '#1c7ed6',
    crease: '#cfe6fb',
    goal: '#f2f4f7'
  };

  var LW = {
    board: 0.30,
    goalLine: 0.13,
    blueLine: 0.32,
    centerLine: 0.32,
    circle: 0.13,
    detail: 0.11
  };

  /* Rinkens ytterkontur med rundade horn */
  function outlinePath() {
    var L = R.L, W = R.W, r = R.cornerR;
    return [
      'M', r, 0,
      'H', L - r,
      'A', r, r, 0, 0, 1, L, r,
      'V', W - r,
      'A', r, r, 0, 0, 1, L - r, W,
      'H', r,
      'A', r, r, 0, 0, 1, 0, W - r,
      'V', r,
      'A', r, r, 0, 0, 1, r, 0,
      'Z'
    ].join(' ');
  }

  /* Var mallinjen moter sargen (skarning med hornbagen) */
  function goalLineSpan(x) {
    var r = R.cornerR;
    var cx = (x < R.L / 2) ? r : R.L - r;
    var dx = Math.abs(cx - x);
    var dy = Math.sqrt(Math.max(0, r * r - dx * dx));
    return { y1: r - dy, y2: R.W - (r - dy) };
  }

  /* Tekningscirkel med prickmarkeringar */
  function faceoffCircle(g, cx, cy) {
    el('circle', {
      cx: cx, cy: cy, r: R.circleR,
      fill: 'none', stroke: C.red, 'stroke-width': LW.circle
    }, g);

    // Yttre hash marks (over och under cirkeln)
    [-1, 1].forEach(function (sy) {
      [-1, 1].forEach(function (sx) {
        var x = cx + sx * 0.9;
        var y0 = cy + sy * R.circleR;
        el('line', {
          x1: x, y1: y0, x2: x, y2: y0 + sy * 0.9,
          stroke: C.red, 'stroke-width': LW.detail
        }, g);
      });
    });

    faceoffSpot(g, cx, cy);
  }

  /* Sjalva tekningspricken */
  function faceoffSpot(g, cx, cy) {
    el('circle', { cx: cx, cy: cy, r: 0.42, fill: C.red }, g);
  }

  /* Malgard vid kortsidan. dir = +1 for vanster planhalva, -1 for hoger */
  function goalArea(g, gx, dir) {
    var cy = R.W / 2;
    var cr = R.creaseR;
    var sweep = dir > 0 ? 1 : 0;

    el('path', {
      d: 'M ' + gx + ' ' + (cy - cr) +
         ' A ' + cr + ' ' + cr + ' 0 0 ' + sweep + ' ' + gx + ' ' + (cy + cr) + ' Z',
      fill: C.crease, stroke: C.red, 'stroke-width': LW.detail
    }, g);
  }

  /* Malbur for zonspel: staende vid vardera langsidan, i hojd med
     tekningsprickarna. dir = +1 nar buren skjuter in mot mitten uppifran. */
  function crossIceGoal(g, cx, yBack, dir) {
    var w = R.goalW, d = R.goalD;
    var y = dir > 0 ? yBack : yBack - d;

    el('rect', {
      x: cx - w / 2, y: y, width: w, height: d, rx: 0.24,
      fill: C.goal, stroke: C.red, 'stroke-width': LW.detail
    }, g);

    // tjockare bakkant sa att det syns at vilket hall buren oppnar sig
    var by = dir > 0 ? y : y + d;
    el('line', {
      x1: cx - w / 2 + 0.14, y1: by, x2: cx + w / 2 - 0.14, y2: by,
      stroke: C.red, 'stroke-width': LW.goalLine * 1.7, 'stroke-linecap': 'round'
    }, g);
  }

  /* ------------------------------------------------------------
     Ritar hela rinken i angiven grupp/svg.
     ------------------------------------------------------------ */
  HTB.rink = {
    colors: C,

    draw: function (target, formatKey) {
      HTB.util.clear(target);
      var fmt = HTB.FORMATS[formatKey] || HTB.FORMATS.full;
      var cy = R.W / 2;

      // Is + sarg
      el('path', {
        d: outlinePath(),
        fill: C.ice, stroke: C.board, 'stroke-width': LW.board,
        'stroke-linejoin': 'round'
      }, target);

      // Mallinjer
      [R.goalLine, R.L - R.goalLine].forEach(function (x) {
        var sp = goalLineSpan(x);
        el('line', {
          x1: x, y1: sp.y1, x2: x, y2: sp.y2,
          stroke: C.red, 'stroke-width': LW.goalLine
        }, target);
      });

      // Malgardar (utan malburar - de star sallan med i en taktikskiss)
      goalArea(target, R.goalLine, 1);
      goalArea(target, R.L - R.goalLine, -1);

      // Blalinjer
      [R.blueLine, R.L - R.blueLine].forEach(function (x) {
        el('line', {
          x1: x, y1: 0, x2: x, y2: R.W,
          stroke: C.blue, 'stroke-width': LW.blueLine
        }, target);
      });

      // Mittlinje
      el('line', {
        x1: R.center, y1: 0, x2: R.center, y2: R.W,
        stroke: C.red, 'stroke-width': LW.centerLine
      }, target);

      // Mittcirkel + mittprick
      el('circle', {
        cx: R.center, cy: cy, r: R.circleR,
        fill: 'none', stroke: C.blue, 'stroke-width': LW.circle
      }, target);
      el('circle', { cx: R.center, cy: cy, r: 0.42, fill: C.blue }, target);

      // Zontekningar (4 st)
      [R.zoneDotX, R.L - R.zoneDotX].forEach(function (x) {
        [cy - R.dotOffY, cy + R.dotOffY].forEach(function (y) {
          faceoffCircle(target, x, y);
        });
      });

      // Neutralzonsprickar (4 st, utan cirkel)
      [R.neutralDotX, R.L - R.neutralDotX].forEach(function (x) {
        [cy - R.dotOffY, cy + R.dotOffY].forEach(function (y) {
          faceoffSpot(target, x, y);
        });
      });

      // Zontavlan: tva burar vid langsidorna for tvarsoverspel
      if (fmt.crossIceGoals) {
        crossIceGoal(target, R.zoneDotX, R.crossGoalInset, 1);
        crossIceGoal(target, R.zoneDotX, R.W - R.crossGoalInset, -1);
      }

      // Snittkant for halvplan / zon sa att beskarningen ser avsiktlig ut
      if (fmt.cut) {
        el('line', {
          x1: fmt.w - LW.board / 2, y1: 0, x2: fmt.w - LW.board / 2, y2: R.W,
          stroke: C.board, 'stroke-width': LW.board
        }, target);
      }

      return target;
    },

    /* Malens lagen i rinkkoordinater, med traffradie for skott.
       Bara de mal som ryms inom formatets beskarning tas med. */
    goals: function (formatKey) {
      var fmt = HTB.FORMATS[formatKey] || HTB.FORMATS.full;
      var cy = R.W / 2;
      var out = [
        { x: R.goalLine, y: cy, r: 2.4 },
        { x: R.L - R.goalLine, y: cy, r: 2.4 }
      ];
      if (fmt.crossIceGoals) {
        out.push({ x: R.zoneDotX, y: R.crossGoalInset + R.goalD / 2, r: 1.7 });
        out.push({ x: R.zoneDotX, y: R.W - R.crossGoalInset - R.goalD / 2, r: 1.7 });
      }
      return out.filter(function (g) { return g.x <= fmt.w; });
    },

    /* Fristaende miniatyr till startmenyn */
    thumbnail: function (formatKey) {
      var fmt = HTB.FORMATS[formatKey] || HTB.FORMATS.full;
      var pad = 0.4;
      var svg = el('svg', {
        viewBox: (-pad) + ' ' + (-pad) + ' ' + (fmt.w + pad * 2) + ' ' + (fmt.h + pad * 2),
        preserveAspectRatio: 'xMidYMid meet',
        width: '100%', height: '100%'
      });

      // Utan klippning skulle den bortklippta delen av rinken synas
      // nar behallaren ar bredare an formatets proportioner.
      var id = HTB.util.uid('thumbclip');
      var defs = el('defs', {}, svg);
      var cp = el('clipPath', { id: id, clipPathUnits: 'userSpaceOnUse' }, defs);
      el('rect', {
        x: -0.2, y: -0.2, width: fmt.w + 0.4, height: fmt.h + 0.4
      }, cp);

      var g = el('g', { 'clip-path': 'url(#' + id + ')' }, svg);
      HTB.rink.draw(g, formatKey);
      return svg;
    }
  };

})(window.HTB);
