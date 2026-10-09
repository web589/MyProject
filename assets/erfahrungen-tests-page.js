(() => {
  'use strict';

  const root = document.querySelector('.main-content--erfahrungen-tests');
  if (!root || root.dataset.etInitialized === 'true') return;
  root.dataset.etInitialized = 'true';

  const designMode = Boolean(window.Shopify && window.Shopify.designMode);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let resizeFrame = 0;

  if (designMode) root.classList.add('et-design-mode');

  function setOpen(item, open) {
    const button = item.querySelector('.et-faq-q');
    const answer = item.querySelector('.et-faq-a');
    if (!button || !answer) return;
    item.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
    answer.setAttribute('aria-hidden', String(!open));
    answer.inert = !open;
    answer.style.maxHeight = open ? `${answer.scrollHeight}px` : '0px';
  }

  function openItem(item, open) {
    root.querySelectorAll('.et-faq-item.is-open').forEach((other) => {
      if (other !== item) setOpen(other, false);
    });
    setOpen(item, open);
  }

  function bindFaq(scope) {
    scope.querySelectorAll('.et-faq-item').forEach((item) => {
      if (item.dataset.etFaqInitialized === 'true') return;
      item.dataset.etFaqInitialized = 'true';
      setOpen(item, item.classList.contains('is-open'));
    });
    root.classList.add('et-faq-ready');
  }

  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('.et-faq-q');
    if (button && root.contains(button)) {
      const item = button.closest('.et-faq-item');
      if (item) openItem(item, !item.classList.contains('is-open'));
      return;
    }

    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href^="#"]');
    if (!link || !root.contains(link) || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const hash = link.getAttribute('href');
    if (!hash || hash.length < 2) return;
    let id;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch (_) {
      return;
    }
    const target = document.getElementById(id);
    if (!target || !root.contains(target)) return;
    event.preventDefault();
    const offset = parseFloat(getComputedStyle(target).scrollMarginTop) || 110;
    window.scrollTo({
      top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - offset),
      behavior: reducedMotion.matches ? 'auto' : 'smooth'
    });
    // Move keyboard focus without undoing the offset scroll.
    if (!target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '-1');
      target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
    }
    target.focus({ preventScroll: true });
    if (!designMode && window.location.hash !== hash) {
      window.history.pushState(null, '', hash);
    }
  });

  window.addEventListener('resize', () => {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      root.querySelectorAll('.et-faq-item.is-open').forEach((item) => setOpen(item, true));
      resizeFrame = 0;
    });
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      root.querySelectorAll('.et-faq-item.is-open').forEach((item) => setOpen(item, true));
    });
  }

  if (designMode) {
    document.addEventListener('shopify:section:load', (event) => {
      if (event.target instanceof Element && root.contains(event.target)) bindFaq(event.target);
    });
    document.addEventListener('shopify:block:select', (event) => {
      if (!(event.target instanceof Element) || !root.contains(event.target)) return;
      const item = event.target.closest('.et-faq-item');
      if (item) openItem(item, true);
    });
  }

  bindFaq(root);
})();
