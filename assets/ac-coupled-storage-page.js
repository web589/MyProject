(function () {
  'use strict';

  function setFlowState(root, state) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[data-ac-flow-toggle]'));
    var panels = Array.prototype.slice.call(root.querySelectorAll('[data-ac-flow-panel]'));

    tabs.forEach(function (tab) {
      var active = tab.dataset.acFlowToggle === state;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
    });

    panels.forEach(function (panel) {
      var active = panel.dataset.acFlowPanel === state;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
      panel.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
  }

  function setFaqState(item, open) {
    var question = item.querySelector('[data-ac-faq-question]');
    var answer = item.querySelector('[data-ac-faq-answer]');
    if (!question || !answer) return;

    item.classList.toggle('is-open', open);
    question.setAttribute('aria-expanded', open ? 'true' : 'false');
    var marker = question.querySelector('span');
    if (marker) marker.textContent = open ? '–' : '+';
    answer.hidden = !open;
  }

  function init(root) {
    if (!root || root.dataset.acStorageInitialized === 'true') return;
    root.dataset.acStorageInitialized = 'true';

    var flowTabs = Array.prototype.slice.call(root.querySelectorAll('[data-ac-flow-toggle]'));
    flowTabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () {
        setFlowState(root, tab.dataset.acFlowToggle);
      });
      tab.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        var direction = event.key === 'ArrowRight' ? 1 : -1;
        var next = flowTabs[(index + direction + flowTabs.length) % flowTabs.length];
        setFlowState(root, next.dataset.acFlowToggle);
        next.focus();
      });
    });
    if (flowTabs.length) {
      var initialTab = flowTabs.find(function (tab) { return tab.classList.contains('is-active'); }) || flowTabs[0];
      setFlowState(root, initialTab.dataset.acFlowToggle);
    }

    var faqItems = Array.prototype.slice.call(root.querySelectorAll('[data-ac-faq-item]'));
    faqItems.forEach(function (item) {
      var question = item.querySelector('[data-ac-faq-question]');
      if (!question) return;
      question.addEventListener('click', function () {
        var shouldOpen = question.getAttribute('aria-expanded') !== 'true';
        faqItems.forEach(function (otherItem) {
          setFaqState(otherItem, otherItem === item && shouldOpen);
        });
      });
    });
  }

  function boot() {
    document.querySelectorAll('[data-ac-storage-page]').forEach(init);
  }

  if (window.__acStoragePageInstalled) {
    boot();
    return;
  }
  window.__acStoragePageInstalled = true;
  document.addEventListener('DOMContentLoaded', boot);
  document.addEventListener('shopify:section:load', boot);
  document.addEventListener('shopify:section:reorder', boot);
  document.addEventListener('shopify:section:select', boot);
  if (document.readyState !== 'loading') boot();
})();
