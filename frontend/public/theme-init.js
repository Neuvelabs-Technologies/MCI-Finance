// Runs before the app loads (external file so the Content Security Policy needs no 'unsafe-inline').
(function () {
  try {
    var stored = localStorage.getItem('mci_einv_theme');
    var dark = stored === 'dark' || (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {
    /* storage blocked: stay light */
  }
})();
