/* ============================================================
   animate.js - rorelselaget: spela in banor genom att dra spelare,
   dela upp i steg och spela upp alla forflyttningar samtidigt
   med spar bakom.

   Modell: bara ETT startlage sparas (anim.base) - laget nar den
   forsta rorelsen spelades in. Varje stegs startpositioner raknas
   fram live genom att folja kedjan framat fran base. Darfor slar
   en andring i ett tidigt steg automatiskt igenom pa alla senare.
   ============================================================ */
(function (HTB) {
  'use strict';

  var util = HTB.util;
  var el = util.el;
  var S = HTB.state;

  var anim = HTB.anim = {
    enabled: false,
    playing: false,
    steps: [{ paths: {}, passes: [] }],
    current: 0,
    base: null,
    duration: 2400
  };

  var PASS_COLOR = '#16243d';

  /* Sparet bakom en spelare under uppspelning. Det ska gora rorelsen last,
     inte ta over bilden - ett brett, tackande spar doljer rinkens linjer och
     konkurrerar med sjalva pjaserna. Smalare an forhandsvisade banor (0.16). */
  var TRAIL_WIDTH = 0.10;
  var TRAIL_OPACITY = 0.30;

  function newStep() { return { paths: {}, passes: [] }; }

  function passesOf(step) {
    if (!step.passes) step.passes = [];
    return step.passes;
  }

  /* Puckhandelser i ett steg. En handelse ar en av tre:
       passning  {from: spelare, to: spelare}
       upplock   {from: null,    to: spelare}     - los puck tas upp
       skott     {from: spelare, to: null, x, y}  - pucken spelas till en punkt

     Handelserna bildar en kedja: varje handelse maste utga fran den som
     faktiskt har pucken just da - en los puck kan bara plockas upp, och
     bara den som har pucken kan passa eller skjuta. Handelser som bryter
     kedjan hoppas over (men sparas, ifall kedjan blir hel igen). */
  function chainPasses(step, startCarrier) {
    var holder = startCarrier || null;
    var out = [];
    passesOf(step).forEach(function (ps) {
      if (!ps.to && !ps.from) return;
      if (ps.to) {
        var b = HTB.players.byId[ps.to];
        if (!b || !b.onIce) return;
      }
      if (ps.from) {
        var a = HTB.players.byId[ps.from];
        if (!a || !a.onIce) return;
      }
      if ((ps.from || null) !== holder) return;
      out.push(ps);
      holder = ps.to || null;
    });
    return out;
  }

  /* Puckens lage nar stegets handelser ar avklarade */
  function puckAfterStep(step, startPuck) {
    var res = {
      onIce: !!(startPuck && startPuck.onIce),
      x: startPuck ? startPuck.x : 0,
      y: startPuck ? startPuck.y : 0,
      carrier: startPuck ? startPuck.carrier : null
    };
    chainPasses(step, res.carrier).forEach(function (ev) {
      if (ev.to) {
        res.carrier = ev.to;
      } else {
        res.carrier = null;      // skott: pucken blir liggande dar den hamnar
        res.x = ev.x;
        res.y = ev.y;
      }
      res.onIce = true;
    });
    return res;
  }

  /* Passningarna i ett steg, utifran vem som har pucken nar steget borjar */
  function visiblePasses(si) {
    var step = anim.steps[si];
    if (!step) return [];
    var puck = stateAtStep(si).puck;
    return chainPasses(step, puck && puck.carrier);
  }

  /* Nar under steget spelaren ar som narmast den losa pucken - dar
     sker upplocket. Star spelaren stilla plockas pucken direkt. */
  function pickupTime(si, pid, puck) {
    var rec = anim.steps[si] && anim.steps[si].paths[pid];
    if (!rec || !rec.pts || rec.pts.length < 2 || !puck) return 0;
    var d = util.smoothPath(rec.pts);
    var best = 0, bestD = Infinity;
    for (var i = 0; i <= 40; i++) {
      var t = i / 40;
      var p = util.pointAtFraction(d, easeInOutQuad(t));
      if (!p) continue;
      var dd = (p.x - puck.x) * (p.x - puck.x) + (p.y - puck.y) * (p.y - puck.y);
      if (dd < bestD) { bestD = dd; best = t; }
    }
    return best;
  }

  /* Tidsplan for stegets puckhandelser. Passningar delar upp steget jamnt,
     upplock sker nar spelaren nar pucken. Allt haller inbordes ordning. */
  function eventTimeline(si, events, puck) {
    var n = events.length;
    var tPrev = 0;
    return events.map(function (ev, k) {
      var at, dur;
      if (!ev.from) {
        at = util.clamp(pickupTime(si, ev.to, puck), tPrev, 0.98);
        dur = 0;
      } else {
        dur = Math.min(0.22, 0.6 / (n + 1));
        at = Math.min(Math.max((k + 1) / (n + 1), tPrev), 1 - dur);
      }
      tPrev = at + dur;
      return { at: at, dur: dur };
    });
  }

  /* Narmaste mal om punkten ar inom malets traffradie, annars null */
  function nearestGoal(pt) {
    var best = null, bestD = Infinity;
    HTB.rink.goals(S.format).forEach(function (g) {
      var d = util.dist(pt, g);
      if (d < g.r && d < bestD) { bestD = d; best = g; }
    });
    return best;
  }

  /* Vem som har pucken nar stegets passningar ar avklarade */
  function holderAfterPasses(step, startCarrier) {
    var ps = chainPasses(step, startCarrier);
    return ps.length ? ps[ps.length - 1].to : startCarrier;
  }

  var rafId = null;

  /* ------------------------------------------------------------
     Angra/gor om for rorelselaget. Hela uppsattningen steg ar liten,
     sa en ren ogonblicksbild ar enklare och sakrare an deltan.
     ------------------------------------------------------------ */
  var undoStack = [];
  var redoStack = [];

  function cloneSteps() {
    return {
      current: anim.current,
      base: anim.base ? clone(anim.base) : null,
      steps: anim.steps.map(function (s) {
        var paths = {};
        Object.keys(s.paths).forEach(function (id) {
          paths[id] = {
            dir: s.paths[id].dir,
            pts: s.paths[id].pts.map(function (p) { return { x: p.x, y: p.y }; })
          };
        });
        return {
          paths: paths,
          // Hela handelsen maste med - ett skott bar sin malpunkt i x/y/goal
          passes: passesOf(s).map(function (e) {
            return { from: e.from, to: e.to, x: e.x, y: e.y, goal: e.goal };
          })
        };
      })
    };
  }

  function pushHistory() {
    undoStack.push(cloneSteps());
    if (undoStack.length > 40) undoStack.shift();
    redoStack.length = 0;
  }

  function restore(snap) {
    anim.base = snap.base;
    anim.steps = snap.steps;
    anim.current = Math.min(snap.current, anim.steps.length - 1);
    // Sparlagret ligger kvar efter en uppspelning och ritas inte om av
    // renderPaths. Utan den har rensningen syns den angrade banan kvar
    // som ett spar tills man byter steg (som rensar lagret).
    util.clear(layerTrails());
    gotoStepState(anim.current);
    anim.renderPaths();
    HTB.ui.refresh();
  }

  anim.canUndo = function () { return undoStack.length > 0; };
  anim.canRedo = function () { return redoStack.length > 0; };

  anim.undo = function () {
    if (anim.playing || !undoStack.length) return false;
    redoStack.push(cloneSteps());
    restore(undoStack.pop());
    return true;
  };

  anim.redo = function () {
    if (anim.playing || !redoStack.length) return false;
    undoStack.push(cloneSteps());
    restore(redoStack.pop());
    return true;
  };

  function clearHistory() {
    undoStack.length = 0;
    redoStack.length = 0;
  }

  function layerPaths() { return HTB.board.layers.paths; }
  function layerTrails() { return HTB.board.layers.trails; }

  /* ------------------------------------------------------------
     Lagen: fanga, klona, applicera
     ------------------------------------------------------------ */
  function capture() {
    var st = { players: {}, puck: null };
    HTB.players.onIce().forEach(function (p) {
      st.players[p.id] = { x: p.x, y: p.y, heading: p.heading };
    });
    var ps = HTB.puck.state;
    st.puck = { onIce: ps.onIce, x: ps.x, y: ps.y, carrier: ps.carrier };
    return st;
  }

  function clone(st) {
    var out = { players: {}, puck: null };
    Object.keys(st.players).forEach(function (id) {
      out.players[id] = {
        x: st.players[id].x, y: st.players[id].y, heading: st.players[id].heading
      };
    });
    if (st.puck) {
      out.puck = {
        onIce: st.puck.onIce, x: st.puck.x, y: st.puck.y, carrier: st.puck.carrier
      };
    }
    return out;
  }

  function applyState(st) {
    if (!st) return;
    Object.keys(st.players).forEach(function (id) {
      var p = HTB.players.byId[id];
      if (!p || !p.onIce) return;
      p.x = st.players[id].x;
      p.y = st.players[id].y;
      p.heading = st.players[id].heading;
    });
    if (st.puck) {
      HTB.puck.state.onIce = st.puck.onIce;
      HTB.puck.state.carrier = st.puck.carrier;
      if (st.puck.carrier && HTB.players.byId[st.puck.carrier] &&
          HTB.players.byId[st.puck.carrier].onIce) {
        HTB.puck.follow();
      } else {
        HTB.puck.state.carrier = null;
        HTB.puck.state.x = st.puck.x;
        HTB.puck.state.y = st.puck.y;
      }
    }
  }

  function ensureBase() {
    if (!anim.base) anim.base = capture();
    return anim.base;
  }

  /* En spelare utan bana i tidigare steg star kvar pa sin startplats,
     sa nuvarande position ar ratt att lagga in i base. */
  function rememberStart(playerId) {
    var p = HTB.players.byId[playerId];
    if (!p) return;
    ensureBase();
    if (!anim.base.players[playerId]) {
      anim.base.players[playerId] = { x: p.x, y: p.y, heading: p.heading };
    }
  }

  /* Bakatakning: spelaren ar vand mot motsatt hall an fardriktningen */
  function facing(angleDeg, dir) {
    return dir === 'bwd' ? angleDeg + 180 : angleDeg;
  }

  /* Laget vid borjan av steg i, framraknat ur base + alla banor fore i */
  function stateAtStep(i) {
    var st = clone(ensureBase());
    for (var k = 0; k < i && k < anim.steps.length; k++) {
      var paths = anim.steps[k].paths;
      Object.keys(paths).forEach(function (pid) {
        var rec = paths[pid];
        var pts = rec && rec.pts;
        if (!pts || !pts.length) return;
        var last = pts[pts.length - 1];
        var prev = pts[Math.max(0, pts.length - 2)];
        var dx = last.x - prev.x, dy = last.y - prev.y;
        var heading = (dx || dy)
          ? facing(Math.atan2(dy, dx) * 180 / Math.PI, rec.dir)
          : (st.players[pid] ? st.players[pid].heading : 0);
        st.players[pid] = { x: last.x, y: last.y, heading: heading };
      });

      // Stegets puckhandelser flyttar pucken vidare
      if (st.puck) st.puck = puckAfterStep(anim.steps[k], st.puck);
    }
    return st;
  }

  /* Var en spelare befinner sig en viss andel in i ett steg */
  function playerPosAt(stepIndex, pid, t) {
    var rec = anim.steps[stepIndex] && anim.steps[stepIndex].paths[pid];
    if (rec && rec.pts && rec.pts.length > 1) {
      var pos = util.pointAtFraction(util.smoothPath(rec.pts), easeInOutQuad(t));
      if (pos) return pos;
    }
    var st = stateAtStep(stepIndex).players[pid];
    if (st) return { x: st.x, y: st.y };
    var p = HTB.players.byId[pid];
    return p && p.onIce ? { x: p.x, y: p.y } : null;
  }

  anim.stateAtStep = stateAtStep;

  /* Stall tavlan pa ett stegs startlage */
  function gotoStepState(i) {
    applyState(stateAtStep(i));
    HTB.players.render();
  }

  /* ------------------------------------------------------------
     Forhandsvisning av inspelade banor
     ------------------------------------------------------------ */
  anim.renderPaths = function () {
    var layer = layerPaths();
    if (!layer) return;
    util.clear(layer);

    anim.steps.forEach(function (step, si) {
      var isCurrent = si === anim.current;
      Object.keys(step.paths).forEach(function (pid) {
        var p = HTB.players.byId[pid];
        if (!p) return;
        var rec = step.paths[pid];
        var color = HTB.TEAMS[p.team].trail;
        var d = util.smoothPath(rec.pts);
        var g = el('g', {
          'class': 'path-item',
          'data-id': pid,
          'data-step': si,
          opacity: isCurrent ? 0.95 : 0.32
        }, layer);
        el('path', {
          d: d, fill: 'none', stroke: color,
          'stroke-width': 0.16 * S.scale,
          'stroke-dasharray': (0.5 * S.scale) + ' ' + (0.34 * S.scale),
          'stroke-linecap': 'round',
          'marker-end': 'url(#' + HTB.draw.marker('arw', color) + ')',
          'pointer-events': 'none'
        }, g);

        // Bakatakning markeras med tvarstreck langs banan
        if (rec.dir === 'bwd') {
          el('path', {
            d: util.hatch(d, 0.95 * S.scale, 0.3 * S.scale),
            fill: 'none', stroke: color,
            'stroke-width': 0.11 * S.scale,
            'stroke-linecap': 'round',
            'pointer-events': 'none'
          }, g);
        }
        el('path', {
          d: d, fill: 'none', stroke: 'transparent',
          'stroke-width': Math.max(0.16 * S.scale * 4, 0.9),
          'pointer-events': 'stroke'
        }, g);
      });

      // Puckhandelser: passningar och upplock
      var startPuck = stateAtStep(si).puck;
      var shown = visiblePasses(si);
      var sched = eventTimeline(si, shown, startPuck);
      shown.forEach(function (ps, k) {
        var pickup = !ps.from;
        var shot = !ps.to;
        var a = pickup
          ? (startPuck ? { x: startPuck.x, y: startPuck.y } : null)
          : playerPosAt(si, ps.from, sched[k].at);
        var b = shot
          ? { x: ps.x, y: ps.y }
          : playerPosAt(si, ps.to, sched[k].at + sched[k].dur);
        if (!a || !b) return;
        if (!isFinite(a.x) || !isFinite(a.y) || !isFinite(b.x) || !isFinite(b.y)) return;
        var seg = shorten(a, b,
          pickup ? 0.5 * S.scale : (shot ? 0.6 * S.scale : 0.85 * S.scale));
        // En passning utan lucka mellan pjaserna gar inte att rita,
        // men ett upplock ska alltid synas - ringen racker.
        if (!seg && !pickup) return;

        var pg = el('g', {
          'class': 'path-item',
          'data-pass': k,
          'data-step': si,
          opacity: isCurrent ? 0.95 : 0.32
        }, layer);

        if (seg) {
          var d = 'M' + seg.a.x + ' ' + seg.a.y + ' L' + seg.b.x + ' ' + seg.b.y;
          el('path', {
            d: d, fill: 'none', stroke: PASS_COLOR,
            'stroke-width': (pickup ? 0.12 : 0.17) * S.scale,
            'stroke-dasharray': pickup
              ? (0.22 * S.scale) + ' ' + (0.26 * S.scale)
              : (0.42 * S.scale) + ' ' + (0.40 * S.scale),
            'stroke-linecap': 'round',
            'marker-end': pickup ? null : 'url(#' + HTB.draw.marker(
              (shot && ps.goal) ? 'chv' : 'arw', PASS_COLOR) + ')',
            'pointer-events': 'none'
          }, pg);
          el('path', {
            d: d, fill: 'none', stroke: 'transparent',
            'stroke-width': Math.max(0.17 * S.scale * 4, 0.9),
            'pointer-events': 'stroke'
          }, pg);
        }

        // Puck som spelas till en punkt utan att vara skott mot mal:
        // ring dar den blir liggande
        if (shot && !ps.goal) {
          el('circle', {
            cx: ps.x, cy: ps.y, r: 0.45 * S.scale,
            fill: 'none', stroke: PASS_COLOR,
            'stroke-width': 0.10 * S.scale,
            'stroke-dasharray': (0.26 * S.scale) + ' ' + (0.22 * S.scale),
            'pointer-events': 'none'
          }, pg);
        }

        // Upplock markeras med en ring dar spelaren tar pucken
        if (pickup) {
          el('circle', {
            cx: b.x, cy: b.y, r: 0.62 * S.scale,
            fill: 'none', stroke: PASS_COLOR,
            'stroke-width': 0.12 * S.scale,
            'stroke-dasharray': (0.30 * S.scale) + ' ' + (0.24 * S.scale),
            'pointer-events': 'none'
          }, pg);
          el('circle', {
            cx: b.x, cy: b.y, r: 0.9 * S.scale,
            fill: 'transparent', 'pointer-events': 'fill'
          }, pg);
        }
      });
    });
  };

  /* Kortar en stracka i bada andar sa att linjen inte gar in i pjaserna.
     Villkoret ar skrivet sa att aven NaN ger null - en trasig handelse ska
     aldrig kunna slappa igenom en ogiltig path. */
  function shorten(a, b, by) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (!(len > by * 2.2)) return null;
    var ux = dx / len, uy = dy / len;
    return {
      a: { x: a.x + ux * by, y: a.y + uy * by },
      b: { x: b.x - ux * by, y: b.y - uy * by }
    };
  }

  /* ------------------------------------------------------------
     Spela in en bana genom att dra en spelare
     ------------------------------------------------------------ */
  anim.beginPath = function (playerId) {
    var p = HTB.players.byId[playerId];
    if (!p || !p.onIce || anim.playing) return;

    rememberStart(playerId);

    var pts = [{ x: p.x, y: p.y }];
    var color = HTB.TEAMS[p.team].trail;
    var node = el('path', {
      fill: 'none', stroke: color,
      'stroke-width': 0.16 * S.scale,
      'stroke-dasharray': (0.5 * S.scale) + ' ' + (0.34 * S.scale),
      'stroke-linecap': 'round', 'pointer-events': 'none'
    }, layerPaths());

    var step = anim.steps[anim.current];

    HTB.board.startDrag({
      benchDrop: true,
      move: function (pt, ev) {
        // Over banken innebar borttagning, inte inspelning - visa det
        var overBench = HTB.board.isOverBench(ev);
        HTB.board.updateDragFeedback({
          node: HTB.board.layers.pieces.querySelector('.piece[data-id="' + playerId + '"]'),
          markup: HTB.players.chipSvg(p.team, p.role),
          overBench: overBench,
          outside: false,
          clientX: ev.clientX, clientY: ev.clientY
        });
        node.setAttribute('opacity', overBench ? 0.15 : 1);

        var c = HTB.board.clampToRink(pt);
        var last = pts[pts.length - 1];
        if (util.dist(last, c) < 0.2) return;
        pts.push(c);
        node.setAttribute('d', util.smoothPath(pts));
      },
      end: function (pt, ev) {
        if (node.parentNode) node.parentNode.removeChild(node);

        // Slappt over banken: ta bort spelaren istallet for att spela in en bana,
        // sa att pjaser gar att plocka bort aven i rorelselaget.
        if (HTB.board.isOverBench(ev)) {
          HTB.players.remove(playerId);
          HTB.players.render();
          anim.renderPaths();
          HTB.ui.refresh();
          return;
        }

        var d = util.smoothPath(pts);
        if (pts.length > 1 && util.pathLength(d) > 0.8 * S.scale) {
          pushHistory();
          step.paths[playerId] = {
            pts: util.simplify(pts, 0.18 * S.scale),
            dir: S.skateDir
          };
          // Bakatakning ar undantaget, inte normallaget. Att lamna kvar
          // det efter en inspelad bana gor att nasta bana blir bakat av
          // misstag - vanliga fallet ar att man glommer vaxla tillbaka.
          if (S.skateDir === 'bwd') {
            S.skateDir = 'fwd';
            HTB.ui.hint('Bakåtbana inspelad – åkriktningen är tillbaka på framåt');
          }
        } else if (step.paths[playerId]) {
          // Ett kort klick pa en spelare som redan har en bana ska inte
          // radera den - det vander den mellan framat och bakat istallet.
          pushHistory();
          var rec = step.paths[playerId];
          rec.dir = rec.dir === 'bwd' ? 'fwd' : 'bwd';
          HTB.ui.hint(rec.dir === 'bwd'
            ? 'Banan ändrad till bakåtåkning'
            : 'Banan ändrad till framåtåkning');
        }
        // Banan andrar var senare steg borjar - stall om tavlan
        gotoStepState(anim.current);
        anim.renderPaths();
        HTB.ui.refresh();
      }
    });
  };

  /* ------------------------------------------------------------
     Spela in en passning: dra pucken till en medspelare
     ------------------------------------------------------------ */
  anim.beginPuckEvent = function () {
    if (anim.playing || !HTB.puck.state.onIce) return false;
    var step = anim.steps[anim.current];
    var startPuck = stateAtStep(anim.current).puck;
    var fromId = holderAfterPasses(step, startPuck && startPuck.carrier);
    var from = fromId ? HTB.players.byId[fromId] : null;
    if (fromId && (!from || !from.onIce)) return false;

    ensureBase();

    // Har nagon pucken blir draget en passning, annars ett upplock
    var start = from
      ? HTB.players.bladeAnchor(from)
      : { x: HTB.puck.state.x, y: HTB.puck.state.y };
    var node = el('path', {
      fill: 'none', stroke: PASS_COLOR,
      'stroke-width': 0.17 * S.scale,
      'stroke-dasharray': (0.42 * S.scale) + ' ' + (0.40 * S.scale),
      'stroke-linecap': 'round', 'pointer-events': 'none'
    }, layerPaths());

    var arwUrl = 'url(#' + HTB.draw.marker('arw', PASS_COLOR) + ')';
    var chvUrl = 'url(#' + HTB.draw.marker('chv', PASS_COLOR) + ')';

    HTB.board.startDrag({
      move: function (pt) {
        var target = HTB.players.hitTest(pt.x, pt.y, 1.3 * S.scale);
        if (target && target.id === fromId) target = null;
        var goal = (!target && fromId) ? nearestGoal(pt) : null;
        var end = target ? { x: target.x, y: target.y }
                : (goal ? { x: goal.x, y: goal.y } : pt);
        node.setAttribute('d', 'M' + start.x + ' ' + start.y + ' L' + end.x + ' ' + end.y);
        node.setAttribute('marker-end', goal ? chvUrl : arwUrl);
        node.setAttribute('opacity', (target || goal) ? 1 : 0.55);
      },
      end: function (pt) {
        if (node.parentNode) node.parentNode.removeChild(node);
        var target = HTB.players.hitTest(pt.x, pt.y, 1.5 * S.scale);

        if (target && target.id !== fromId) {
          pushHistory();
          passesOf(step).push({ from: fromId || null, to: target.id });
          HTB.ui.hint(fromId
            ? 'Passning inspelad – spelas upp mitt i steget'
            : 'Upplock inspelat – spelaren tar pucken när hen når den');

        } else if (fromId) {
          // Ingen mottagare: pucken skjuts eller spelas till en punkt.
          var goal = nearestGoal(pt);
          var to = goal ? { x: goal.x, y: goal.y } : HTB.board.clampToRink(pt);
          if (util.dist(start, to) > 1.5 * S.scale) {
            pushHistory();
            passesOf(step).push({
              from: fromId, to: null, x: to.x, y: to.y, goal: !!goal
            });
            HTB.ui.hint(goal
              ? 'Skott mot mål inspelat'
              : 'Pucken spelas till platsen och blir liggande där');
          }
        }

        gotoStepState(anim.current);
        anim.renderPaths();
        HTB.ui.refresh();
      }
    });
    return true;
  };

  anim.dropPlayer = function (playerId) {
    pushHistory();
    anim.steps.forEach(function (s) {
      delete s.paths[playerId];
      s.passes = passesOf(s).filter(function (ps) {
        return ps.from !== playerId && ps.to !== playerId;
      });
    });
    if (anim.base) delete anim.base.players[playerId];
    anim.renderPaths();
  };

  function hasAnyPath(playerId) {
    return anim.steps.some(function (s) { return !!s.paths[playerId]; });
  }

  /* Flyttar spelarens utgangslage OCH hela hens inspelade rutt lika mycket.
     Rutten maste folja med - en bana borjar alltid dar spelaren star, annars
     skulle spelaren hoppa till banans start nar uppspelningen borjar. */
  function translatePlayer(playerId, dx, dy) {
    var b = anim.base && anim.base.players[playerId];
    if (b) { b.x += dx; b.y += dy; }
    anim.steps.forEach(function (s) {
      var rec = s.paths[playerId];
      if (!rec) return;
      rec.pts = rec.pts.map(function (p) { return { x: p.x + dx, y: p.y + dy }; });
    });
  }

  /* Manuell flytt av en spelare. dx/dy anges nar flytten ska ta rutten med sig. */
  anim.notePlayerMoved = function (playerId, dx, dy) {
    if (!anim.base) return;
    var p = HTB.players.byId[playerId];
    if (!p || !p.onIce) return;

    if (dx !== undefined && (dx || dy) && hasAnyPath(playerId)) {
      pushHistory();
      translatePlayer(playerId, dx, dy);
      if (anim.base.players[playerId]) anim.base.players[playerId].heading = p.heading;
      anim.renderPaths();
      HTB.ui.refresh();
      return;
    }

    // Utan inspelad rutt star spelaren still hela spelet, sa nuvarande
    // position ar utgangslaget oavsett vilket steg man tittar pa.
    if (anim.current !== 0 && anim.base.players[playerId]) return;
    anim.base.players[playerId] = { x: p.x, y: p.y, heading: p.heading };
  };

  anim.notePuckMoved = function () {
    if (!anim.base) return;
    var ps = HTB.puck.state;
    // Pa forsta steget satter en manuell flytt spelets utgangslage.
    // Aven nar pucken tillkommer eller tas bort maste startlaget folja med,
    // annars skulle den dyka upp igen sa fort man byter steg.
    var wasOnIce = !!(anim.base.puck && anim.base.puck.onIce);
    if (anim.current !== 0 && wasOnIce === ps.onIce) return;
    anim.base.puck = { onIce: ps.onIce, x: ps.x, y: ps.y, carrier: ps.carrier };
  };

  anim.erasePathAt = function (target) {
    var node = target.closest ? target.closest('.path-item') : null;
    if (!node) return false;
    var si = parseInt(node.getAttribute('data-step'), 10);
    if (!anim.steps[si]) return false;
    pushHistory();

    if (node.hasAttribute('data-pass')) {
      // index avser de synliga (levande) passningarna
      var k = parseInt(node.getAttribute('data-pass'), 10);
      var live = visiblePasses(si)[k];
      var all = passesOf(anim.steps[si]);
      var idx = all.indexOf(live);
      if (idx >= 0) all.splice(idx, 1);
    } else {
      delete anim.steps[si].paths[node.getAttribute('data-id')];
    }
    gotoStepState(anim.current);
    anim.renderPaths();
    HTB.ui.refresh();
    return true;
  };

  /* ------------------------------------------------------------
     Steg
     ------------------------------------------------------------ */
  anim.addStep = function () {
    if (anim.playing) return;
    pushHistory();
    ensureBase();
    anim.steps.push(newStep());
    anim.current = anim.steps.length - 1;
    util.clear(layerTrails());
    gotoStepState(anim.current);
    anim.renderPaths();
    HTB.ui.refresh();
  };

  anim.removeStep = function () {
    if (anim.playing || anim.steps.length < 2) return;
    pushHistory();
    anim.steps.pop();
    anim.current = Math.min(anim.current, anim.steps.length - 1);
    util.clear(layerTrails());
    gotoStepState(anim.current);
    anim.renderPaths();
    HTB.ui.refresh();
  };

  anim.setStep = function (i) {
    if (anim.playing || !anim.steps[i]) return;
    anim.current = i;
    util.clear(layerTrails());
    gotoStepState(i);
    anim.renderPaths();
    HTB.ui.refresh();
  };

  anim.clearPaths = function () {
    anim.stop(true);
    clearHistory();
    if (anim.base) applyState(stateAtStep(0));
    anim.steps = [newStep()];
    anim.current = 0;
    anim.base = null;
    util.clear(layerTrails());
    util.clear(layerPaths());
    HTB.players.render();
    HTB.ui.refresh();
  };

  /* Laser in ett sparat spels rorelser */
  anim.loadState = function (state) {
    anim.stop(true);
    clearHistory();
    anim.base = state.base || null;
    anim.steps = (state.steps && state.steps.length) ? state.steps : [newStep()];
    anim.steps.forEach(function (s) {
      if (!s.paths) s.paths = {};
      if (!s.passes) s.passes = [];
    });
    anim.current = util.clamp(state.current || 0, 0, anim.steps.length - 1);
    util.clear(layerTrails());
    gotoStepState(anim.current);
    anim.renderPaths();
  };

  anim.stepHasPaths = function (i) {
    var s = anim.steps[i];
    return !!(s && (Object.keys(s.paths).length || visiblePasses(i).length));
  };

  anim.hasPaths = function () {
    return anim.steps.some(function (s, i) { return anim.stepHasPaths(i); });
  };

  /* Finns det nagot att spela upp fran steg `from` och framat? */
  anim.hasPathsFrom = function (from) {
    for (var i = from; i < anim.steps.length; i++) {
      if (anim.stepHasPaths(i)) return true;
    }
    return false;
  };

  /* ------------------------------------------------------------
     Uppspelning
     ------------------------------------------------------------ */
  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  /* Farthallning mellan steg.
     Ett steg som ska fortsatta in i nasta far inte bromsa till stillastaende,
     och nasta far inte starta fran noll. Kurvorna nedan ar valda sa att
     farten i skarven ar exakt densamma som en rak (linjar) uppspelning:
       accelerera in:  e(t) = -t^3 + 2t^2   (e'(0)=0, e'(1)=1)
       bromsa ut:      e(t) = -t^3 + t^2 + t (e'(0)=1, e'(1)=0)
     Med steglangder som styr varaktigheten blir akfarten jamn hela vagen. */
  function easing(easeIn, easeOut) {
    if (easeIn && easeOut) return easeInOutQuad;
    if (easeIn) return function (t) { return t * t * (2 - t); };
    if (easeOut) return function (t) { return t * (1 + t * (1 - t)); };
    return function (t) { return t; };
  }

  function lerpAngle(a, b, k) {
    var d = b - a;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return a + d * k;
  }

  /* Langsta akbanan i ett steg - styr hur lang tid steget far ta */
  function stepPathLength(i) {
    var step = anim.steps[i];
    if (!step) return 0;
    var max = 0;
    Object.keys(step.paths).forEach(function (pid) {
      var p = HTB.players.byId[pid];
      if (!p || !p.onIce) return;
      max = Math.max(max, util.pathLength(util.smoothPath(step.paths[pid].pts)));
    });
    return max;
  }

  function runStep(i, opts, onDone) {
    var step = anim.steps[i];
    if (!step) { if (onDone) onDone(); return; }
    opts = opts || {};
    var dur = opts.duration || anim.duration;
    var ease = easing(opts.easeIn !== false, opts.easeOut !== false);

    applyState(stateAtStep(i));
    if (!opts.keepTrails) util.clear(layerTrails());
    HTB.players.render();

    var runners = [];
    Object.keys(step.paths).forEach(function (pid) {
      var p = HTB.players.byId[pid];
      if (!p || !p.onIce) return;
      var rec = step.paths[pid];
      var d = util.smoothPath(rec.pts);
      var node = el('path', {
        d: d, fill: 'none',
        stroke: HTB.TEAMS[p.team].trail,
        'stroke-width': TRAIL_WIDTH * S.scale,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        opacity: TRAIL_OPACITY, 'pointer-events': 'none'
      }, layerTrails());
      var len = node.getTotalLength();
      node.setAttribute('stroke-dasharray', len + ' ' + len);
      node.setAttribute('stroke-dashoffset', len);
      // h0 = riktningen spelaren star i nar steget borjar. Den vags in mot
      // banans egen riktning sa att pjasen inte rycker till vid stegbytet.
      runners.push({ p: p, node: node, len: len, dir: rec.dir, h0: p.heading });
    });

    // Puckhandelser i steget, med tidpunkt och varaktighet
    var passes = visiblePasses(i);
    var sched = eventTimeline(i, passes, stateAtStep(i).puck);
    var flight = passes.map(function (ps, k) {
      return {
        from: ps.from || null, to: ps.to || null,
        spot: ps.to ? null : { x: ps.x, y: ps.y },   // skott: fast malpunkt
        at: sched[k].at, dur: sched[k].dur,
        launched: false, done: false, origin: null
      };
    });

    if (!runners.length && !flight.length) { if (onDone) onDone(0); return; }

    anim.playing = true;
    HTB.ui.refresh();

    // Ett steg slutar mitt i en bildruta. Overskjutande tid bars over till
    // nasta steg, annars tappas en halv bildruta i varje skarv.
    var t0 = performance.now() - (opts.carryMs || 0);
    var eps = Math.max(0.12, 0.06 * S.scale);

    function finish(now) {
      rafId = null;
      anim.playing = false;
      applyState(stateAtStep(i + 1));
      HTB.players.render();
      HTB.ui.refresh();
      if (onDone) onDone(Math.max(0, (now - t0) - dur));
    }

    function frame(now) {
      var t = util.clamp((now - t0) / dur, 0, 1);
      var e = ease(t);
      var turn = Math.min(1, t / 0.12);   // invagning av riktningen

      runners.forEach(function (r) {
        var s = r.len * e;
        var pt = r.node.getPointAtLength(s);
        var a = r.node.getPointAtLength(Math.max(0, s - eps));
        var b = r.node.getPointAtLength(Math.min(r.len, s + eps));
        r.p.x = pt.x; r.p.y = pt.y;
        var dx = b.x - a.x, dy = b.y - a.y;
        if (dx || dy) {
          var target = facing(Math.atan2(dy, dx) * 180 / Math.PI, r.dir);
          r.p.heading = turn >= 1 ? target : lerpAngle(r.h0, target, turn);
        }
        r.node.setAttribute('stroke-dashoffset', r.len - s);
        HTB.players.updateTransform(r.p);
      });

      // Pucken: antingen buren av en spelare eller pa vag i en passning
      var flying = null;
      flight.forEach(function (f) {
        if (f.done) return;
        if (!f.launched && t >= f.at) {
          if (!f.from) {
            // Upplock: spelaren ar framme vid pucken och tar den direkt
            f.launched = true;
            f.done = true;
            HTB.puck.state.carrier = f.to;
            HTB.players.render();
            return;
          }
          var passer = HTB.players.byId[f.from];
          f.origin = passer && passer.onIce
            ? HTB.players.bladeAnchor(passer)
            : { x: HTB.puck.state.x, y: HTB.puck.state.y };
          f.launched = true;
          HTB.puck.state.carrier = null;
          HTB.players.render();   // puckringen ska lamna passaren
        }
        if (!f.launched || f.done) return;
        var u = util.clamp((t - f.at) / f.dur, 0, 1);
        if (u >= 1) {
          f.done = true;
          HTB.puck.state.carrier = f.to;
          if (f.spot) HTB.puck.moveTo(f.spot.x, f.spot.y);
          HTB.players.render();   // ringen flyttar till mottagaren
        } else {
          flying = { origin: f.origin, to: f.to, spot: f.spot, u: u };
        }
      });

      if (flying) {
        var rec2 = flying.to ? HTB.players.byId[flying.to] : null;
        var target = flying.spot
          ? flying.spot
          : (rec2 && rec2.onIce
              ? HTB.players.bladeAnchor(rec2)
              : { x: HTB.puck.state.x, y: HTB.puck.state.y });
        HTB.puck.moveTo(
          flying.origin.x + (target.x - flying.origin.x) * flying.u,
          flying.origin.y + (target.y - flying.origin.y) * flying.u
        );
      } else if (HTB.puck.state.carrier) {
        HTB.puck.follow();
      }

      if (t < 1) rafId = requestAnimationFrame(frame);
      else finish(now);
    }

    // Bars tid over fran forra steget ska den ritas ut i samma bildruta som
    // skarven, annars visas stegets slutlage en bildruta for lange och nasta
    // bildruta far ta igen det med ett hopp.
    if (opts.carryMs) frame(performance.now());
    else rafId = requestAnimationFrame(frame);
  }

  /* Loper stegen fran `from` till sista steget i en obruten kedja.
     Ett steg mitt i spelet ar sallan intressant for sig sjalvt - star man
     pa steg 4 vill man se 4, 5 och 6, inte bara 4. */
  var playSeq = 0;

  function playFrom(from) {
    if (anim.playing) { anim.stop(); return; }
    if (!anim.steps[from] || !anim.hasPathsFrom(from)) return;

    util.clear(layerPaths());
    util.clear(layerTrails());

    var n = anim.steps.length;
    var saved = anim.current;
    var seq = ++playSeq;   // en stoppad kedja far inte fortsatta i bakgrunden

    // Varje steg far tid i proportion till hur langt det ar, sa att
    // akfarten blir densamma genom hela spelet. Ett steg utan akning
    // (bara passning eller upplock) far en kortare fast tid.
    var lengths = [];
    for (var k = 0; k < n; k++) lengths.push(k >= from ? stepPathLength(k) : 0);
    var moving = lengths.slice(from).filter(function (l) { return l > 0; });
    var avg = moving.length
      ? moving.reduce(function (s, l) { return s + l; }, 0) / moving.length
      : 1;

    function durationOf(k) {
      if (!lengths[k]) return anim.duration * 0.6;
      return util.clamp(anim.duration * lengths[k] / avg,
                        anim.duration * 0.35, anim.duration * 2.5);
    }

    var i = from;
    function next(carryMs) {
      if (seq !== playSeq) return;
      if (i >= n) {
        anim.current = saved;
        anim.renderPaths();
        HTB.ui.refresh();
        return;
      }
      var idx = i++;
      anim.current = idx;
      HTB.ui.refresh();
      // Bromsa bara in i borjan och ut pa slutet - daremellan halls farten
      runStep(idx, {
        keepTrails: idx > from,
        easeIn: idx === from,
        easeOut: idx === n - 1,
        duration: durationOf(idx),
        carryMs: carryMs || 0
      }, next);
    }
    next(0);
  }

  anim.play = function () { playFrom(anim.current); };
  anim.playAll = function () { playFrom(0); };

  /* silent=true nar den som anropar sjalv staller om tavlan efterat
     (clearPaths, loadState) - annars skulle vi rita upp ett lage som
     ar pa vag att kastas. */
  anim.stop = function (silent) {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    playSeq++;
    anim.playing = false;
    if (!silent && anim.base) {
      util.clear(layerTrails());
      gotoStepState(anim.current);
      anim.renderPaths();
    }
    HTB.ui.refresh();
  };

  anim.reset = function () {
    anim.stop(true);
    util.clear(layerTrails());
    gotoStepState(anim.current);
    anim.renderPaths();
    HTB.ui.refresh();
  };

  anim.setEnabled = function (on) {
    anim.enabled = !!on;
    HTB.players.select(null);
    if (anim.enabled) {
      HTB.board.setTool('select');
      // Utan inspelade banor ar tavlans nuvarande lage det nya startlaget
      if (!anim.hasPaths()) anim.base = capture();
    }
    anim.renderPaths();
    HTB.ui.refresh();
  };

  anim.init = function () {
    layerPaths().addEventListener('pointerdown', function (ev) {
      if (S.tool !== 'erase') return;
      ev.preventDefault();
      anim.erasePathAt(ev.target);
    });
  };

})(window.HTB);
