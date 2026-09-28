(function () {
  'use strict';

  var initializedNavs = new WeakSet();
  var navControllers = new WeakMap();
  var globalHandlerReady = false;
  var navSelector = '[data-anchor-nav]';
  var linkSelector = '[data-anchor-link], [data-bw-anchor-link], [data-vpp-anchor-link]';
  var navLinkSelector = '[data-anchor-nav-link], .bw-anchor-nav__link, .vpp-anchor-nav__link';

  function reducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function targetFor(link) {
    if (!link) return null;

    var href = link.getAttribute('href') || '';
    if (href.charAt(0) !== '#' || href.length < 2) return null;

    try {
      return document.getElementById(decodeURIComponent(href.slice(1)));
    } catch (error) {
      return document.getElementById(href.slice(1));
    }
  }

  function locationTarget() {
    var hash = window.location.hash || '';
    if (hash.charAt(0) !== '#' || hash.length < 2) return null;

    try {
      return document.getElementById(decodeURIComponent(hash.slice(1)));
    } catch (error) {
      return document.getElementById(hash.slice(1));
    }
  }

  function scrollToTarget(target, behavior) {
    if (!target) return;
    target.scrollIntoView({
      behavior: behavior || (reducedMotion() ? 'auto' : 'smooth'),
      block: 'start'
    });
  }

  function shouldUseNativeClick(event, link) {
    return event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || link.target === '_blank'
      || link.hasAttribute('download');
  }

  function setupGlobalHandler() {
    if (globalHandlerReady) return;
    globalHandlerReady = true;

    document.addEventListener('click', function (event) {
      var link = event.target.closest && event.target.closest(linkSelector);
      if (!link || shouldUseNativeClick(event, link)) return;

      var target = targetFor(link);
      if (!target) return;

      event.preventDefault();
      scrollToTarget(target);

      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '#' + target.id);
      }

      window.dispatchEvent(new CustomEvent('anchor-navigation:update'));
    });
  }

  function setupNav(nav) {
    if (!nav || initializedNavs.has(nav)) return;
    initializedNavs.add(nav);

    var scroller = nav.querySelector('.vpp-anchor-nav__links, .bw-anchor-nav__inner, .anchor-nav__links, .anchor-nav__inner');
    var links = [];
    var activeLinks = [];
    var scheduled = false;

    function collectTargets() {
      links = Array.prototype.slice.call(nav.querySelectorAll(linkSelector));
      activeLinks = [];

      links.forEach(function (link) {
        var target = targetFor(link);
        link.hidden = false;
        if (!target || target.hidden) return;

        if (link.matches(navLinkSelector) && !link.hasAttribute('data-anchor-nav-cta')) {
          activeLinks.push({ link: link, target: target });
        }
      });
    }

    function revealActiveLink(link) {
      if (!scroller || !link) return;

      var scrollerRect = scroller.getBoundingClientRect();
      var linkRect = link.getBoundingClientRect();
      if (linkRect.left < scrollerRect.left || linkRect.right > scrollerRect.right) {
        link.scrollIntoView({
          behavior: reducedMotion() ? 'auto' : 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }
    }

    function setActiveLink(activeItem) {
      activeLinks.forEach(function (item) {
        var active = item === activeItem;
        item.link.classList.toggle('is-active', active);
        if (active) item.link.setAttribute('aria-current', 'location');
        else item.link.removeAttribute('aria-current');
      });

      if (activeItem) revealActiveLink(activeItem.link);
    }

    function updateActiveLink() {
      scheduled = false;
      if (!activeLinks.length) return;

      var activationLine = Math.max(0, nav.getBoundingClientRect().bottom) + 36;
      var activeItem = activeLinks[0];

      activeLinks.forEach(function (item) {
        if (item.target.getBoundingClientRect().top <= activationLine) activeItem = item;
      });

      setActiveLink(activeItem);
    }

    function scheduleUpdate() {
      if (scheduled) return;
      scheduled = true;
      (window.requestAnimationFrame || function (callback) { window.setTimeout(callback, 0); })(updateActiveLink);
    }

    function syncLocation() {
      var target = locationTarget();
      if (target) {
        var activeItem = activeLinks.find(function (item) { return item.target === target; });
        if (activeItem) setActiveLink(activeItem);
        scrollToTarget(target, 'auto');
      }
      scheduleUpdate();
    }

    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('anchor-navigation:update', scheduleUpdate);
    window.addEventListener('hashchange', syncLocation);
    window.addEventListener('popstate', syncLocation);

    collectTargets();
    navControllers.set(nav, {
      refresh: function () {
        collectTargets();
        scheduleUpdate();
      }
    });
    updateActiveLink();
    if (window.location.hash) {
      (window.requestAnimationFrame || function (callback) { window.setTimeout(callback, 0); })(syncLocation);
    }
  }

  function boot(root) {
    var context = root || document;
    setupGlobalHandler();

    if (context.matches && context.matches(navSelector)) setupNav(context);
    if (context.querySelectorAll) context.querySelectorAll(navSelector).forEach(setupNav);

    if (context !== document) {
      document.querySelectorAll(navSelector).forEach(function (nav) {
        var controller = navControllers.get(nav);
        if (controller) controller.refresh();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { boot(document); }, { once: true });
  } else {
    boot(document);
  }

  document.addEventListener('shopify:section:load', function (event) {
    window.setTimeout(function () { boot(event.target); }, 0);
  });
}());
