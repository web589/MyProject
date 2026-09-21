(function () {
  'use strict';

  var navigationObserver = null;

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

  function setupAnchorNavigation() {
    if (navigationObserver) {
      navigationObserver.disconnect();
      navigationObserver = null;
    }

    var nav = document.querySelector('[data-ac-storage-anchor-nav], [data-bw-anchor-nav]');
    if (!nav) return;

    var navScroller = nav.querySelector('.bw-anchor-nav__inner, .ac-storage-anchor-nav__links');
    var links = Array.prototype.slice.call(nav.querySelectorAll('[data-ac-anchor-link], [data-bw-anchor-link]'));
    var targets = [];
    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function revealActiveLink(link) {
      if (!navScroller || !link || link.classList.contains('bw-anchor-nav__cta') || link.classList.contains('ac-storage-anchor-nav__cta')) return;
      var scrollerRect = navScroller.getBoundingClientRect();
      var linkRect = link.getBoundingClientRect();
      if (linkRect.left < scrollerRect.left) {
        navScroller.scrollLeft -= scrollerRect.left - linkRect.left;
      } else if (linkRect.right > scrollerRect.right) {
        navScroller.scrollLeft += linkRect.right - scrollerRect.right;
      }
    }

    links.forEach(function (link) {
      var href = link.getAttribute('href');
      var targetId = href && href.charAt(0) === '#' ? href.slice(1) : '';
      var target = targetId ? document.getElementById(targetId) : null;

      link.hidden = !target || target.hidden;
      if (link.hidden) {
        link.classList.remove('is-active');
        link.removeAttribute('aria-current');
      }
      if (target && !target.hidden && !targets.includes(target)) targets.push(target);

      if (link.dataset.acAnchorInitialized === 'true') return;
      link.dataset.acAnchorInitialized = 'true';
      link.addEventListener('click', function (event) {
        if (!target || target.hidden) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', href);
        }
      });
    });

    if (!('IntersectionObserver' in window) || !targets.length) return;
    navigationObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var activeId = entry.target.id;
        links.forEach(function (link) {
          var active = link.getAttribute('href') === '#' + activeId;
          link.classList.toggle('is-active', active);
          if (active) {
            link.setAttribute('aria-current', 'location');
            revealActiveLink(link);
          } else {
            link.removeAttribute('aria-current');
          }
        });
      });
    }, { rootMargin: '-20% 0px -65% 0px', threshold: 0 });

    targets.forEach(function (target) {
      navigationObserver.observe(target);
    });
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
    setupAnchorNavigation();
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
