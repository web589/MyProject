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

  function getFixedHeaderHeight() {
    var stickyHeader = document.querySelector('[data-native-sticky="true"]');
    if (!stickyHeader) return 0;

    var headerGroup = document.getElementById('SiteHeaderGroup');
    var target = headerGroup || stickyHeader;
    return Math.ceil(target.getBoundingClientRect().height);
  }

  function syncStickyOffset(root, blogCenter) {
    var blogCenterHeight = blogCenter ? Math.ceil(blogCenter.getBoundingClientRect().height) : 0;
    var fixedHeight = getFixedHeaderHeight() + blogCenterHeight;

    root.style.setProperty('--blog-center-sticky-height', blogCenterHeight + 'px');
    root.style.setProperty('--blog-article-sticky-top', (fixedHeight + 16) + 'px');
    return fixedHeight;
  }

  function isMobileToc() {
    return window.matchMedia('(max-width: 1024px)').matches;
  }

  function setTocExpanded(toc, toggle, expanded) {
    toc.classList.toggle('is-open', expanded);
    if (toggle) toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  function placeTableOfContents(root, body, toc, toggle) {
    var sticky = root.querySelector('[data-blog-article-sidebar-sticky]');
    var main = root.querySelector('.blog-article__main');
    if (!sticky || !main) return;

    var mobile = isMobileToc();
    if (mobile) {
      main.insertBefore(toc, body);
    } else {
      sticky.insertBefore(toc, sticky.firstChild);
    }

    var previousMobileState = toc.getAttribute('data-blog-article-toc-mobile');
    if (mobile) {
      toc.setAttribute('data-blog-article-toc-mobile', 'true');
      if (previousMobileState !== 'true') setTocExpanded(toc, toggle, false);
    } else {
      toc.setAttribute('data-blog-article-toc-mobile', 'false');
      setTocExpanded(toc, toggle, true);
    }
  }

  function removeNewsletterActionHash(form) {
    var action = form.getAttribute('action');
    if (!action || action.indexOf('#') === -1) return;

    form.setAttribute('action', action.split('#')[0]);
  }

  function setNewsletterSubmitting(form, isSubmitting) {
    var submitButton = form.querySelector('button[type="submit"]');

    if (isSubmitting) {
      form.setAttribute('aria-busy', 'true');
      form.setAttribute('data-blog-newsletter-submitting', 'true');
      if (submitButton) submitButton.disabled = true;
      return;
    }

    form.removeAttribute('aria-busy');
    form.removeAttribute('data-blog-newsletter-submitting');
    if (submitButton) submitButton.disabled = false;
  }

  function showNewsletterSuccess(form) {
    var message = document.createElement('p');
    message.className = 'blog-article__form-message note note--success';
    message.setAttribute('data-blog-newsletter-success', '');
    message.setAttribute('role', 'status');
    message.textContent = form.getAttribute('data-success-message') || '';

    form.replaceChildren(message);
    setNewsletterSubmitting(form, false);
  }

  function showNewsletterError(form) {
    var message = document.createElement('p');
    message.className = 'blog-article__form-message errors';
    message.setAttribute('data-blog-newsletter-error', '');
    message.setAttribute('role', 'alert');
    message.textContent = 'Die Anmeldung konnte nicht gesendet werden. Bitte versuche es später erneut.';

    var existingMessage = form.querySelector('[data-blog-newsletter-error]');
    if (existingMessage) {
      existingMessage.replaceWith(message);
    } else {
      form.insertBefore(message, form.firstChild);
    }

    setNewsletterSubmitting(form, false);
  }

  function getNewsletterResponseForm(responseHtml, formId) {
    if (!responseHtml || !formId || !('DOMParser' in window)) return null;

    var responseDocument = new DOMParser().parseFromString(responseHtml, 'text/html');
    return responseDocument.getElementById(formId);
  }

  function hasNewsletterSuccessRedirect(url) {
    if (!url) return false;

    try {
      var responseUrl = new URL(url, window.location.href);
      return responseUrl.searchParams.get('customer_posted') === 'true'
        || responseUrl.searchParams.get('contact_posted') === 'true';
    } catch (error) {
      return false;
    }
  }

  function handleNewsletterSubmit(event) {
    event.preventDefault();

    var form = event.currentTarget;
    if (form.getAttribute('data-blog-newsletter-submitting') === 'true') return;

    var formAction = form.getAttribute('action') || window.location.href;
    var actionUrl;

    try {
      actionUrl = new URL(formAction, window.location.href);
      actionUrl.hash = '';
    } catch (error) {
      actionUrl = formAction.split('#')[0];
    }

    setNewsletterSubmitting(form, true);

    fetch(actionUrl.toString(), {
      method: 'POST',
      body: new FormData(form),
      credentials: 'same-origin',
      headers: {
        Accept: 'text/html',
        'X-Requested-With': 'XMLHttpRequest'
      }
    })
      .then(function(response) {
        return response.text().then(function(responseHtml) {
          return {
            ok: response.ok,
            html: responseHtml,
            url: response.url
          };
        });
      })
      .then(function(result) {
        var responseForm = getNewsletterResponseForm(result.html, form.id);

        if ((responseForm && responseForm.querySelector('[data-blog-newsletter-success]'))
          || (result.ok && hasNewsletterSuccessRedirect(result.url))) {
          showNewsletterSuccess(form);
          return;
        }

        if (responseForm) {
          form.innerHTML = responseForm.innerHTML;
          removeNewsletterActionHash(form);
          setNewsletterSubmitting(form, false);
          return;
        }

        showNewsletterError(form);
      })
      .catch(function() {
        showNewsletterError(form);
      });
  }

  function initNewsletterForm(root) {
    if (!root || root.getAttribute('data-blog-newsletter-ready') === 'true') return;

    var form = root.querySelector('[data-blog-newsletter-form]');
    if (!form) return;

    removeNewsletterActionHash(form);
    form.addEventListener('submit', handleNewsletterSubmit);
    root.setAttribute('data-blog-newsletter-ready', 'true');
  }

  function initTableOfContents(root) {
    if (!root || root.getAttribute('data-blog-article-ready') === 'true') return;

    var blogCenter = root.querySelector('[data-blog-center]');
    var body = root.querySelector('[data-blog-article-body]');
    var toc = root.querySelector('[data-blog-article-toc]');
    var list = root.querySelector('[data-blog-article-toc-list]');
    var toggle = root.querySelector('[data-blog-article-toc-toggle]');
    var intersectionObserver;
    var headings = [];
    var isTocNavigating = false;
    var navigationTimer;

    syncStickyOffset(root, blogCenter);
    root.setAttribute('data-blog-article-ready', 'true');

    function observeHeadings() {
      if (!headings.length || !('IntersectionObserver' in window)) return;

      if (intersectionObserver) intersectionObserver.disconnect();

      intersectionObserver = new IntersectionObserver(function(entries) {
        if (isTocNavigating) return;

        entries.forEach(function(entry) {
          if (entry.isIntersecting) setActiveItem(list, entry.target.id);
        });
      }, {
        rootMargin: '-' + (syncStickyOffset(root, blogCenter) + 32) + 'px 0px -65% 0px',
        threshold: 0
      });

      headings.forEach(function(heading) {
        intersectionObserver.observe(heading);
      });
    }

    function setActiveItemFromScrollPosition() {
      var offset = syncStickyOffset(root, blogCenter) + 32;
      var currentHeading = headings[0];

      headings.forEach(function(heading) {
        if (heading.getBoundingClientRect().top <= offset) currentHeading = heading;
      });

      if (currentHeading) setActiveItem(list, currentHeading.id);
    }

    function finishTocNavigation() {
      if (!isTocNavigating) return;

      isTocNavigating = false;
      window.clearTimeout(navigationTimer);
      setActiveItemFromScrollPosition();
      observeHeadings();
    }

    function queueTocNavigationFinish() {
      if (!isTocNavigating) return;

      window.clearTimeout(navigationTimer);
      navigationTimer = window.setTimeout(finishTocNavigation, 180);
    }

    function beginTocNavigation(targetId, smooth) {
      isTocNavigating = true;
      window.clearTimeout(navigationTimer);
      if (intersectionObserver) intersectionObserver.disconnect();
      setActiveItem(list, targetId);

      if (smooth) {
        navigationTimer = window.setTimeout(finishTocNavigation, 1000);
      } else {
        window.requestAnimationFrame(finishTocNavigation);
      }
    }

    function observeStickyElements() {
      if (!('ResizeObserver' in window)) return;

      var resizeObserver = new ResizeObserver(function() {
        syncStickyOffset(root, blogCenter);
        observeHeadings();
      });
      var headerGroup = document.getElementById('SiteHeaderGroup');

      if (blogCenter) resizeObserver.observe(blogCenter);
      if (headerGroup) resizeObserver.observe(headerGroup);
    }

    if (!body || !toc || !list) {
      observeStickyElements();
      return;
    }

    headings = Array.prototype.slice.call(body.querySelectorAll('h2'));
    if (!headings.length) {
      observeStickyElements();
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
      item.className = 'blog-article__toc-item';

      var link = document.createElement('a');
      link.className = 'blog-article__toc-link';
      link.href = '#' + id;
      link.setAttribute('data-toc-target', id);
      link.textContent = headingText;

      link.addEventListener('click', function(event) {
        event.preventDefault();
        var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        beginTocNavigation(id, !reduceMotion);
        heading.scrollIntoView({
          behavior: reduceMotion ? 'auto' : 'smooth',
          block: 'start'
        });
        window.history.replaceState(null, '', '#' + id);
      });

      item.appendChild(link);
      list.appendChild(item);
    });

    if (toggle) {
      toggle.addEventListener('click', function() {
        if (!isMobileToc()) return;
        setTocExpanded(toc, toggle, !toc.classList.contains('is-open'));
      });
    }

    placeTableOfContents(root, body, toc, toggle);
    toc.hidden = false;
    setActiveItem(list, headings[0].id);

    observeHeadings();
    observeStickyElements();
    window.addEventListener('scroll', queueTocNavigationFinish, { passive: true });
    document.addEventListener('scrollend', finishTocNavigation);
    window.addEventListener('resize', function() {
      syncStickyOffset(root, blogCenter);
      placeTableOfContents(root, body, toc, toggle);
      observeHeadings();
    }, { passive: true });
  }

  function init(scope) {
    if (!scope) return;

    if (scope.matches && scope.matches('[data-blog-article]')) {
      initTableOfContents(scope);
      initNewsletterForm(scope);
      return;
    }

    Array.prototype.forEach.call(scope.querySelectorAll('[data-blog-article]'), function(root) {
      initTableOfContents(root);
      initNewsletterForm(root);
    });
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
