(function() {
  'use strict';

  var gridSelector = '[data-blog-card-grid]';

  function getPageUrl(page) {
    var url = new URL(window.location.href);

    if (page > 1) {
      url.searchParams.set('page', String(page));
    } else {
      url.searchParams.delete('page');
    }

    return url.pathname + url.search + url.hash;
  }

  function appendPageLink(nav, page, currentPage) {
    var wrapper = document.createElement('span');
    wrapper.className = 'page';

    if (page === currentPage) {
      wrapper.className += ' current';
      wrapper.setAttribute('aria-current', 'page');
      wrapper.textContent = String(page);
    } else {
      var link = document.createElement('a');
      link.href = getPageUrl(page);
      link.textContent = String(page);
      link.setAttribute('aria-label', String(page));
      wrapper.appendChild(link);
    }

    nav.appendChild(wrapper);
  }

  function appendArrow(nav, direction, page, label) {
    var wrapper = document.createElement('span');
    var link = document.createElement('a');
    wrapper.className = direction;
    link.href = getPageUrl(page);
    link.setAttribute('aria-label', label);
    link.textContent = direction === 'prev' ? '‹' : '›';
    wrapper.appendChild(link);
    nav.appendChild(wrapper);
  }

  function renderPagination(grid) {
    var state = grid.blogPaginationState;
    var nav = state.nav;
    var totalPages = Math.ceil(state.cards.length / state.pageSize);
    var pageParam = new URL(window.location.href).searchParams.get('page');
    var requestedPage = parseInt(pageParam, 10);
    var currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

    if (totalPages < 1) {
      currentPage = 1;
    } else if (currentPage > totalPages) {
      currentPage = totalPages;
    }

    var normalizedPageParam = currentPage > 1 ? String(currentPage) : null;
    if (pageParam !== normalizedPageParam) {
      window.history.replaceState(window.history.state, '', getPageUrl(currentPage));
    }

    var firstVisibleCard = (currentPage - 1) * state.pageSize;
    state.cards.forEach(function(card, index) {
      card.hidden = index < firstVisibleCard || index >= firstVisibleCard + state.pageSize;
    });

    while (nav.firstChild) {
      nav.removeChild(nav.firstChild);
    }

    if (totalPages < 2) return;

    if (currentPage > 1) {
      appendArrow(nav, 'prev', currentPage - 1, nav.dataset.previousLabel);
    }

    var visiblePages = [];
    for (var page = 1; page <= totalPages; page += 1) {
      if (page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1) {
        visiblePages.push(page);
      }
    }

    var previousPage = 0;
    visiblePages.forEach(function(page) {
      if (previousPage && page - previousPage > 1) {
        var gap = document.createElement('span');
        gap.className = 'deco';
        gap.setAttribute('aria-hidden', 'true');
        gap.textContent = '…';
        nav.appendChild(gap);
      }

      appendPageLink(nav, page, currentPage);
      previousPage = page;
    });

    if (currentPage < totalPages) {
      appendArrow(nav, 'next', currentPage + 1, nav.dataset.nextLabel);
    }
  }

  function initializeGrid(grid) {
    if (grid.blogPaginationState) return;

    var pageSize = parseInt(grid.dataset.pageSize, 10);
    var nav = grid.parentNode.querySelector('[data-blog-pagination]');
    if (!nav || !Number.isFinite(pageSize) || pageSize < 1) return;

    var cards = [];
    Array.prototype.forEach.call(grid.children, function(child) {
      if (child.classList.contains('blog-card')) cards.push(child);
    });

    grid.blogPaginationState = {
      cards: cards,
      nav: nav,
      pageSize: pageSize
    };
    renderPagination(grid);
  }

  function initialize(scope) {
    if (scope.matches && scope.matches(gridSelector)) {
      initializeGrid(scope);
    }

    if (!scope.querySelectorAll) return;
    Array.prototype.forEach.call(scope.querySelectorAll(gridSelector), initializeGrid);
  }

  function renderAll() {
    Array.prototype.forEach.call(document.querySelectorAll(gridSelector), function(grid) {
      if (grid.blogPaginationState) renderPagination(grid);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initialize(document);
    });
  } else {
    initialize(document);
  }

  document.addEventListener('shopify:section:load', function(event) {
    initialize(event.target);
  });

  window.addEventListener('popstate', renderAll);
})();
