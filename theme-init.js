document.documentElement.classList.add('has-js');
try {
  var storedTheme = localStorage.getItem('theme');
  var theme = storedTheme || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', theme);
} catch (error) {
  document.documentElement.setAttribute('data-theme', 'dark');
}

// Swap the print-only Google Fonts stylesheet to "all" once it's fetched --
// the media='print' trick keeps it from blocking first paint. Only present
// on pages that use it (currently index.html); guarded so this file can be
// shared as-is across pages that don't.
var fontLink = document.getElementById('google-fonts-stylesheet');
if (fontLink) {
  fontLink.addEventListener('load', function () {
    fontLink.media = 'all';
  });
}
