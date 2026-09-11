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

    headings = Array.prototype.slice.call(body.querySelectorAll('h2'));
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
      item.className = 'blog-article__toc-item';

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
