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

  function normalizedText(element) {
    return (element.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function markFormQuestionLabels(host) {
    var questionTexts = [
      'Welches VENUS E Modell nutzt du oder planst du zu nutzen?',
      'Land',
      'Welche Komponenten sind bereits vorhanden?'
    ];
    var candidates = host.querySelectorAll('p, legend, label, span, div');

    questionTexts.forEach(function (questionText) {
      Array.prototype.forEach.call(candidates, function (element) {
        if (normalizedText(element) === questionText) {
          element.classList.add('vpp-anfrage__form-question');
        }
      });
    });

    return questionTexts.every(function (questionText) {
      return host.querySelector('.vpp-anfrage__form-question') &&
        Array.prototype.some.call(candidates, function (element) {
          return normalizedText(element) === questionText && element.classList.contains('vpp-anfrage__form-question');
        });
    });
  }

  function installationCheckboxGroup(host) {
    var checkboxes = Array.prototype.slice.call(host.querySelectorAll('input[type="checkbox"]'));
    var noInstallation = checkboxes.find(function (checkbox) {
      var labelText = checkbox.labels ? Array.prototype.map.call(checkbox.labels, normalizedText).join(' ') : '';
      return /noch keine installation/i.test(labelText || checkbox.id || checkbox.getAttribute('aria-label') || '');
    });

    if (!noInstallation) return null;

    var separator = noInstallation.id.lastIndexOf('-');
    var groupPrefix = separator > -1 ? noInstallation.id.slice(0, separator + 1) : '';
    var groupCheckboxes = checkboxes.filter(function (checkbox) {
      if (checkbox === noInstallation) return true;
      if (groupPrefix && checkbox.id.indexOf(groupPrefix) === 0) return true;
      return Boolean(noInstallation.name && checkbox.name === noInstallation.name);
    });

    return {
      noInstallation: noInstallation,
      others: groupCheckboxes.filter(function (checkbox) {
        return checkbox !== noInstallation;
      })
    };
  }

  function bindFormHost(host) {
    if (!host || host.dataset.vppAnfrageFormBound === 'true') return;
    host.dataset.vppAnfrageFormBound = 'true';

    host.addEventListener('change', function (event) {
      var changedCheckbox = event.target;
      if (!changedCheckbox || changedCheckbox.type !== 'checkbox' || !changedCheckbox.checked) return;

      var group = installationCheckboxGroup(host);
      if (!group) return;

      var peers = changedCheckbox === group.noInstallation ? group.others :
        (group.others.indexOf(changedCheckbox) > -1 ? [group.noInstallation] : []);

      peers.forEach(function (checkbox) {
        if (checkbox.checked) checkbox.click();
      });
    });

    if (!markFormQuestionLabels(host) && window.MutationObserver) {
      var observer = new MutationObserver(function () {
        if (markFormQuestionLabels(host)) observer.disconnect();
      });
      observer.observe(host, { childList: true, characterData: true, subtree: true });
    }
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
      page.querySelectorAll('[data-vpp-anfrage-form-host]').forEach(bindFormHost);
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
