/* ============================================================
   ui.js - startmeny, verktygsfalt, stegvaljare och tangentbord.
   ============================================================ */
(function (HTB) {
  'use strict';

  var S = HTB.state;
  var ui = HTB.ui = {};

  var elStart, elApp, elHint, hintTimer;

  /* ------------------------------------------------------------
     Notis langst ner pa tavlan
     ------------------------------------------------------------ */
  ui.hint = function (text, ms) {
    if (!elHint) return;
    elHint.textContent = text;
    elHint.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () {
      elHint.classList.remove('show');
    }, ms || 2600);
  };

  /* ------------------------------------------------------------
     Startmeny
     ------------------------------------------------------------ */
  function buildStartMenu() {
    document.querySelectorAll('[data-thumb]').forEach(function (holder) {
      holder.innerHTML = '';
      holder.appendChild(HTB.rink.thumbnail(holder.getAttribute('data-thumb')));
    });

    document.querySelectorAll('.menu-card').forEach(function (card) {
      card.addEventListener('click', function () {
        chooseFormat(card.getAttribute('data-format'));
      });
    });
  }

  function chooseFormat(key) {
    var fmt = HTB.FORMATS[key] || HTB.FORMATS.full;
    S.rotation = fmt.rot0 || 0;
    S.flipX = false;
    S.flipY = false;

    elStart.hidden = true;
    elApp.hidden = false;

    HTB.board.setFormat(key);

    // Ordningen spelar roll: tom tavla forst, sedan nollstalld animation,
    // annars skulle clearPaths aterstalla pjaser fran den forra tavlan.
    HTB.draw.items = [];
    HTB.draw.renderAll();
    HTB.puck.removeFromIce();
    HTB.players.init();
    HTB.anim.clearPaths();
    HTB.anim.setEnabled(false);
    HTB.board.setTool('select');
    ui.refresh();
    ui.hint('Dra ut spelare från bänken till isen', 3200);
  }

  ui.openStartMenu = function () {
    elStart.hidden = false;
    elApp.hidden = true;
  };

  /* ------------------------------------------------------------
     Verktygsfalt
     ------------------------------------------------------------ */
  function buildColors() {
    var group = document.getElementById('colorGroup');
    HTB.COLORS.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'swatch' + (c === S.color ? ' active' : '');
      b.setAttribute('data-color', c);
      b.style.setProperty('--c', c);
      b.title = 'Ritfarg';
      b.addEventListener('click', function () {
        S.color = c;
        ui.refresh();
      });
      group.appendChild(b);
    });
  }

  function bindToolbar() {
    document.getElementById('btnChangeBoard').addEventListener('click', function () {
      if (confirm('Byt tavla? Allt på den nuvarande tavlan tas bort.')) {
        ui.openStartMenu();
        refreshSaveList('');
      }
    });

    document.querySelectorAll('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-view');
        if (v === 'rotL') HTB.board.rotate(-90);
        if (v === 'rotR') HTB.board.rotate(90);
        if (v === 'flipX') HTB.board.toggleFlip('x');
        if (v === 'flipY') HTB.board.toggleFlip('y');
        ui.refresh();
      });
    });

    document.querySelectorAll('[data-style]').forEach(function (b) {
      b.addEventListener('click', function () {
        HTB.players.setStyle(b.getAttribute('data-style'));
        HTB.players.rebuildBench();
        HTB.players.syncBench();
        ui.refresh();
      });
    });

    document.querySelectorAll('[data-tool]').forEach(function (b) {
      b.addEventListener('click', function () {
        setTool(b.getAttribute('data-tool'));
      });
    });

    document.getElementById('btnUndo').addEventListener('click', ui.undo);
    document.getElementById('btnRedo').addEventListener('click', ui.redo);
    document.getElementById('btnClearDraw').addEventListener('click', HTB.draw.clearAll);

    document.getElementById('btnMotion').addEventListener('click', function () {
      HTB.anim.setEnabled(!HTB.anim.enabled);
      ui.hint(HTB.anim.enabled
        ? 'Rörelseläge PÅ – dra för att rita bana, Ctrl+dra för att flytta spelaren'
        : 'Rörelseläge AV – dra en spelare för att flytta hen');
    });

    document.querySelectorAll('[data-dir]').forEach(function (b) {
      b.addEventListener('click', function () {
        S.skateDir = b.getAttribute('data-dir');
        ui.refresh();
        ui.hint(S.skateDir === 'bwd'
          ? 'Nya banor spelas in som bakåtåkning'
          : 'Nya banor spelas in som framåtåkning');
      });
    });

    document.getElementById('btnAddStep').addEventListener('click', HTB.anim.addStep);
    document.getElementById('btnDelStep').addEventListener('click', HTB.anim.removeStep);
    document.getElementById('btnPlay').addEventListener('click', HTB.anim.play);
    document.getElementById('btnPlayAll').addEventListener('click', HTB.anim.playAll);
    document.getElementById('btnReset').addEventListener('click', HTB.anim.reset);
    document.getElementById('btnClearPaths').addEventListener('click', HTB.anim.clearPaths);
  }

  /* ------------------------------------------------------------
     Sparade spel
     ------------------------------------------------------------ */
  function refreshSaveList(selected) {
    var sel = document.getElementById('saveList');
    if (!sel) return;
    var plays = HTB.save.list();
    sel.innerHTML = '';

    var first = document.createElement('option');
    first.value = '';
    first.textContent = plays.length ? '– välj sparat spel –' : '– inga sparade –';
    sel.appendChild(first);

    plays.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p.name;
      o.textContent = p.name;
      sel.appendChild(o);
    });
    sel.value = selected || '';
    document.getElementById('btnDeleteSave').disabled = !sel.value;
  }
  ui.refreshSaveList = refreshSaveList;

  function bindSaves() {
    var sel = document.getElementById('saveList');

    document.getElementById('btnSave').addEventListener('click', function () {
      var name = prompt('Namn på spelet:', sel.value || HTB.save.suggestName());
      if (name === null) return;
      name = name.trim();
      if (!name) return;
      if (HTB.save.exists(name) && !confirm('"' + name + '" finns redan. Skriva över?')) return;

      var ok = HTB.save.store(name);
      refreshSaveList(name);
      ui.hint(ok
        ? 'Sparat som "' + name + '"'
        : 'Sparat i minnet – webbläsaren tillåter inte lagring, så det försvinner när du stänger fliken', 4200);
    });

    sel.addEventListener('change', function () {
      if (!sel.value) { refreshSaveList(''); return; }
      var name = sel.value;
      if (!confirm('Öppna "' + name + '"? Det som ligger på tavlan nu ersätts.')) {
        refreshSaveList('');
        return;
      }
      HTB.save.load(name);
      refreshSaveList(name);
      ui.hint('Öppnade "' + name + '"');
    });

    document.getElementById('btnDeleteSave').addEventListener('click', function () {
      var name = sel.value;
      if (!name) return;
      if (!confirm('Ta bort "' + name + '"?')) return;
      HTB.save.remove(name);
      refreshSaveList('');
      ui.hint('"' + name + '" borttaget');
    });
  }

  /* Angra gäller det man just håller på med: rörelsebanor i rörelseläget,
     annars ritade linjer. */
  ui.undo = function () {
    if (HTB.anim.enabled) { HTB.anim.undo(); return; }
    HTB.draw.undo();
  };

  ui.redo = function () {
    if (HTB.anim.enabled) { HTB.anim.redo(); return; }
    HTB.draw.redo();
  };

  function setTool(tool) {
    if (HTB.DRAW_TOOLS.indexOf(tool) >= 0 && HTB.anim.enabled) {
      HTB.anim.setEnabled(false);
    }
    HTB.board.setTool(tool);
    ui.refresh();
  }
  ui.setTool = setTool;

  /* ------------------------------------------------------------
     Stegvaljare
     ------------------------------------------------------------ */
  function renderSteps() {
    var host = document.getElementById('stepList');
    if (!host) return;
    host.innerHTML = '';
    HTB.anim.steps.forEach(function (step, i) {
      var b = document.createElement('button');
      b.className = 'stepbtn' + (i === HTB.anim.current ? ' active' : '');
      var hasPaths = Object.keys(step.paths).length > 0;
      b.innerHTML = (i + 1) + (hasPaths ? '<span class="dot">&#9679;</span>' : '');
      b.title = 'Steg ' + (i + 1);
      b.addEventListener('click', function () { HTB.anim.setStep(i); });
      host.appendChild(b);
    });
  }

  /* ------------------------------------------------------------
     Uppdatera hela verktygsfaltets tillstand
     ------------------------------------------------------------ */
  ui.refresh = function () {
    document.querySelectorAll('[data-tool]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tool') === S.tool);
    });
    document.querySelectorAll('[data-style]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-style') === S.pieceStyle);
    });
    document.querySelectorAll('.swatch').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-color') === S.color);
    });
    document.querySelectorAll('[data-dir]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-dir') === S.skateDir);
      b.disabled = !HTB.anim.enabled;
    });
    document.querySelectorAll('[data-view]').forEach(function (b) {
      var v = b.getAttribute('data-view');
      if (v === 'flipX') b.classList.toggle('active', S.flipX);
      if (v === 'flipY') b.classList.toggle('active', S.flipY);
    });

    var mb = document.getElementById('btnMotion');
    if (mb) {
      mb.classList.toggle('on', HTB.anim.enabled);
      mb.innerHTML = 'Rörelseläge: <b>' + (HTB.anim.enabled ? 'På' : 'Av') + '</b>';
    }

    renderSteps();

    var has = HTB.anim.hasPaths();
    var playing = HTB.anim.playing;
    document.getElementById('btnPlay').disabled = !HTB.anim.stepHasPaths(HTB.anim.current);
    document.getElementById('btnPlayAll').disabled = !has || HTB.anim.steps.length < 2;
    document.getElementById('btnReset').disabled = playing;
    document.getElementById('btnDelStep').disabled = HTB.anim.steps.length < 2 || playing;
    document.getElementById('btnAddStep').disabled = playing;
    document.getElementById('btnClearPaths').disabled = !has || playing;

    var inMotion = HTB.anim.enabled;
    var undoBtn = document.getElementById('btnUndo');
    var redoBtn = document.getElementById('btnRedo');
    undoBtn.disabled = inMotion ? !HTB.anim.canUndo() : !HTB.draw.canUndo();
    redoBtn.disabled = inMotion ? !HTB.anim.canRedo() : !HTB.draw.canRedo();
    undoBtn.title = inMotion ? 'Ångra senaste rörelsen (Ctrl+Z)' : 'Ångra (Ctrl+Z)';
    redoBtn.title = inMotion ? 'Gör om senaste rörelsen (Ctrl+Y)' : 'Gör om (Ctrl+Y)';
  };

  /* ------------------------------------------------------------
     Tangentbord
     ------------------------------------------------------------ */
  var KEYS = { '1': 'skate', '2': 'skatepuck', '3': 'pass', '4': 'shot', '5': 'pen' };

  function bindKeys() {
    window.addEventListener('keydown', function (ev) {
      if (!elApp || elApp.hidden) return;
      var tag = (ev.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) ui.redo(); else ui.undo();
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') {
        ev.preventDefault(); ui.redo(); return;
      }
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

      // Vrid markerad spelare med piltangenterna
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
        var stepDeg = (ev.key === 'ArrowLeft' ? -1 : 1) * (ev.shiftKey ? 5 : 15);
        if (HTB.players.rotateSelected(stepDeg)) { ev.preventDefault(); return; }
      }

      var k = ev.key.toLowerCase();
      if (KEYS[k]) { ev.preventDefault(); setTool(KEYS[k]); return; }
      if (k === 'v') { ev.preventDefault(); setTool('select'); return; }
      if (k === 'f' && HTB.anim.enabled) {
        ev.preventDefault(); S.skateDir = 'fwd'; ui.refresh(); return;
      }
      if (k === 'b' && HTB.anim.enabled) {
        ev.preventDefault(); S.skateDir = 'bwd'; ui.refresh(); return;
      }
      if (k === 'e') { ev.preventDefault(); setTool('erase'); return; }
      if (k === 'm') {
        ev.preventDefault();
        HTB.anim.setEnabled(!HTB.anim.enabled);
        return;
      }
      if (k === 'r') { ev.preventDefault(); HTB.anim.reset(); return; }
      if (ev.key === ' ') { ev.preventDefault(); HTB.anim.play(); return; }
    });
  }

  /* ------------------------------------------------------------
     Start
     ------------------------------------------------------------ */
  ui.init = function () {
    elStart = document.getElementById('startMenu');
    elApp = document.getElementById('app');
    elHint = document.getElementById('hint');

    buildStartMenu();
    buildColors();
    bindToolbar();
    bindSaves();
    bindKeys();
    refreshSaveList('');
  };

})(window.HTB);
