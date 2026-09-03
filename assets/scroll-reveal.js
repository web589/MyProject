/*
 * Lightweight, replayable scroll-reveal animation for Shopify content sections.
 * Existing AOS and custom component animations are deliberately left untouched.
 */
(function() {
  'use strict';

  var MAIN_SELECTOR = '#MainContent';
  var SECTION_SELECTOR = '#MainContent > [id^="shopify-section-"]';
  var EXCLUDED_COMPONENT_SELECTOR = [
    '[data-slideshow]',
    'slideshow-carousel',
    '.flickity-enabled',
    '.swiper',
    '.swiper-container',
    'image-compare',
    '.comparison',
    '.video-parent-section',
    '.video-wrapper',
    '.map-section',
    '[data-product-single]',
    '.product-single',
    '.product-form',
    'product-form',
    '[data-media-gallery]',
    '.product__media',
    '.product-media'
  ].join(',');
  var EXISTING_ANIMATION_SELECTOR = [
    '[data-aos]',
    '.premium-animate',
    '.bs-observe-target',
    '.mg-observe-target',
    '.vs-observe-target',
    '.blog-observe-target'
  ].join(',');
  var TARGET_SELECTOR = [
    '[data-scroll-reveal-item]',
    '.section-header',
    '.section-header__title',
    '.section-header__link',
    '.rte',
    '.feature-row__item',
    '.feature-row__text',
    '.feature-row__images',
    '.text-column',
    '.text-with-icons__item',
    '.faq-section-header',
    '.faq-item',
    '.grid-product',
    '.collection-grid-item',
    '.article-grid-item',
    '.article__grid-image',
    '.article__grid-meta',
    '.grid-product__image-mask',
    '.grid-product__image-wrap',
    '.grid-product__meta',
    '.image-wrap',
    '.collection-image',
    '.promo-grid__content',
    '.promo-grid__bg-image',
    '.background-media-text__text',
    '.background-media-text__image',
    '.testimonial',
    'img',
    'picture',
    'h1',
    'h2',
    'h3',
    'h4',
    'p'
  ].join(',');
  var CONTAINER_SELECTOR = [
    '.section-header',
    '.rte',
    '.feature-row__item',
    '.feature-row__text',
    '.feature-row__images',
    '.text-column',
    '.text-with-icons__item',
    '.faq-section-header',
    '.faq-item',
    '.grid-product',
    '.collection-grid-item',
    '.article-grid-item',
    '.article__grid-image',
    '.article__grid-meta',
    '.grid-product__image-mask',
    '.grid-product__image-wrap',
    '.grid-product__meta',
    '.image-wrap',
    '.promo-grid__content',
    '.promo-grid__bg-image',
    '.background-media-text__text',
    '.background-media-text__image',
    '.testimonial'
  ].join(',');
  var MEDIA_SELECTOR = [
    '.grid-product__image-mask',
    '.grid-product__image-wrap',
    '.image-wrap',
    '.collection-image',
    '.article__grid-image',
    '.promo-grid__bg-image',
    '.background-media-text__image',
    'img',
    'picture'
  ].join(',');
  var initialized = new WeakSet();
  var initializedSections = new WeakSet();
  var observer;
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

  function animationsDisabled() {
    return document.body && (
      document.body.hasAttribute('data-disable-animations') ||
      (reducedMotion && reducedMotion.matches)
    );
  }

  function isCommerceTemplate() {
    return document.body && document.body.classList.contains('template-cart');
  }

  function isHomeTemplate() {
    return document.body && document.body.classList.contains('template-index');
  }

  function isProductTemplate() {
    return document.body && document.body.classList.contains('template-product');
  }

  function isExcludedSection(section) {
    if (!section || section.getAttribute('data-scroll-reveal') === 'off') return true;
    if (isCommerceTemplate()) return true;
    if (section.matches(EXCLUDED_COMPONENT_SELECTOR)) return true;

    return Boolean(section.querySelector(EXCLUDED_COMPONENT_SELECTOR));
  }

  function isExcludedTarget(target, section) {
    if (target === section || target.getAttribute('data-scroll-reveal') === 'off') return true;
    if (target.closest('[data-scroll-reveal="off"]')) return true;
    if (target.matches(EXCLUDED_COMPONENT_SELECTOR)) return true;
    if (target.closest(EXCLUDED_COMPONENT_SELECTOR)) return true;
    if (target.matches(EXISTING_ANIMATION_SELECTOR) || target.closest(EXISTING_ANIMATION_SELECTOR)) return true;
    if (target.closest('[hidden], [aria-hidden="true"]')) return true;

    return false;
  }

  function hasVisibleDimensions(target) {
    var style = window.getComputedStyle(target);
    return style.display !== 'none' && style.visibility !== 'hidden' && target.getClientRects().length > 0;
  }

  function isNestedWithinSelectedContainer(target, selected) {
    return selected.some(function(item) {
      if (item === target || !item.contains(target) || !item.matches(CONTAINER_SELECTOR)) return false;
      if (target.matches(MEDIA_SELECTOR) && item.matches(MEDIA_SELECTOR)) return true;
      return !(target.matches(MEDIA_SELECTOR) && item.querySelector(MEDIA_SELECTOR));
    });
  }

  function shouldSkipContainerTarget(target) {
    if (target.matches('.grid-product, .article-grid-item, .collection-grid-item')) {
      return Boolean(target.querySelector('.grid-product__image-mask, .grid-product__image-wrap, .article__grid-image, .collection-image, .grid-product__meta'));
    }

    if (target.matches('.feature-row__item, .feature-row__text, .feature-row__images, .rte')) {
      return Boolean(target.querySelector('img, picture, .image-wrap, .collection-image'));
    }

    return false;
  }

  function collectTargets(section) {
    var explicitTargets = Array.prototype.slice.call(section.querySelectorAll('[data-scroll-reveal-item]'));
    var candidates = explicitTargets.length ? explicitTargets : Array.prototype.slice.call(section.querySelectorAll(TARGET_SELECTOR));
    var selected = [];

    candidates.forEach(function(target) {
      if (isExcludedTarget(target, section) || !hasVisibleDimensions(target)) return;
      if (!explicitTargets.length && shouldSkipContainerTarget(target)) return;
      if (!explicitTargets.length && isNestedWithinSelectedContainer(target, selected)) return;
      if (selected.indexOf(target) === -1) selected.push(target);
    });

    return selected;
  }

  function registerTarget(target, index) {
    if (initialized.has(target)) return;

    initialized.add(target);
    target.setAttribute('data-scroll-reveal-ready', '');
    target.style.setProperty('--scroll-reveal-delay', (Math.min(index, 6) * 80) + 'ms');

    if (target.matches(MEDIA_SELECTOR)) {
      target.setAttribute('data-scroll-reveal-media', '');
    }

    observer.observe(target);
  }

  function registerSection(section) {
    if (isExcludedSection(section)) return;

    collectTargets(section).forEach(registerTarget);
  }

  function registerHomeSection(section) {
    if (!section || initializedSections.has(section)) return;
    if (section.getAttribute('data-scroll-reveal') === 'off' || isCommerceTemplate()) return;

    initializedSections.add(section);
    section.setAttribute('data-scroll-reveal-section-ready', '');
    observer.observe(section);
  }

  function registerProductSection(section) {
    if (isExcludedSection(section)) return;

    registerHomeSection(section);
  }

  function settleRevealedSection(event) {
    var target = event.target;

    if (event.propertyName !== 'transform' || !target || !target.hasAttribute || !target.hasAttribute('data-scroll-reveal-section-ready')) return;
    if (target.classList.contains('is-scroll-revealed')) {
      target.classList.add('is-scroll-reveal-settled');
    }
  }

  function registerWithin(scope) {
    var sections = [];
    var main = document.querySelector(MAIN_SELECTOR);

    if (!main || animationsDisabled()) return;
    if (scope && scope.matches && scope.matches(SECTION_SELECTOR)) sections.push(scope);
    if (scope && scope.querySelectorAll) {
      sections = sections.concat(Array.prototype.slice.call(scope.querySelectorAll(SECTION_SELECTOR)));
    }
    if (!scope) sections = Array.prototype.slice.call(document.querySelectorAll(SECTION_SELECTOR));

    if (isHomeTemplate()) {
      sections.forEach(registerHomeSection);
    } else if (isProductTemplate()) {
      sections.forEach(registerProductSection);
    } else {
      sections.forEach(registerSection);
    }
  }

  function revealFocusedTarget(event) {
    var target = event.target.closest && event.target.closest('[data-scroll-reveal-ready], [data-scroll-reveal-section-ready]');
    if (target) target.classList.add('is-scroll-revealed');
  }

  function init() {
    if (animationsDisabled() || !('IntersectionObserver' in window)) return;

    observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        entry.target.classList.toggle('is-scroll-revealed', entry.isIntersecting);
        if (!entry.isIntersecting) entry.target.classList.remove('is-scroll-reveal-settled');
      });
    }, {
      threshold: 0.15,
      rootMargin: '0px 0px -10% 0px'
    });

    document.documentElement.classList.add('scroll-reveal-js');
    registerWithin();
    document.addEventListener('focusin', revealFocusedTarget, true);
    document.addEventListener('transitionend', settleRevealedSection, true);

    document.addEventListener('shopify:section:load', function(event) {
      registerWithin(event.target);
    });
    document.addEventListener('shopify:section:reorder', function(event) {
      registerWithin(event.target);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
