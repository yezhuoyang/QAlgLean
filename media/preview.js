(function () {
  'use strict';

  var vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;
  var state = vscode ? (vscode.getState() || {}) : {};
  if (!vscode) {
    try { state = JSON.parse(localStorage.getItem('qparam-preview-state') || '{}'); } catch (_) { state = {}; }
  }
  var root = document.documentElement;
  var toggle = document.querySelector('[data-action="theme"]');
  var toast = document.querySelector('.toast');
  var toastTimer;
  var scrollTimer;
  var restoreScroll = Number.isFinite(state.scrollY) ? Math.max(0, state.scrollY) : 0;
  var userNavigated = false;

  function saveState() {
    if (vscode) vscode.setState(state);
    else { try { localStorage.setItem('qparam-preview-state', JSON.stringify(state)); } catch (_) {} }
  }

  function setTheme(theme) {
    root.dataset.theme = theme === 'dark' ? 'dark' : 'light';
    state.theme = root.dataset.theme;
    if (toggle) toggle.setAttribute('aria-label', 'Switch to ' + (state.theme === 'dark' ? 'light' : 'dark') + ' paper');
    saveState();
  }

  function notify(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('visible'); }, 2200);
  }

  setTheme(state.theme || 'light');

  function restorePosition() {
    if (!userNavigated && restoreScroll > 0) window.scrollTo({ top: restoreScroll, behavior: 'instant' });
  }
  // The extension replaces the HTML after edits. Preserve position through that
  // replacement, including a second layout pass when local math fonts arrive.
  requestAnimationFrame(function () { requestAnimationFrame(restorePosition); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(restorePosition);
  ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(function (eventName) {
    window.addEventListener(eventName, function () { userNavigated = true; }, { passive: true, once: true });
  });
  window.addEventListener('scroll', function () {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () {
      state.scrollY = window.scrollY;
      saveState();
    }, 80);
  }, { passive: true });
  window.addEventListener('beforeunload', function () {
    state.scrollY = window.scrollY;
    saveState();
  });

  document.addEventListener('click', function (event) {
    var button = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!button) return;
    if (button.dataset.action === 'theme') {
      setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
    } else if (button.dataset.action === 'reveal') {
      var line = Number(button.dataset.line);
      if (!Number.isSafeInteger(line) || line < 0) return;
      if (vscode) vscode.postMessage({ type: 'reveal', line: line });
      else notify('Source line ' + (line + 1) + ' · open this document in VS Code to jump to source.');
    } else if (button.dataset.action === 'copy') {
      var text = button.dataset.copy || '';
      if (vscode) {
        vscode.postMessage({ type: 'copy', text: text });
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () { notify('LaTeX copied'); }, function () { notify('Clipboard access is unavailable in this preview.'); });
      } else notify('Clipboard access is unavailable in this preview.');
    }
  });

  window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'copied') notify('LaTeX copied');
    if (event.data && event.data.type === 'copy-error') notify('Could not copy this expression.');
  });

  if ('IntersectionObserver' in window) {
    var links = Array.prototype.slice.call(document.querySelectorAll('.outline-link'));
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (link) {
          var active = link.getAttribute('href') === '#' + entry.target.id;
          link.classList.toggle('active', active);
          if (active) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-10% 0px -65% 0px', threshold: 0 });
    document.querySelectorAll('.document-section').forEach(function (section) { observer.observe(section); });
  }
}());
