/* ============================================================
   main.js - uppstart och initieringsordning.
   ============================================================ */
(function (HTB) {
  'use strict';

  function start() {
    HTB.board.init();
    HTB.draw.init();
    HTB.anim.init();
    HTB.ui.init();
    HTB.players.init();
    HTB.board.setTool('select');
    HTB.ui.refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

})(window.HTB);
