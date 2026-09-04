(function() {
  'use strict';

  function slugify(value) {
    return value
      .toString()
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'section';
  }

  function uniqueId(base, usedIds, currentElement) {
    var id = base;
    var suffix = 2;

    while (usedIds[id] || (document.getElementById(id) && document.getElementById(id) !== currentElement)) {
      id = base + '-' + suffix;
      suffix += 1;
    }

    usedIds[id] = true;
    return id;
  }

  function setActiveItem(list, id) {
    Array.prototype.forEach.call(list.querySelectorAll('[data-toc-target]'), function(link) {
      link.classList.toggle('is-active', link.getAttribute('data-toc-target') === id);
    });
  }

  function syncBlogCenterOffset(root, blogCenter) {
    if (!blogCenter) {
      root.style.removeProperty('--blog-center-sticky-height');
      return 0;
    }

    var height = Math.ceil(blogCenter.getBoundingClientRect().height);
    root.style.setProperty('--blog-center-sticky-height', height + 'px');
    return height;
  }

  function initTableOfContents(root) {
    if (!root || root.getAttribute('data-blog-article-ready') === 'true') return;

    var blogCenter = root.querySelector('[data-blog-center]');
    var body = root.querySelector('[data-blog-article-body]');
    var toc = root.querySelector('[data-blog-article-toc]');
    var list = root.querySelector('[data-blog-article-toc-list]');
    var intersectionObserver;
    var headings = [];

    syncBlogCenterOffset(root, blogCenter);
    root.setAttribute('data-blog-article-ready', 'true');

    function observeHeadings() {
      if (!headings.length || !('IntersectionObserver' in window)) return;

      if (intersectionObserver) intersectionObserver.disconnect();

      intersectionObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) setActiveItem(list, entry.target.id);
        });
      }, {
        rootMargin: '-' + (syncBlogCenterOffset(root, blogCenter) + 32) + 'px 0px -65% 0px',
        threshold: 0
      });

      headings.forEach(function(heading) {
        intersectionObserver.observe(heading);
      });
    }

    function observeBlogCenter() {
      if (!('ResizeObserver' in window) || !blogCenter) return;

      var resizeObserver = new ResizeObserver(function() {
        syncBlogCenterOffset(root, blogCenter);
        observeHeadings();
      });

      resizeObserver.observe(blogCenter);
    }

    if (!body || !toc || !list) {
      observeBlogCenter();
      return;
    }

    headings = Array.prototype.slice.call(body.querySelectorAll('h2, h3'));
    if (!headings.length) {
      observeBlogCenter();
      return;
    }

    var usedIds = {};

    headings.forEach(function(heading, index) {
      var headingText = heading.textContent.trim();
      var base = slugify(headingText || 'section-' + (index + 1));
      var id = uniqueId(heading.id || base, usedIds, heading);

      heading.id = id;
      usedIds[id] = true;

      var item = document.createElement('li');
      item.className = 'blog-article__toc-item' + (heading.tagName.toLowerCase() === 'h3' ? ' blog-article__toc-item--sub' : '');

      var link = document.createElement('a');
      link.className = 'blog-article__toc-link';
      link.href = '#' + id;
      link.setAttribute('data-toc-target', id);
      link.textContent = headingText;

      link.addEventListener('click', function(event) {
        event.preventDefault();
        var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        heading.scrollIntoView({
          behavior: reduceMotion ? 'auto' : 'smooth',
          block: 'start'
        });
        window.history.replaceState(null, '', '#' + id);
        setActiveItem(list, id);
      });

      item.appendChild(link);
      list.appendChild(item);
    });

    toc.hidden = false;
    setActiveItem(list, headings[0].id);

    observeHeadings();
    observeBlogCenter();
  }

  function init(scope) {
    if (!scope) return;

    if (scope.matches && scope.matches('[data-blog-article]')) {
      initTableOfContents(scope);
      return;
    }

    Array.prototype.forEach.call(scope.querySelectorAll('[data-blog-article]'), initTableOfContents);
  }

  function ready() {
    init(document);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }

  document.addEventListener('shopify:section:load', function(event) {
    init(event.target);
  });
})();
