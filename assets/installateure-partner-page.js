(function () {
  'use strict';

  var scopeSelector = '.main-content--installateure-partner';
  var formRoots = new WeakSet();
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var requiredKeys = ['company', 'name', 'role', 'email', 'country', 'interest', 'message', 'privacy'];

  function scrollToElement(element, center) {
    if (element) element.scrollIntoView({ behavior: motion.matches ? 'auto' : 'smooth', block: center ? 'center' : 'start' });
  }

  function fieldFor(form, key) {
    return form.querySelector('[data-ip-field="' + key + '"]');
  }

  function resizeMessage(field) {
    if (!field || !field.matches('[data-ip-autogrow]')) return;
    field.style.height = 'auto';
    field.style.height = Math.max(field.scrollHeight, parseFloat(window.getComputedStyle(field).minHeight) || 0) + 'px';
  }

  function resizeMessages(root) {
    root.querySelectorAll('[data-ip-autogrow]').forEach(resizeMessage);
  }

  function focusField(field) {
    var target = field && field.matches('[data-ip-field="interest"]') ? field.querySelector('[data-ip-interest]') : field;
    if (target) target.focus({ preventScroll: true });
    return target;
  }

  function validField(field) {
    if (!field) return false;
    var key = field.getAttribute('data-ip-field');
    if (key === 'interest') return Boolean(field.querySelector('[data-ip-interest]:checked'));
    if (key === 'privacy') return field.checked;
    var value = (field.value || '').trim();
    if (key === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    if (key === 'website') {
      if (value === '') return true;
      try { var address = new URL(value); return address.protocol === 'https:' || address.protocol === 'http:'; } catch (error) { return false; }
    }
    return value !== '';
  }

  function setInvalid(field, invalid) {
    var wrapper = field && field.closest('[data-ip-field-wrap]');
    if (!wrapper) return;
    wrapper.classList.toggle('invalid', invalid);
    field.setAttribute('aria-invalid', invalid ? 'true' : 'false');
    if (field.matches('[data-ip-field="interest"]')) {
      field.querySelectorAll('[data-ip-interest]').forEach(function (input) {
        input.setAttribute('aria-invalid', invalid ? 'true' : 'false');
      });
    }
    var error = wrapper.querySelector('.ip-err-msg');
    if (error) error.textContent = invalid ? wrapper.getAttribute('data-ip-error') || '' : '';
  }

  function storageKey(root) {
    return 'installateure-partner-draft:' + window.location.pathname + ':' + root.id;
  }

  function clearDraft(root) {
    try { window.sessionStorage.removeItem(storageKey(root)); } catch (error) { /* Native submission also works when storage is disabled. */ }
  }

  function saveDraft(root) {
    var values = {};
    root.querySelectorAll('[data-ip-field]').forEach(function (field) {
      var key = field.getAttribute('data-ip-field');
      if (key === 'interest') {
        values.interest = Array.from(field.querySelectorAll('[data-ip-interest]:checked')).map(function (input) { return input.getAttribute('data-ip-interest'); });
      } else {
        values[key] = field.type === 'checkbox' ? field.checked : field.value;
      }
    });
    try { window.sessionStorage.setItem(storageKey(root), JSON.stringify({ time: Date.now(), values: values })); } catch (error) { /* Draft persistence is optional. */ }
  }

  function restoreDraft(root) {
    try {
      var draft = JSON.parse(window.sessionStorage.getItem(storageKey(root)) || 'null');
      if (!draft || !draft.values) return;
      if (Date.now() - draft.time > 30 * 60 * 1000) { clearDraft(root); return; }
      root.querySelectorAll('[data-ip-field]').forEach(function (field) {
        var key = field.getAttribute('data-ip-field');
        var value = draft.values[key];
        if (value === undefined) return;
        if (key === 'interest') {
          if (Array.isArray(value)) field.querySelectorAll('[data-ip-interest]').forEach(function (input) { input.checked = value.indexOf(input.getAttribute('data-ip-interest')) !== -1; });
        } else if (field.type === 'checkbox') {
          field.checked = value === true;
        } else if (typeof value === 'string' && (field.tagName !== 'SELECT' || Array.from(field.options).some(function (option) { return option.value === value; }))) {
          field.value = value;
        }
      });
    } catch (error) { clearDraft(root); }
  }

  function showView(root, view) {
    root.querySelectorAll('[data-ip-view]').forEach(function (element) { element.hidden = element.getAttribute('data-ip-view') !== view; });
    root.setAttribute('data-ip-form-state', view);
  }

  function initializeForm(root) {
    if (formRoots.has(root)) return;
    formRoots.add(root);
    var form = root.querySelector('[data-ip-form]');
    if (!form) return;
    form.noValidate = true;
    var state = root.getAttribute('data-ip-form-state') || 'form';
    if (state === 'success') clearDraft(root);
    else restoreDraft(root);
    showView(root, state);
    resizeMessages(root);
    if (state !== 'form') {
      var status = root.querySelector('[data-ip-view="' + state + '"] [data-ip-status-focus]');
      if (status) status.focus({ preventScroll: true });
      scrollToElement(root.closest('.ip-section'));
    }
  }

  function setFaq(item, open) {
    var button = item.querySelector('[data-ip-faq-question]');
    var answer = item.querySelector('[data-ip-faq-answer]');
    if (!button || !answer) return;
    item.classList.toggle('open', open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    answer.setAttribute('aria-hidden', open ? 'false' : 'true');
    answer.inert = !open;
    answer.style.maxHeight = open ? answer.scrollHeight + 'px' : '0px';
  }

  function openFaq(item, open) {
    var list = item.closest('[data-ip-faq]');
    if (!list) return;
    list.querySelectorAll('[data-ip-faq-item]').forEach(function (other) { setFaq(other, other === item && open); });
  }

  function initialize(container) {
    var page = document.querySelector(scopeSelector);
    if (!page) return;
    var area = container && page.contains(container) ? container : page;
    area.querySelectorAll('[data-ip-form-root]').forEach(initializeForm);
    area.querySelectorAll('[data-ip-faq]').forEach(function (list) { list.setAttribute('data-ip-faq-ready', ''); });
    area.querySelectorAll('[data-ip-faq-item]').forEach(function (item) { setFaq(item, item.classList.contains('open')); });
  }

  function selectCooperation(card) {
    var page = card.closest(scopeSelector);
    var root = page && page.querySelector('[data-ip-form-root]');
    if (!root) return;
    var key = card.getAttribute('data-ip-coop');
    var checkbox = Array.from(root.querySelectorAll('[data-ip-interest]')).find(function (input) { return input.getAttribute('data-ip-interest') === key; });
    if (root.getAttribute('data-ip-form-state') !== 'success') {
      showView(root, 'form');
      if (checkbox) {
        checkbox.checked = true;
        setInvalid(fieldFor(root, 'interest'), false);
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        checkbox.focus({ preventScroll: true });
      }
    }
    scrollToElement(root.closest('.ip-section'));
  }

  document.addEventListener('click', function (event) {
    if (!(event.target instanceof Element) || !event.target.closest(scopeSelector)) return;
    var card = event.target.closest('[data-ip-coop]');
    if (card) { event.preventDefault(); selectCooperation(card); return; }
    var question = event.target.closest('[data-ip-faq-question]');
    if (question) { var item = question.closest('[data-ip-faq-item]'); if (item) openFaq(item, !item.classList.contains('open')); return; }
    var retry = event.target.closest('[data-ip-retry]');
    if (retry) {
      var root = retry.closest('[data-ip-form-root]');
      showView(root, 'form');
      resizeMessages(root);
      focusField(fieldFor(root, 'company'));
      scrollToElement(root.closest('.ip-section'));
    }
  });

  document.addEventListener('keydown', function (event) {
    if (!(event.target instanceof Element)) return;
    var card = event.target.closest(scopeSelector + ' [data-ip-coop]');
    if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectCooperation(card); }
  });

  function fieldChanged(event) {
    if (!(event.target instanceof Element)) return;
    resizeMessage(event.target);
    var wrapper = event.target.closest('[data-ip-field-wrap]');
    if (!wrapper || !wrapper.closest(scopeSelector) || !wrapper.classList.contains('invalid')) return;
    var field = fieldFor(wrapper, wrapper.getAttribute('data-ip-field-wrap'));
    if (!field && wrapper.matches('[data-ip-field]')) field = wrapper;
    if (field) setInvalid(field, !validField(field));
  }
  document.addEventListener('input', fieldChanged);
  document.addEventListener('change', fieldChanged);

  // Validate before Shopify's native CAPTCHA handlers; valid submissions retain the native POST.
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches(scopeSelector + ' [data-ip-form]')) return;
    var firstBad = null;
    Array.from(form.querySelectorAll('[data-ip-field]')).filter(function (field) {
      var key = field.getAttribute('data-ip-field');
      return requiredKeys.indexOf(key) !== -1 || key === 'website';
    }).forEach(function (field) {
      var invalid = !validField(field);
      setInvalid(field, invalid);
      if (invalid && !firstBad) firstBad = field;
    });
    if (!firstBad && requiredKeys.some(function (key) { return !fieldFor(form, key); })) firstBad = form;
    if (firstBad) {
      event.preventDefault();
      event.stopImmediatePropagation();
      var focus = focusField(firstBad);
      scrollToElement(focus || firstBad, true);
      return;
    }
    saveDraft(form.closest('[data-ip-form-root]'));
    // Success is rendered only when Liquid form.posted_successfully? confirms the response.
  }, true);

  document.addEventListener('shopify:section:load', function (event) { initialize(event.target); });
  document.addEventListener('shopify:block:select', function (event) {
    if (!(event.target instanceof Element) || !event.target.closest(scopeSelector)) return;
    var item = event.target.closest('[data-ip-faq-item]');
    if (item) openFaq(item, true);
  });
  window.addEventListener('resize', function () {
    document.querySelectorAll(scopeSelector + ' [data-ip-autogrow]').forEach(resizeMessage);
    document.querySelectorAll(scopeSelector + ' [data-ip-faq-item].open').forEach(function (item) { setFaq(item, true); });
  });
  window.addEventListener('pageshow', function (event) { if (event.persisted) initialize(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { initialize(); });
  else initialize();
})();
