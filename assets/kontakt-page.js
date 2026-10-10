(function () {
  'use strict';

  var scopeSelector = '.main-content--kontakt';
  var formRoots = new WeakSet();
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function scrollToElement(element, center) {
    if (element) element.scrollIntoView({ behavior: motion.matches ? 'auto' : 'smooth', block: center ? 'center' : 'start' });
  }

  function formRoot() {
    return document.querySelector(scopeSelector + ' [data-kt-form-root]');
  }

  function setInvalid(field, invalid) {
    var wrapper = field.closest('[data-kt-field-wrap]');
    if (!wrapper) return;
    wrapper.classList.toggle('invalid', invalid);
    field.setAttribute('aria-invalid', invalid ? 'true' : 'false');
    var error = wrapper.querySelector('.kt-err-msg');
    if (error) {
      error.textContent = invalid ? wrapper.getAttribute('data-kt-error') || '' : '';
      error.setAttribute('aria-live', 'polite');
    }
  }

  function validField(field) {
    var key = field.getAttribute('data-kt-field');
    var value = field.value.trim();
    if (key === 'privacy') return field.checked;
    if (key === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    return value !== '';
  }

  function updateConditions(root) {
    var topic = root.querySelector('[data-kt-field="topic"]');
    var selected = topic ? topic.value : '';
    root.querySelectorAll('[data-kt-condition]').forEach(function (wrapper) {
      var condition = wrapper.getAttribute('data-kt-condition');
      var visible = selected === 'rueckgabe' || (condition === 'order' && selected === 'bestellung') || (condition === 'serial' && selected === 'installation');
      wrapper.hidden = !visible;
      wrapper.querySelectorAll('input, select, textarea').forEach(function (field) {
        field.disabled = !visible;
        if (!visible) setInvalid(field, false);
      });
    });
  }

  function storageKey(root) {
    return 'kontakt-draft:' + window.location.pathname + ':' + root.closest('.kt-section').id;
  }

  function saveDraft(root) {
    var values = {};
    root.querySelectorAll('[data-kt-field]').forEach(function (field) {
      values[field.getAttribute('data-kt-field')] = field.type === 'checkbox' ? field.checked : field.value;
    });
    try { window.sessionStorage.setItem(storageKey(root), JSON.stringify({ time: Date.now(), values: values })); } catch (error) { /* Form submission works when storage is unavailable. */ }
  }

  function clearDraft(root) {
    try { window.sessionStorage.removeItem(storageKey(root)); } catch (error) { /* Storage can be disabled by the browser. */ }
  }

  function restoreDraft(root) {
    try {
      var draft = JSON.parse(window.sessionStorage.getItem(storageKey(root)) || 'null');
      if (!draft || !draft.values) return;
      if (Date.now() - draft.time > 30 * 60 * 1000) { clearDraft(root); return; }
      root.querySelectorAll('[data-kt-field]').forEach(function (field) {
        var value = draft.values[field.getAttribute('data-kt-field')];
        if (value === undefined) return;
        if (field.type === 'checkbox') field.checked = value === true;
        else if (field.tagName !== 'SELECT' || Array.from(field.options).some(function (option) { return option.value === value; })) field.value = value;
      });
    } catch (error) { clearDraft(root); }
  }

  function showView(root, view) {
    root.querySelectorAll('[data-kt-view]').forEach(function (element) {
      element.hidden = element.getAttribute('data-kt-view') !== view;
    });
    root.setAttribute('data-kt-form-state', view);
  }

  function initializeForm(root) {
    if (formRoots.has(root)) return;
    formRoots.add(root);
    var form = root.querySelector('[data-kt-form]');
    if (!form) return;
    form.noValidate = true;
    var state = root.getAttribute('data-kt-form-state') || 'form';
    var successView = root.querySelector('[data-kt-view="success"]');
    var errorView = root.querySelector('[data-kt-view="error"]');
    if (successView && !successView.hidden) state = 'success';
    else if (errorView && !errorView.hidden) state = 'error';
    if (state === 'success') clearDraft(root);
    else restoreDraft(root);
    updateConditions(root);
    showView(root, state);
    if (state !== 'form') {
      var status = root.querySelector('[data-kt-view="' + state + '"] [data-kt-status-focus]');
      if (status) status.focus({ preventScroll: true });
      scrollToElement(root.closest('.kt-section'));
    }
  }

  function setFaq(item, open) {
    var button = item.querySelector('[data-kt-faq-question]');
    var answer = item.querySelector('[data-kt-faq-answer]');
    if (!button || !answer) return;
    item.classList.toggle('open', open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    answer.setAttribute('aria-hidden', open ? 'false' : 'true');
    answer.inert = !open;
    answer.style.maxHeight = open ? answer.scrollHeight + 'px' : '0px';
  }

  function initialize(container) {
    var page = document.querySelector(scopeSelector);
    if (!page) return;
    var area = container && page.contains(container) ? container : page;
    area.querySelectorAll('[data-kt-form-root]').forEach(initializeForm);
    area.querySelectorAll('[data-kt-faq]').forEach(function (faq) { faq.setAttribute('data-kt-ready', ''); });
    area.querySelectorAll('[data-kt-faq-item]').forEach(function (item) { setFaq(item, item.classList.contains('open')); });
  }

  function selectTopic(card) {
    var root = formRoot();
    if (!root || root.getAttribute('data-kt-form-state') === 'success') return;
    var field = root.querySelector('[data-kt-field="topic"]');
    if (!field) return;
    field.value = card.getAttribute('data-kt-topic');
    setInvalid(field, false);
    updateConditions(root);
    showView(root, 'form');
    scrollToElement(root.closest('.kt-section'));
  }

  document.addEventListener('click', function (event) {
    if (!(event.target instanceof Element)) return;
    var page = event.target.closest(scopeSelector);
    if (!page) return;
    var card = event.target.closest('[data-kt-topic]');
    if (card) { selectTopic(card); return; }
    var question = event.target.closest('[data-kt-faq-question]');
    if (question) {
      var item = question.closest('[data-kt-faq-item]');
      var open = !item.classList.contains('open');
      item.closest('[data-kt-faq]').querySelectorAll('[data-kt-faq-item]').forEach(function (other) { setFaq(other, other === item && open); });
      return;
    }
    var retry = event.target.closest('[data-kt-retry]');
    if (retry) {
      var root = retry.closest('[data-kt-form-root]');
      showView(root, 'form');
      updateConditions(root);
      var first = root.querySelector('[data-kt-field="topic"]');
      if (first) first.focus({ preventScroll: true });
      scrollToElement(root.closest('.kt-section'));
      return;
    }
    var anchor = event.target.closest('a[href="#kontaktformular"]');
    if (anchor && formRoot()) { event.preventDefault(); scrollToElement(formRoot().closest('.kt-section')); }
  });

  document.addEventListener('keydown', function (event) {
    if (!(event.target instanceof Element)) return;
    var card = event.target.closest(scopeSelector + ' [data-kt-topic]');
    if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectTopic(card); }
  });

  function fieldChanged(event) {
    if (!(event.target instanceof Element)) return;
    var field = event.target.closest('[data-kt-field]');
    if (!field || !field.closest(scopeSelector)) return;
    if (field.getAttribute('data-kt-field') === 'topic') updateConditions(field.closest('[data-kt-form-root]'));
    var wrapper = field.closest('[data-kt-field-wrap]');
    if (wrapper && wrapper.classList.contains('invalid')) setInvalid(field, !validField(field));
  }
  document.addEventListener('input', fieldChanged);
  document.addEventListener('change', fieldChanged);

  // Capture validation before Shopify's native CAPTCHA submission handlers.
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches(scopeSelector + ' [data-kt-form]')) return;
    var firstBad = null;
    ['topic', 'name', 'email', 'message', 'privacy'].forEach(function (key) {
      var field = form.querySelector('[data-kt-field="' + key + '"]');
      if (!field) return;
      var invalid = !validField(field);
      setInvalid(field, invalid);
      if (invalid && !firstBad) firstBad = field;
    });
    if (firstBad) {
      event.preventDefault();
      event.stopImmediatePropagation();
      firstBad.focus({ preventScroll: true });
      scrollToElement(firstBad, true);
    } else {
      var root = form.closest('[data-kt-form-root]');
      updateConditions(root);
      saveDraft(root);
      // Do not prevent a valid native POST or fabricate a success state.
    }
  }, true);

  document.addEventListener('shopify:section:load', function (event) { initialize(event.target); });
  document.addEventListener('shopify:block:select', function (event) {
    if (!(event.target instanceof Element) || !event.target.closest(scopeSelector)) return;
    var item = event.target.closest('[data-kt-faq-item]');
    if (item) {
      item.closest('[data-kt-faq]').querySelectorAll('[data-kt-faq-item]').forEach(function (other) { setFaq(other, other === item); });
    }
  });
  window.addEventListener('resize', function () {
    document.querySelectorAll(scopeSelector + ' [data-kt-faq-item].open').forEach(function (item) { setFaq(item, true); });
  });
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) document.querySelectorAll(scopeSelector + ' [data-kt-form-root]').forEach(function (root) { updateConditions(root); });
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { initialize(); });
  else initialize();
})();
