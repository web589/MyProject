(function () {
  'use strict';

  function reducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function bindFaqList(list) {
    if (!list || list.dataset.vppAnfrageFaqBound === 'true') return;
    list.dataset.vppAnfrageFaqBound = 'true';

    var questions = Array.prototype.slice.call(list.querySelectorAll('[data-vpp-anfrage-faq-question]'));

    function answerFor(question) {
      var answerId = question.getAttribute('aria-controls');
      return answerId ? document.getElementById(answerId) : null;
    }

    function close(question) {
      var answer = answerFor(question);
      question.setAttribute('aria-expanded', 'false');

      var symbol = question.querySelector('span:last-child');
      if (symbol) symbol.textContent = '+';
      if (!answer) return;

      answer.classList.remove('is-open');
      answer.setAttribute('aria-hidden', 'true');
      answer.style.maxHeight = '0px';

      if (answer._vppAnfrageHideTimer) window.clearTimeout(answer._vppAnfrageHideTimer);
      answer._vppAnfrageHideTimer = window.setTimeout(function () {
        if (!answer.classList.contains('is-open')) answer.hidden = true;
      }, reducedMotion() ? 0 : 340);
    }

    function open(question) {
      var answer = answerFor(question);
      if (!answer) return;

      if (answer._vppAnfrageHideTimer) window.clearTimeout(answer._vppAnfrageHideTimer);
      question.setAttribute('aria-expanded', 'true');

      var symbol = question.querySelector('span:last-child');
      if (symbol) symbol.textContent = '−';

      answer.hidden = false;
      answer.classList.add('is-open');
      answer.setAttribute('aria-hidden', 'false');
      answer.style.maxHeight = '0px';

      var schedule = window.requestAnimationFrame || function (callback) {
        window.setTimeout(callback, 0);
      };

      schedule(function () {
        if (question.getAttribute('aria-expanded') === 'true') {
          answer.style.maxHeight = answer.scrollHeight + 'px';
        }
      });
    }

    questions.forEach(function (question) {
      var answer = answerFor(question);
      question.setAttribute('aria-expanded', 'false');
      if (answer) {
        answer.hidden = true;
        answer.classList.remove('is-open');
        answer.setAttribute('aria-hidden', 'true');
        answer.style.maxHeight = '0px';
      }

      question.addEventListener('click', function () {
        var shouldOpen = question.getAttribute('aria-expanded') !== 'true';
        questions.forEach(close);
        if (shouldOpen) open(question);
      });
    });

    window.addEventListener('resize', function () {
      questions.forEach(function (question) {
        if (question.getAttribute('aria-expanded') !== 'true') return;
        var answer = answerFor(question);
        if (answer) answer.style.maxHeight = answer.scrollHeight + 'px';
      });
    });
  }

  function init(root) {
    var scope = root || document;
    var pages = [];

    if (scope.matches && scope.matches('[data-vpp-anfrage-page]')) pages.push(scope);
    if (scope.querySelectorAll) {
      pages = pages.concat(Array.prototype.slice.call(scope.querySelectorAll('[data-vpp-anfrage-page]')));
    }

    pages.forEach(function (page) {
      page.querySelectorAll('[data-vpp-anfrage-faq-list]').forEach(bindFaqList);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init(document);
    });
  } else {
    init(document);
  }

  document.addEventListener('shopify:section:load', function (event) {
    init(event.target);
  });
}());
