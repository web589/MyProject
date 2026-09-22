(function () {
  'use strict';

  var initializedNavs = new WeakSet();
  var initializedTables = new WeakSet();
  var initializedFaqs = new WeakSet();
  var globalAnchorHandlerReady = false;

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function getHashTarget(link) {
    if (!link) return null;

    var rawHref = link.getAttribute('href') || '';
    if (rawHref.charAt(0) !== '#' || rawHref.length < 2) return null;

    try {
      return document.getElementById(decodeURIComponent(rawHref.slice(1)));
    } catch (error) {
      return document.getElementById(rawHref.slice(1));
    }
  }

  function scrollToTarget(target) {
    if (!target) return;
    target.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start'
    });
  }

  function setupGlobalAnchorHandler() {
    if (globalAnchorHandlerReady) return;
    globalAnchorHandlerReady = true;

    document.addEventListener('click', function (event) {
      var link = event.target.closest('[data-bw-anchor-link]');
      if (!link) return;

      var target = getHashTarget(link);
      if (!target) return;

      event.preventDefault();
      scrollToTarget(target);

      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '#' + target.id);
      }
    });
  }

  function setupAnchorNav(nav) {
    if (!nav || initializedNavs.has(nav)) return;
    initializedNavs.add(nav);

    var navScroller = nav.querySelector('.bw-anchor-nav__inner');
    var links = Array.prototype.slice.call(nav.querySelectorAll('[data-bw-anchor-link]'));
    var activeLinks = [];
    var scheduled = false;

    links.forEach(function (link) {
      var target = getHashTarget(link);
      if (!target) {
        link.hidden = true;
        return;
      }

      if (link.classList.contains('bw-anchor-nav__link')) {
        activeLinks.push({ link: link });
      }
    });

    function revealActiveLink(link) {
      if (!navScroller || !link) return;

      var scrollerRect = navScroller.getBoundingClientRect();
      var linkRect = link.getBoundingClientRect();
      if (linkRect.left < scrollerRect.left || linkRect.right > scrollerRect.right) {
        link.scrollIntoView({
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }
    }

    function updateActiveLink() {
      scheduled = false;
      if (!activeLinks.length) return;

      var navBottom = nav.getBoundingClientRect().bottom;
      var activationLine = Math.max(0, navBottom) + 36;
      var activeItem = activeLinks[0];

      activeLinks.forEach(function (item) {
        var target = getHashTarget(item.link);
        if (target && target.getBoundingClientRect().top <= activationLine) {
          activeItem = item;
        }
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
      window.requestAnimationFrame(updateActiveLink);
    }

    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    updateActiveLink();
  }

  function setupComparisonTable(section) {
    if (!section || initializedTables.has(section)) return;

    var sticky = section.querySelector('[data-bw-compare-sticky]');
    var scroller = section.querySelector('[data-bw-compare-scroller]');
    var table = section.querySelector('[data-bw-compare-table-element]');
    var stickyProducts = section.querySelector('[data-bw-compare-sticky-products]');
    var stickyProductItems = Array.prototype.slice.call(section.querySelectorAll('[data-bw-compare-sticky-product]'));
    var selectableProducts = Array.prototype.slice.call(section.querySelectorAll('[data-bw-compare-product-select]'));
    var comparisonColumns = Array.prototype.slice.call(section.querySelectorAll('[data-bw-compare-column]'));
    if (!sticky || !scroller || !table || !stickyProducts || !table.tHead) return;

    initializedTables.add(section);

    var scheduled = false;
    var resizeObserver = null;

    function getNavBottom() {
      var nav = document.querySelector('[data-bw-anchor-nav]');
      if (!nav || nav.hidden) return 0;
      return Math.max(0, Math.round(nav.getBoundingClientRect().bottom));
    }

    function selectProductColumn(column) {
      var selectedColumn = String(column);

      comparisonColumns.forEach(function (cell) {
        cell.classList.toggle('is-selected', cell.getAttribute('data-bw-compare-column') === selectedColumn);
      });

      selectableProducts.forEach(function (product) {
        var selected = product.getAttribute('data-bw-compare-column') === selectedColumn;
        product.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
    }

    function setStickyAccessibility(active) {
      sticky.setAttribute('aria-hidden', active ? 'false' : 'true');
      if (active) sticky.removeAttribute('inert');
      else sticky.setAttribute('inert', '');

      stickyProductItems.forEach(function (item) {
        item.setAttribute('tabindex', active ? '0' : '-1');
      });
    }

    selectableProducts.forEach(function (product) {
      product.addEventListener('click', function (event) {
        if (event.target.closest && event.target.closest('a')) return;
        selectProductColumn(product.getAttribute('data-bw-compare-column'));
      });

      product.addEventListener('keydown', function (event) {
        if (event.target.closest && event.target.closest('a')) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;

        event.preventDefault();
        selectProductColumn(product.getAttribute('data-bw-compare-column'));
      });
    });

    selectProductColumn('1');

    function syncHorizontalPosition() {
      stickyProducts.style.transform = 'translate3d(' + (-scroller.scrollLeft) + 'px, 0, 0)';
    }

    function measureColumns() {
      var headerCells = table.tHead.rows.length ? Array.prototype.slice.call(table.tHead.rows[0].cells) : [];
      if (headerCells.length < 5) return;

      var scrollerRect = scroller.getBoundingClientRect();
      var labelWidth = headerCells[0].getBoundingClientRect().width;
      var stickyWidth = scroller.clientWidth;

      sticky.style.setProperty('--bw-compare-sticky-left', Math.round(scrollerRect.left) + 'px');
      sticky.style.setProperty('--bw-compare-sticky-width', Math.round(stickyWidth) + 'px');
      sticky.style.setProperty('--bw-compare-label-width', labelWidth + 'px');

      stickyProductItems.forEach(function (item, index) {
        var sourceCell = headerCells[index + 1];
        if (!sourceCell) return;
        item.style.width = sourceCell.getBoundingClientRect().width + 'px';
      });

      stickyProducts.style.width = Math.max(0, table.scrollWidth - labelWidth) + 'px';
      syncHorizontalPosition();
    }

    function updateStickyState() {
      scheduled = false;

      var stickyTop = getNavBottom();
      var tableRect = table.getBoundingClientRect();
      var theadRect = table.tHead.getBoundingClientRect();
      var scrollerRect = scroller.getBoundingClientRect();
      var hasHorizontalSpace = scrollerRect.width > 0;
      var headerHasPassed = theadRect.top <= stickyTop;
      var tableHasRoom = tableRect.bottom > stickyTop + 92;
      var shouldStick = hasHorizontalSpace && headerHasPassed && tableHasRoom;

      sticky.style.setProperty('--bw-compare-sticky-top', stickyTop + 'px');
      sticky.classList.toggle('is-stuck', shouldStick);
      setStickyAccessibility(shouldStick);

      if (shouldStick) measureColumns();
    }

    function scheduleUpdate() {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(updateStickyState);
    }

    scroller.addEventListener('scroll', function () {
      syncHorizontalPosition();
      scheduleUpdate();
    }, { passive: true });
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);

    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(scheduleUpdate);
      resizeObserver.observe(scroller);
      resizeObserver.observe(table);
    }

    table.querySelectorAll('img').forEach(function (image) {
      if (!image.complete) image.addEventListener('load', scheduleUpdate, { once: true });
    });

    measureColumns();
    updateStickyState();
  }

  function setupFaq(section) {
    if (!section || initializedFaqs.has(section)) return;

    var items = Array.prototype.slice.call(section.querySelectorAll('.bw-faq__item'));
    if (!items.length) return;

    initializedFaqs.add(section);

    items.forEach(function (item) {
      var summary = item.querySelector('summary');
      var answer = item.querySelector('.bw-faq__answer');
      if (!summary || !answer) return;

      function clearAnimation(open) {
        item.open = open;
        answer.style.height = '';
        answer.style.opacity = '';
        item.classList.remove('is-opening', 'is-closing');
        item.removeAttribute('data-bw-faq-animating');
      }

      summary.addEventListener('click', function (event) {
        event.preventDefault();

        if (item.hasAttribute('data-bw-faq-animating')) return;

        var shouldOpen = !item.open;
        if (prefersReducedMotion()) {
          item.open = shouldOpen;
          return;
        }

        item.setAttribute('data-bw-faq-animating', '');
        item.classList.toggle('is-opening', shouldOpen);
        item.classList.toggle('is-closing', !shouldOpen);

        if (shouldOpen) {
          item.open = true;
          answer.style.height = '0px';
          answer.style.opacity = '0';
          void answer.offsetHeight;
        } else {
          answer.style.height = answer.scrollHeight + 'px';
          answer.style.opacity = '1';
          void answer.offsetHeight;
        }

        window.requestAnimationFrame(function () {
          answer.style.height = shouldOpen ? answer.scrollHeight + 'px' : '0px';
          answer.style.opacity = shouldOpen ? '1' : '0';
        });

        window.setTimeout(function () {
          clearAnimation(shouldOpen);
        }, 380);
      });
    });
  }

  function boot(root) {
    var context = root || document;
    setupGlobalAnchorHandler();

    if (context.matches && context.matches('[data-bw-anchor-nav]')) setupAnchorNav(context);
    context.querySelectorAll('[data-bw-anchor-nav]').forEach(setupAnchorNav);

    if (context.matches && context.matches('[data-bw-compare-table]')) setupComparisonTable(context);
    context.querySelectorAll('[data-bw-compare-table]').forEach(setupComparisonTable);

    if (context.matches && context.matches('[data-bw-module="faq"]')) setupFaq(context);
    context.querySelectorAll('[data-bw-module="faq"]').forEach(setupFaq);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { boot(document); }, { once: true });
  } else {
    boot(document);
  }

  document.addEventListener('shopify:section:load', function (event) {
    window.setTimeout(function () { boot(event.target); }, 0);
  });
})();
