document.addEventListener('DOMContentLoaded', () => {
  const codeEl = document.getElementById('skin-cancer-code');
  const copyBtn = document.getElementById('copy-code');

  fetch('./skin-cancer-dashboard.py')
    .then((res) => {
      if (!res.ok) {
        throw new Error('Unable to load script');
      }
      return res.text();
    })
    .then((text) => {
      codeEl.textContent = text.trim();
    })
    .catch(() => {
      codeEl.textContent = 'Download the script instead — unable to load preview.';
    });

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(codeEl.textContent);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = 'Copy code';
        }, 2400);
      } catch (error) {
        copyBtn.textContent = 'Copy failed';
        setTimeout(() => {
          copyBtn.textContent = 'Copy code';
        }, 2400);
      }
    });
  }
});
