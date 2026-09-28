(function () {
  'use strict';

  var initializedTables = new WeakSet();
  var initializedFaqs = new WeakSet();

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
      var nav = document.querySelector('[data-anchor-nav], [data-bw-anchor-nav], [data-vpp-anchor-nav]');
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

      var desktopSticky = !window.matchMedia || window.matchMedia('(min-width: 900px)').matches;
      if (!desktopSticky) {
        sticky.classList.remove('is-stuck');
        setStickyAccessibility(false);
        return;
      }

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

      answer.addEventListener('transitionend', function (event) {
        if (event.target !== answer || event.propertyName !== 'grid-template-rows') return;
        if (!item.classList.contains('is-closing')) return;

        item.open = false;
        item.classList.remove('is-closing');
      });

      summary.addEventListener('click', function (event) {
        event.preventDefault();

        var shouldOpen = item.classList.contains('is-closing') || !item.open;
        items.forEach(function (otherItem) {
          if (otherItem === item || !otherItem.open) return;
          if (prefersReducedMotion()) {
            otherItem.open = false;
            otherItem.classList.remove('is-closing');
          } else {
            otherItem.classList.add('is-closing');
          }
        });
        if (prefersReducedMotion()) {
          item.open = shouldOpen;
          item.classList.remove('is-closing');
          return;
        }

        if (shouldOpen) {
          item.classList.remove('is-closing');
          item.open = true;
        } else {
          item.classList.add('is-closing');
        }
      });
    });
  }

  function boot(root) {
    var context = root || document;

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
