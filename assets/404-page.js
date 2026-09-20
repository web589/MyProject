(function () {
  function initialize404Search(root) {
    if (!root || root.dataset.venus404Initialized === 'true') return;

    var input = root.querySelector('input[name="q"]');
    if (!input) return;

    root.dataset.venus404Initialized = 'true';

    root.querySelectorAll('[data-venus-404-chip]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        input.value = chip.dataset.searchTerm || chip.textContent.trim();
        input.focus();
      });
    });
  }

  function initialize404SearchSections() {
    document.querySelectorAll('[data-venus-404-search]').forEach(initialize404Search);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize404SearchSections);
  } else {
    initialize404SearchSections();
  }

  document.addEventListener('shopify:section:load', initialize404SearchSections);
})();
