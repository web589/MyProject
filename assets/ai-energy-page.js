(function () {
  'use strict';

  function reducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function renderTimeline(tabRoot, value) {
    var tabs = Array.prototype.slice.call(tabRoot.querySelectorAll('[data-ai-tab]'));
    var panels = Array.prototype.slice.call(tabRoot.querySelectorAll('[data-ai-panel]'));
    tabs.forEach(function (tab) {
      var active = tab.dataset.aiTab === value;
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach(function (panel) {
      var active = panel.dataset.aiPanel === value;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    tabRoot.dataset.aiTimelineValue = value;
  }

  function bindTabs(root) {
    root.querySelectorAll('[data-ai-tabs]').forEach(function (tabRoot) {
      var tabs = Array.prototype.slice.call(tabRoot.querySelectorAll('[data-ai-tab]'));
      if (!tabs.length) return;
      tabs.forEach(function (button) {
        if (button.dataset.aiTabBound === 'true') return;
        button.dataset.aiTabBound = 'true';
        button.addEventListener('click', function () {
          renderTimeline(tabRoot, button.dataset.aiTab);
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
      renderTimeline(tabRoot, activeTab.dataset.aiTab);
    });
  }

  function bindDesignSystemFaq(root) {
    root.querySelectorAll('.ai-energy__faq-list').forEach(function (list) {
      if (list.dataset.aiFaqBound === 'true') return;
      list.dataset.aiFaqBound = 'true';

      var questions = Array.prototype.slice.call(list.querySelectorAll('[data-ai-faq-question]'));

      function getAnswer(question) {
        var answerId = question.getAttribute('aria-controls');
        return answerId ? document.getElementById(answerId) : null;
      }

      function closeAnswer(question) {
        var answer = getAnswer(question);
        question.setAttribute('aria-expanded', 'false');
        var icon = question.querySelector('span:last-child');
        if (icon) icon.textContent = '+';
        if (!answer) return;

        answer.classList.remove('is-open');
        answer.setAttribute('aria-hidden', 'true');
        answer.style.maxHeight = '0px';
        if (answer._aiFaqHideTimer) window.clearTimeout(answer._aiFaqHideTimer);
        answer._aiFaqHideTimer = window.setTimeout(function () {
          if (!answer.classList.contains('is-open')) answer.hidden = true;
        }, reducedMotion() ? 0 : 340);
      }

      function openAnswer(question) {
        var answer = getAnswer(question);
        if (!answer) return;
        if (answer._aiFaqHideTimer) window.clearTimeout(answer._aiFaqHideTimer);

        question.setAttribute('aria-expanded', 'true');
        var icon = question.querySelector('span:last-child');
        if (icon) icon.textContent = '−';
        answer.hidden = false;
        answer.classList.add('is-open');
        answer.setAttribute('aria-hidden', 'false');
        answer.style.maxHeight = '0px';

        var schedule = window.requestAnimationFrame || function (callback) { window.setTimeout(callback, 0); };
        schedule(function () {
          if (question.getAttribute('aria-expanded') === 'true') answer.style.maxHeight = answer.scrollHeight + 'px';
        });
      }

      questions.forEach(function (question) {
        var answer = getAnswer(question);
        question.setAttribute('aria-expanded', 'false');
        if (answer) {
          answer.hidden = true;
          answer.classList.remove('is-open');
          answer.setAttribute('aria-hidden', 'true');
          answer.style.maxHeight = '0px';
        }

        question.addEventListener('click', function () {
          var shouldOpen = question.getAttribute('aria-expanded') !== 'true';
          questions.forEach(closeAnswer);
          if (shouldOpen) openAnswer(question);
        });
      });
    });
  }

  function boot() {
    bindTabs(document);
    bindDesignSystemFaq(document);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  document.addEventListener('shopify:section:load', boot);
  document.addEventListener('shopify:section:reorder', boot);
  document.addEventListener('shopify:section:select', boot);
})();
