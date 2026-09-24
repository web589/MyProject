(function () {
  'use strict';

  function initFaqPage() {
    var root = document.querySelector('.main-content--faq');
    if (!root || root.dataset.faqBehaviorReady === 'true') return;

    var items = Array.prototype.slice.call(root.querySelectorAll('[data-faq-item]'));
    if (!items.length) return;

    root.dataset.faqBehaviorReady = 'true';

    var prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) root.dataset.faqReducedMotion = 'true';

    function getQuestion(item) {
      return item.querySelector('[data-faq-question]');
    }

    function getAnswer(item) {
      return item.querySelector('[data-faq-answer]');
    }

    function setItemState(item, open) {
      var question = getQuestion(item);
      var answer = getAnswer(item);
      if (!question || !answer) return;

      if (open) {
        var openingHeight = answer.scrollHeight;
        item.classList.add('is-open');
        question.classList.add('is-open');
        question.setAttribute('aria-expanded', 'true');
        answer.classList.add('is-open');
        answer.setAttribute('aria-hidden', 'false');
        answer.style.maxHeight = prefersReducedMotion ? 'none' : openingHeight + 'px';
        return;
      }

      var closingHeight = answer.scrollHeight;
      answer.style.maxHeight = prefersReducedMotion ? '0px' : closingHeight + 'px';
      item.classList.remove('is-open');
      question.classList.remove('is-open');
      question.setAttribute('aria-expanded', 'false');
      answer.classList.remove('is-open');
      answer.setAttribute('aria-hidden', 'true');

      if (prefersReducedMotion) {
        answer.style.maxHeight = '0px';
        return;
      }

      window.requestAnimationFrame(function () {
        if (!item.classList.contains('is-open')) answer.style.maxHeight = '0px';
      });
    }

    items.forEach(function (item) {
      var question = getQuestion(item);
      var answer = getAnswer(item);
      if (!question || !answer) return;

      question.setAttribute('aria-expanded', item.classList.contains('is-open') ? 'true' : 'false');
      answer.setAttribute('aria-hidden', item.classList.contains('is-open') ? 'false' : 'true');
      if (!item.classList.contains('is-open')) answer.style.maxHeight = '0px';
    });

    root.addEventListener('click', function (event) {
      var question = event.target.closest('[data-faq-question]');
      if (!question || !root.contains(question)) return;

      var item = question.closest('[data-faq-item]');
      if (!item) return;

      var willOpen = !item.classList.contains('is-open');
      setItemState(item, willOpen);
    });

    window.addEventListener('resize', function () {
      items.forEach(function (item) {
        var answer = getAnswer(item);
        if (answer && item.classList.contains('is-open') && !prefersReducedMotion) {
          answer.style.maxHeight = answer.scrollHeight + 'px';
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFaqPage, { once: true });
  } else {
    initFaqPage();
  }
})();
