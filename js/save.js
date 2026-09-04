/* ============================================================
   save.js - sparar och aterstaller ett helt spel: tavla, pjaser,
   puck, ritade linjer och alla rorelsesteg.

   Lagringen ligger i webblasaren (localStorage) och ar knuten till
   den har datorn och webblasaren - det ar ingen fil man kan skicka
   vidare. Gar lagringen inte att komma at (vissa lagen blockerar den
   for lokalt oppnade filer) faller vi tillbaka pa minnet, sa att
   funktionen anda fungerar sa lange fliken ar oppen.
   ============================================================ */
(function (HTB) {
  'use strict';

  var KEY = 'htb.plays.v1';
  var S = HTB.state;

  var save = HTB.save = {};

  /* ------------------------------------------------------------
     Lagring med reserv i minnet
     ------------------------------------------------------------ */
  var memory = {};
  var persistent = (function () {
    try {
      var k = '__htb_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  })();

  save.persistent = persistent;

  function readAll() {
    if (!persistent) return memory;
    try {
      return JSON.parse(window.localStorage.getItem(KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function writeAll(all) {
    if (!persistent) { memory = all; return true; }
    try {
      window.localStorage.setItem(KEY, JSON.stringify(all));
      return true;
    } catch (e) {
      // t.ex. fullt utrymme - behall atminstone i minnet
      memory = all;
      persistent = false;
      save.persistent = false;
      return false;
    }
  }

  /* ------------------------------------------------------------
     Ogonblicksbild av hela tavlan
     ------------------------------------------------------------ */
  save.snapshot = function () {
    return {
      v: 1,
      format: S.format,
      rotation: S.rotation,
      flipX: S.flipX,
      flipY: S.flipY,
      pieceStyle: S.pieceStyle,
      players: HTB.players.onIce().map(function (p) {
        return { id: p.id, x: p.x, y: p.y, heading: p.heading };
      }),
      puck: {
        onIce: HTB.puck.state.onIce,
        x: HTB.puck.state.x,
        y: HTB.puck.state.y,
        carrier: HTB.puck.state.carrier
      },
      draw: HTB.draw.items,
      anim: {
        base: HTB.anim.base,
        steps: HTB.anim.steps,
        current: HTB.anim.current
      }
    };
  };

  save.restore = function (data) {
    if (!data) return false;
    var d = JSON.parse(JSON.stringify(data));   // kopia, sa originalet inte muteras

    HTB.anim.stop();

    S.rotation = d.rotation || 0;
    S.flipX = !!d.flipX;
    S.flipY = !!d.flipY;
    S.pieceStyle = d.pieceStyle === 'disc' ? 'disc' : 'figure';

    HTB.board.setFormat(d.format || 'full');
    HTB.board.applyView();

    // Samma ordning som vid tavelbyte: tom tavla forst, sedan innehallet
    HTB.puck.removeFromIce();
    HTB.players.init();
    HTB.players.rebuildBench();

    (d.players || []).forEach(function (sp) {
      var p = HTB.players.place(sp.id, sp.x, sp.y);
      if (p) p.heading = sp.heading || 0;
    });

    if (d.puck && d.puck.onIce) {
      HTB.puck.state.onIce = true;
      HTB.puck.state.x = d.puck.x;
      HTB.puck.state.y = d.puck.y;
      HTB.puck.state.carrier = d.puck.carrier || null;
    }

    HTB.draw.items = d.draw || [];
    HTB.draw.renderAll();

    HTB.anim.loadState(d.anim || {});
    HTB.players.render();
    HTB.board.setTool('select');
    HTB.ui.refresh();
    return true;
  };

  /* ------------------------------------------------------------
     Namngivna spel
     ------------------------------------------------------------ */
  save.list = function () {
    var all = readAll();
    return Object.keys(all).map(function (name) {
      return { name: name, saved: all[name].saved };
    }).sort(function (a, b) {
      return (b.saved || '').localeCompare(a.saved || '');
    });
  };

  save.exists = function (name) {
    return Object.prototype.hasOwnProperty.call(readAll(), name);
  };

  save.store = function (name) {
    var all = readAll();
    all[name] = { saved: new Date().toISOString(), data: save.snapshot() };
    return writeAll(all);
  };

  save.load = function (name) {
    var entry = readAll()[name];
    return entry ? save.restore(entry.data) : false;
  };

  save.remove = function (name) {
    var all = readAll();
    delete all[name];
    return writeAll(all);
  };

  save.suggestName = function () {
    var n = save.list().length + 1;
    while (save.exists('Spel ' + n)) n++;
    return 'Spel ' + n;
  };

})(window.HTB);
