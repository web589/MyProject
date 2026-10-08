(() => {
  'use strict';

  const page = document.querySelector('.main-content--acdc');
  if (!page) return;
  if (window.Shopify && window.Shopify.designMode) page.classList.add('acdc-design-mode');

  const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setFaqItem(item, open) {
    const button = item.querySelector('.acdc-faq-q');
    const answer = item.querySelector('.acdc-faq-a');
    if (!button || !answer) return;

    item.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
    answer.setAttribute('aria-hidden', String(!open));
    answer.inert = !open;
    answer.style.maxHeight = open ? `${answer.scrollHeight}px` : '0px';
  }

  function initFaq(scope) {
    scope.querySelectorAll('[data-acdc-faq]').forEach((faq) => {
      faq.querySelectorAll('.acdc-faq-item').forEach((item) => {
        setFaqItem(item, item.classList.contains('is-open'));
      });
    });
  }

  function updateCarousel(carousel) {
    const track = carousel.querySelector('.acdc-carousel-track');
    const prev = carousel.querySelector('.acdc-carousel-prev, [data-acdc-dir="prev"]');
    const next = carousel.querySelector('.acdc-carousel-next, [data-acdc-dir="next"]');
    if (!track || !prev || !next) return;

    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
    const atStart = track.scrollLeft <= 2;
    const atEnd = track.scrollLeft >= maxScroll - 2;
    prev.hidden = atStart;
    next.hidden = atEnd;
    prev.setAttribute('aria-hidden', String(atStart));
    next.setAttribute('aria-hidden', String(atEnd));
  }

  function initCarousels(scope) {
    scope.querySelectorAll('[data-acdc-carousel]').forEach(updateCarousel);
  }

  page.addEventListener('click', (event) => {
    const faqButton = event.target.closest('.acdc-faq-q');
    if (faqButton && page.contains(faqButton)) {
      const item = faqButton.closest('.acdc-faq-item');
      const faq = faqButton.closest('[data-acdc-faq]');
      if (!item || !faq) return;
      const shouldOpen = !item.classList.contains('is-open');
      faq.querySelectorAll('.acdc-faq-item').forEach((entry) => setFaqItem(entry, false));
      if (shouldOpen) setFaqItem(item, true);
      return;
    }

    const arrow = event.target.closest('.acdc-carousel-btn');
    if (!arrow || !page.contains(arrow)) return;
    const carousel = arrow.closest('[data-acdc-carousel]');
    const track = carousel && carousel.querySelector('.acdc-carousel-track');
    const card = track && track.querySelector('.acdc-art');
    if (!track || !card) return;
    const gap = parseFloat(window.getComputedStyle(track).columnGap) || 0;
    const direction = arrow.matches('.acdc-carousel-prev, [data-acdc-dir="prev"]') ? -1 : 1;
    track.scrollBy({ left: direction * (card.getBoundingClientRect().width + gap), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  });

  page.addEventListener('scroll', (event) => {
    const track = event.target;
    if (track instanceof Element && track.matches('.acdc-carousel-track')) {
      const carousel = track.closest('[data-acdc-carousel]');
      if (carousel) updateCarousel(carousel);
    }
  }, true);

  window.addEventListener('resize', () => {
    initCarousels(page);
    page.querySelectorAll('.acdc-faq-item.is-open .acdc-faq-a').forEach((answer) => {
      answer.style.maxHeight = `${answer.scrollHeight}px`;
    });
  });

  document.addEventListener('shopify:section:load', (event) => {
    if (page.contains(event.target)) {
      initFaq(event.target);
      initCarousels(event.target);
    }
  });

  document.addEventListener('shopify:block:select', (event) => {
    const item = event.target.closest('.acdc-faq-item');
    if (item && page.contains(item)) {
      const faq = item.closest('[data-acdc-faq]');
      faq.querySelectorAll('.acdc-faq-item').forEach((entry) => setFaqItem(entry, entry === item));
    }
  });

  initFaq(page);
  initCarousels(page);
})();
