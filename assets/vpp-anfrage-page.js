(function () {
  'use strict';

  var boundFormRoots = new WeakSet();

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

  function markFormQuestionLabels(shadowRoot) {
    var questionTexts = [
      'Welches VENUS E Modell nutzt du oder planst du zu nutzen?',
      'Land',
      'Welche Komponenten sind bereits vorhanden?'
    ];
    var candidates = shadowRoot.querySelectorAll('legend, label, p, span');

    questionTexts.forEach(function (questionText) {
      Array.prototype.forEach.call(candidates, function (element) {
        if (normalizedText(element) === questionText) {
          element.classList.add('vpp-anfrage__form-question');
        }
      });
    });

    return questionTexts.every(function (questionText) {
      return Array.prototype.some.call(candidates, function (element) {
        return normalizedText(element) === questionText && element.classList.contains('vpp-anfrage__form-question');
      });
    });
  }

  function installFormQuestionStyles(shadowRoot) {
    if (shadowRoot.querySelector('style[data-vpp-anfrage-question-style]')) return;

    var style = document.createElement('style');
    style.setAttribute('data-vpp-anfrage-question-style', '');
    style.textContent = [
      '.vpp-anfrage__form-question {',
      '  font-size: calc(var(--vpp-anfrage-item-text-size, 14px) + 1px) !important;',
      '  font-weight: 600 !important;',
      '  line-height: 1.5;',
      '}'
    ].join('\n');
    shadowRoot.appendChild(style);
  }

  function installationCheckboxGroup(shadowRoot) {
    var checkboxes = Array.prototype.slice.call(shadowRoot.querySelectorAll('input[type="checkbox"]'));
    var noInstallation = checkboxes.find(function (checkbox) {
      var labelText = checkbox.labels ? Array.prototype.map.call(checkbox.labels, normalizedText).join(' ') : '';
      return /noch keine installation/i.test(labelText || checkbox.id || checkbox.getAttribute('aria-label') || '');
    });

    if (!noInstallation) return null;

    var separator = noInstallation.id.lastIndexOf('-');
    var groupPrefix = separator > -1 ? noInstallation.id.slice(0, separator + 1) : '';
    var groupCheckboxes = checkboxes.filter(function (checkbox) {
      if (checkbox === noInstallation) return true;
      if (noInstallation.name && checkbox.name === noInstallation.name) return true;
      return Boolean(groupPrefix && checkbox.id.indexOf(groupPrefix) === 0);
    });

    return {
      noInstallation: noInstallation,
      others: groupCheckboxes.filter(function (checkbox) {
        return checkbox !== noInstallation;
      })
    };
  }

  function bindShopifyFormsEmbed(formEmbed) {
    var shadowRoot = formEmbed && formEmbed.shadowRoot;
    if (!shadowRoot || boundFormRoots.has(shadowRoot)) return;

    boundFormRoots.add(shadowRoot);
    installFormQuestionStyles(shadowRoot);
    markFormQuestionLabels(shadowRoot);

    shadowRoot.addEventListener('change', function (event) {
      var changedCheckbox = event.target;
      if (!changedCheckbox || changedCheckbox.type !== 'checkbox' || !changedCheckbox.checked) return;

      var group = installationCheckboxGroup(shadowRoot);
      if (!group) return;

      var peers = changedCheckbox === group.noInstallation ? group.others :
        (group.others.indexOf(changedCheckbox) > -1 ? [group.noInstallation] : []);

      peers.forEach(function (checkbox) {
        if (checkbox.checked) checkbox.click();
      });
    });

    if (window.MutationObserver) {
      var observer = new MutationObserver(function () {
        markFormQuestionLabels(shadowRoot);
      });
      observer.observe(shadowRoot, { childList: true, characterData: true, subtree: true });
    }
  }

  function bindFormHost(host) {
    if (!host || host.dataset.vppAnfrageFormBound === 'true') return;
    host.dataset.vppAnfrageFormBound = 'true';

    function discoverFormsEmbed() {
      host.querySelectorAll('shopify-forms-embed').forEach(bindShopifyFormsEmbed);
    }

    discoverFormsEmbed();

    if (window.MutationObserver) {
      var observer = new MutationObserver(discoverFormsEmbed);
      observer.observe(host, { childList: true, subtree: true });
    }

    if (window.customElements && window.customElements.whenDefined) {
      window.customElements.whenDefined('shopify-forms-embed').then(discoverFormsEmbed);
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
