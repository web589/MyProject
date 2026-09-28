(function () {
  'use strict';

  var initializedNavs = new WeakSet();
  var globalHandlerReady = false;

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

  function scrollToTarget(target) {
    if (!target) return;
    target.scrollIntoView({
      behavior: reducedMotion() ? 'auto' : 'smooth',
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
      var link = event.target.closest && event.target.closest('[data-vpp-anchor-link]');
      if (!link || shouldUseNativeClick(event, link)) return;

      var target = targetFor(link);
      if (!target) return;

      event.preventDefault();
      scrollToTarget(target);

      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '#' + target.id);
      }
    });
  }

  function setupNav(nav) {
    if (!nav || initializedNavs.has(nav)) return;
    initializedNavs.add(nav);

    var scroller = nav.querySelector('.vpp-anchor-nav__inner');
    var links = Array.prototype.slice.call(nav.querySelectorAll('[data-vpp-anchor-link]'));
    var activeLinks = [];
    var scheduled = false;

    links.forEach(function (link) {
      var target = targetFor(link);
      if (!target) {
        link.hidden = true;
        return;
      }
      if (link.classList.contains('vpp-anchor-nav__link')) {
        activeLinks.push({ link: link, target: target });
      }
    });

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

    function updateActiveLink() {
      scheduled = false;
      if (!activeLinks.length) return;

      var activationLine = Math.max(0, nav.getBoundingClientRect().bottom) + 36;
      var activeItem = activeLinks[0];

      activeLinks.forEach(function (item) {
        if (item.target.getBoundingClientRect().top <= activationLine) activeItem = item;
      });

      activeLinks.forEach(function (item) {
        var active = item === activeItem;
        item.link.classList.toggle('is-active', active);
        if (active) item.link.setAttribute('aria-current', 'location');
        else item.link.removeAttribute('aria-current');
      });

      revealActiveLink(activeItem.link);
    }

    function scheduleUpdate() {
      if (scheduled) return;
      scheduled = true;
      (window.requestAnimationFrame || function (callback) { window.setTimeout(callback, 0); })(updateActiveLink);
    }

    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('hashchange', scheduleUpdate);
    updateActiveLink();
  }

  function boot(root) {
    var context = root || document;
    setupGlobalHandler();
    if (context.matches && context.matches('[data-vpp-anchor-nav]')) setupNav(context);
    if (context.querySelectorAll) context.querySelectorAll('[data-vpp-anchor-nav]').forEach(setupNav);
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
