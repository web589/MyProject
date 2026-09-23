(function () {
  'use strict';

  function reducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function scrollToTarget(target) {
    if (!target) return;
    target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  function bindTabs(root) {
    root.querySelectorAll('[data-ai-tabs]').forEach(function (tabRoot) {
      var tabs = Array.prototype.slice.call(tabRoot.querySelectorAll('[data-ai-tab]'));
      if (!tabs.length) return;
      tabs.forEach(function (button) {
        if (button.dataset.aiTabBound === 'true') return;
        button.dataset.aiTabBound = 'true';
        button.addEventListener('click', function () {
          var value = button.dataset.aiTab;
          tabRoot.querySelectorAll('[data-ai-tab]').forEach(function (tab) {
            var active = tab === button;
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
            tab.tabIndex = active ? 0 : -1;
          });
          tabRoot.querySelectorAll('[data-ai-panel]').forEach(function (panel) {
            var active = panel.dataset.aiPanel === value;
            panel.hidden = !active;
            panel.classList.toggle('is-active', active);
          });
        });
        button.addEventListener('keydown', function (event) {
          if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
          var tabs = Array.prototype.slice.call(tabRoot.querySelectorAll('[data-ai-tab]'));
          var index = tabs.indexOf(button);
          var nextIndex = event.key === 'ArrowRight' ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
          event.preventDefault();
          tabs[nextIndex].focus();
          tabs[nextIndex].click();
        });
      });
      tabRoot.dataset.aiTabsBound = 'true';

      var activeTab = tabs.find(function (tab) { return tab.getAttribute('aria-selected') === 'true'; }) || tabs[0];
      var activeValue = activeTab.dataset.aiTab;
      tabs.forEach(function (tab) {
        var active = tab === activeTab;
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        tab.tabIndex = active ? 0 : -1;
      });
      tabRoot.querySelectorAll('[data-ai-panel]').forEach(function (panel) {
        var active = panel.dataset.aiPanel === activeValue;
        panel.hidden = !active;
        panel.classList.toggle('is-active', active);
      });
    });
  }

  function bindAnchors() {
    var nav = document.querySelector('[data-bw-anchor-nav]');
    if (!nav || nav.dataset.aiAnchorBound === 'true') return;
    nav.dataset.aiAnchorBound = 'true';
    var links = Array.prototype.slice.call(nav.querySelectorAll('[data-bw-anchor-link]'));
    var targets = [];

    links.forEach(function (link) {
      var href = link.getAttribute('href');
      var target = href && href.charAt(0) === '#' ? document.querySelector(href) : null;
      if (!target || target.id === 'navigation') {
        link.hidden = !target || target.id === 'navigation';
        return;
      }
      targets.push({ target: target, link: link });
      link.addEventListener('click', function (event) {
        event.preventDefault();
        scrollToTarget(target);
      });
    });

    if (!('IntersectionObserver' in window)) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        targets.forEach(function (item) { item.link.classList.toggle('is-active', item.target === entry.target); });
      });
    }, { rootMargin: '-20% 0px -70% 0px', threshold: 0 });
    targets.forEach(function (item) { observer.observe(item.target); });
  }

  function bindFaq(root) {
    root.querySelectorAll('.ai-energy__faq-list').forEach(function (list) {
      if (list.dataset.aiFaqBound === 'true') return;
      list.dataset.aiFaqBound = 'true';
      var questions = Array.prototype.slice.call(list.querySelectorAll('.ai-energy__faq-question'));
      questions.forEach(function (question) {
        question.addEventListener('click', function () {
          var open = question.getAttribute('aria-expanded') !== 'true';
          questions.forEach(function (otherQuestion) {
            var answer = document.getElementById(otherQuestion.getAttribute('aria-controls'));
            var active = otherQuestion === question && open;
            otherQuestion.setAttribute('aria-expanded', active ? 'true' : 'false');
            var icon = otherQuestion.querySelector('span:last-child');
            if (icon) icon.textContent = active ? '–' : '+';
            if (!answer) return;
            answer.hidden = !active;
            answer.setAttribute('aria-hidden', active ? 'false' : 'true');
          });
        });
      });
      questions.forEach(function (question) {
        var answer = document.getElementById(question.getAttribute('aria-controls'));
        if (answer) { answer.hidden = true; answer.setAttribute('aria-hidden', 'true'); }
      });
    });
  }

  function boot() {
    bindTabs(document);
    bindFaq(document);
    bindAnchors();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  document.addEventListener('shopify:section:load', boot);
  document.addEventListener('shopify:section:reorder', boot);
  document.addEventListener('shopify:section:select', boot);
})();
