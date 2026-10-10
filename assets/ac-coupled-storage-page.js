(function () {
  'use strict';

  var navigationObserver = null;

  function setupFlowControls(root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[data-ac-flow-toggle]'));
    var panels = Array.prototype.slice.call(root.querySelectorAll('[data-ac-flow-panel]'));
    if (!tabs.length || !panels.length) return;

    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var hasPairedVideos = panels.length === 2 && panels.every(function (panel) {
      return Boolean(panel.querySelector('video'));
    });
    var shouldAutoPlay = !reducedMotion;
    var shouldAutoCycle = hasPairedVideos && shouldAutoPlay;
    var isInViewport = false;

    function activePanel() {
      return panels.find(function (panel) { return panel.classList.contains('is-active'); }) || panels[0] || null;
    }

    function pauseVideos(exceptPanel) {
      panels.forEach(function (panel) {
        if (panel === exceptPanel) return;
        panel.querySelectorAll('video').forEach(function (video) { video.pause(); });
      });
    }

    function playPanelVideo(panel, restart, userInitiated) {
      if (!panel || !isInViewport || (!shouldAutoPlay && !userInitiated)) return;
      var video = panel.querySelector('video');
      if (!video) return;
      pauseVideos(panel);
      video.muted = true;
      video.playsInline = true;
      if (restart) {
        try { video.currentTime = 0; } catch (error) { /* The video may not be seekable yet. */ }
      }
      var playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(function () {});
    }

    function activate(tab, options) {
      if (!tab) return;
      var settings = options || {};
      var state = tab.dataset.acFlowToggle;
      tabs.forEach(function (button) {
        var active = button === tab;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
        button.tabIndex = active ? 0 : -1;
      });
      panels.forEach(function (panel) {
        var active = panel.dataset.acFlowPanel === state;
        panel.classList.toggle('is-active', active);
        panel.hidden = !active;
        panel.setAttribute('aria-hidden', active ? 'false' : 'true');
        if (active) playPanelVideo(panel, Boolean(settings.restart), Boolean(settings.userInitiated));
        else panel.querySelectorAll('video').forEach(function (video) { video.pause(); });
      });
    }

    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () { activate(tab, { restart: true, userInitiated: true }); });
      tab.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        var direction = event.key === 'ArrowRight' ? 1 : -1;
        var next = tabs[(index + direction + tabs.length) % tabs.length];
        activate(next, { restart: true, userInitiated: true });
        next.focus();
      });
    });

    panels.forEach(function (panel) {
      panel.querySelectorAll('video').forEach(function (video) {
        video.addEventListener('ended', function () {
          if (!shouldAutoCycle || !isInViewport || !panel.classList.contains('is-active')) return;
          var activeTabIndex = tabs.findIndex(function (tab) {
            return tab.dataset.acFlowToggle === panel.dataset.acFlowPanel;
          });
          activate(tabs[(activeTabIndex + 1) % tabs.length], { restart: true });
        });
      });
    });

    var initialTab = tabs.find(function (tab) { return tab.classList.contains('is-active'); }) || tabs[0];
    activate(initialTab);

    function updateViewport(isVisible) {
      isInViewport = isVisible;
      if (!isInViewport) {
        pauseVideos(null);
        return;
      }
      if (shouldAutoPlay) playPanelVideo(activePanel(), false, false);
    }

    if (typeof window.IntersectionObserver === 'function') {
      var observer = new window.IntersectionObserver(function (entries) {
        var entry = entries[0];
        updateViewport(Boolean(entry && entry.isIntersecting && entry.intersectionRatio >= 0.25));
      }, { threshold: [0, 0.25] });
      observer.observe(root);
    } else {
      updateViewport(true);
    }
  }

  function setFaqState(item, open) {
    var question = item.querySelector('[data-ac-faq-question]');
    var answer = item.querySelector('[data-ac-faq-answer]');
    if (!question || !answer) return;

    if (answer._acFaqHideTimer) {
      window.clearTimeout(answer._acFaqHideTimer);
      answer._acFaqHideTimer = null;
    }

    if (!open && !answer.classList.contains('is-open') && answer.hidden) return;

    item.classList.toggle('is-open', open);
    question.setAttribute('aria-expanded', open ? 'true' : 'false');
    answer.setAttribute('aria-hidden', open ? 'false' : 'true');
    var marker = question.querySelector('span');
    if (marker) marker.textContent = open ? '–' : '+';
    if (open) {
      answer.hidden = false;
      answer.style.maxHeight = '0px';
      var schedule = window.requestAnimationFrame || function (callback) { window.setTimeout(callback, 0); };
      schedule(function () {
        if (question.getAttribute('aria-expanded') !== 'true') return;
        answer.classList.add('is-open');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      });
      return;
    }

    answer.classList.remove('is-open');
    answer.style.maxHeight = '0px';
    answer.hidden = false;
    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var hideDelay = reducedMotion ? 0 : 340;
    answer._acFaqHideTimer = window.setTimeout(function () {
      if (!answer.classList.contains('is-open')) answer.hidden = true;
      answer._acFaqHideTimer = null;
    }, hideDelay);
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

    setupFlowControls(root);

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
