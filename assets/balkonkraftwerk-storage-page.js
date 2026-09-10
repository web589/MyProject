(function () {
  'use strict';

  var STORAGE_KEY = 'venusBalkonStorageRecommendation:v1';
  var tierValues = { '5.12': 5.12, '10.24': 10.24, '15.36': 15.36, '30': 30 };

  function formatNumber(value) {
    return new Intl.NumberFormat('de-DE').format(Number(value));
  }

  function formatCapacity(value) {
    var number = Number(value);
    return (number % 1 ? number.toFixed(2) : number.toFixed(0)).replace('.', ',') + ' kWh';
  }

  function parseCapacity(title) {
    var match = String(title || '').match(/(\d+(?:[,.]\d+)?)\s*kWh/i);
    return match ? parseFloat(match[1].replace(',', '.')) : null;
  }

  function getRootUrl() {
    return window.Shopify && window.Shopify.routes && window.Shopify.routes.root ? window.Shopify.routes.root : '/';
  }

  function readProductData(root) {
    var node = root.querySelector('[data-bw-product-data]');
    if (!node) return {};
    try { return JSON.parse(node.textContent); } catch (error) { return {}; }
  }

  function findVariant(product, capacity) {
    if (!product || !Array.isArray(product.variants)) return null;
    var matches = product.variants.filter(function (variant) {
      var parsed = parseCapacity(variant.title);
      return parsed !== null && Math.abs(parsed - capacity) < 0.08;
    });
    return matches.find(function (variant) { return variant.available; }) || matches[0] || null;
  }

  function getTier(people, pv, annual) {
    var peopleTier = people <= 1 ? 5.12 : people <= 2 ? 10.24 : people <= 4 ? 15.36 : 30;
    var pvTier = pv <= 2 ? 5.12 : pv <= 5 ? 10.24 : pv <= 8 ? 15.36 : 30;
    var annualTier = annual <= 2500 ? 5.12 : annual <= 4500 ? 10.24 : annual <= 6500 ? 15.36 : 30;
    return Math.max(peopleTier, pvTier, annualTier).toFixed(2).replace(/\.00$/, '');
  }

  function valuesForTier(tier) {
    if (tier === '5.12') return { people: 1, pv: 2, annual: 2500 };
    if (tier === '10.24') return { people: 2, pv: 4, annual: 4000 };
    if (tier === '30') return { people: 6, pv: 10, annual: 8000 };
    return { people: 3, pv: 6, annual: 4000 };
  }

  function scrollToTarget(target) {
    var element = document.querySelector(target);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init(root) {
    if (root.dataset.bwInitialized === 'true') return;
    root.dataset.bwInitialized = 'true';
    var products = readProductData(root);
    var inputs = {
      people: root.querySelector('[data-bw-input="people"]'),
      pv: root.querySelector('[data-bw-input="pv"]'),
      annual: root.querySelector('[data-bw-input="annual"]')
    };
    var outputs = {
      people: root.querySelector('[data-bw-output="people"]'),
      pv: root.querySelector('[data-bw-output="pv"]'),
      annual: root.querySelector('[data-bw-output="annual"]')
    };
    var state = { people: 3, pv: 6, annual: 4000, tier: '15.36', hasCalculated: false };
    var stored;
    try { stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || 'null'); } catch (error) { stored = null; }
    if (stored && stored.people && stored.pv !== undefined && stored.annual) {
      state = Object.assign(state, stored);
      Object.keys(inputs).forEach(function (key) { if (inputs[key]) inputs[key].value = state[key]; });
    }

    function save() {
      try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (error) { /* storage can be blocked */ }
    }

    function recommendation() {
      var tier = state.tier;
      if (tier === '5.12') return { key: 'venus3', capacity: 5.12, title: '1× VENUS E 3.0', variant: findVariant(products.venus3, 5.12) };
      if (tier === '10.24') return { key: 'venus3', capacity: 10.24, title: '2× VENUS E 3.0', variant: findVariant(products.venus3, 10.24) };
      if (tier === '30') return { key: 'max', capacity: 30, title: '3× VENUS E Max', variant: findVariant(products.max, 30) };
      return { key: 'venus3', capacity: 15.36, title: '3× VENUS E 3.0', variant: findVariant(products.venus3, 15.36) };
    }

    function alternative(key) {
      if (key === 'alt4') {
        var cap4 = state.tier === '5.12' ? 5 : state.tier === '10.24' ? 10 : 15;
        return { product: products.venus4, capacity: cap4, title: (cap4 === 5 ? '1×' : cap4 === 10 ? '2×' : '3×') + ' VENUS E 4.0', variant: findVariant(products.venus4, cap4) };
      }
      var capMax = state.tier === '5.12' ? 10 : state.tier === '10.24' ? 20 : 30;
      return { product: products.max, capacity: capMax, title: (capMax === 10 ? '1×' : capMax === 20 ? '2×' : '3×') + ' VENUS E Max', variant: findVariant(products.max, capMax) };
    }

    function setAction(action, item, direct, label) {
      if (!action || !item) return;
      action.textContent = label;
      action.dataset.variantId = item.variant && item.variant.id ? item.variant.id : '';
      action.dataset.productUrl = (item.product && item.product.url) || '';
      action.dataset.directAdd = direct && !!(item.variant && item.variant.available) ? 'true' : 'false';
      if (action.tagName === 'A' && item.product && item.product.url) action.href = item.product.url;
    }

    function render() {
      var tier = state.tier;
      var capacityText = formatCapacity(tierValues[tier]);
      var outputCapacity = root.querySelector('[data-bw-capacity]');
      var inlineCapacity = root.querySelector('[data-bw-capacity-inline]');
      var summary = root.querySelector('[data-bw-summary]');
      if (outputCapacity) outputCapacity.textContent = capacityText;
      if (inlineCapacity) inlineCapacity.textContent = capacityText;
      if (outputs.people) outputs.people.textContent = state.people + (Number(state.people) >= 6 ? '+ Personen' : ' Personen');
      if (outputs.pv) outputs.pv.textContent = String(state.pv).replace('.', ',') + ' kWp';
      if (outputs.annual) outputs.annual.textContent = formatNumber(state.annual) + ' kWh/Jahr';
      if (summary) summary.textContent = state.people + (Number(state.people) >= 6 ? '+ Personen' : ' Personen') + ' · ' + String(state.pv).replace('.', ',') + ' kWp · ' + formatNumber(state.annual) + ' kWh/Jahr';
      root.querySelectorAll('[data-bw-preset]').forEach(function (button) { button.classList.toggle('is-active', button.dataset.bwPreset === tier); });

      var primary = recommendation();
      var alt4 = alternative('alt4');
      var altMax = alternative('altmax');
      var primaryTitle = root.querySelector('[data-bw-primary-title]');
      var primaryCapacity = root.querySelector('[data-bw-primary-capacity]');
      var alt4Title = root.querySelector('[data-bw-alt4-title]');
      var alt4Capacity = root.querySelector('[data-bw-alt4-capacity]');
      var altMaxTitle = root.querySelector('[data-bw-altmax-title]');
      var altMaxCapacity = root.querySelector('[data-bw-altmax-capacity]');
      if (primaryTitle) primaryTitle.textContent = primary.title;
      if (primaryCapacity) primaryCapacity.textContent = formatCapacity(primary.capacity);
      if (alt4Title) alt4Title.textContent = alt4.title;
      if (alt4Capacity) alt4Capacity.textContent = formatCapacity(alt4.capacity);
      if (altMaxTitle) altMaxTitle.textContent = altMax.title;
      if (altMaxCapacity) altMaxCapacity.textContent = formatCapacity(altMax.capacity);
      setAction(root.querySelector('[data-bw-product-role="primary"]'), primary, true, primary.variant && primary.variant.available ? 'In den Warenkorb' : 'Zur Produktseite');
      setAction(root.querySelector('[data-bw-product-role="alt4"]'), { product: alt4.product, variant: alt4.variant }, false, 'Zur Produktseite');
      setAction(root.querySelector('[data-bw-product-role="altmax"]'), { product: altMax.product, variant: altMax.variant }, false, 'Zur Produktseite');

      var finalCapacity = root.querySelector('[data-bw-final-capacity]');
      var finalProduct = root.querySelector('[data-bw-final-product]');
      if (finalCapacity) finalCapacity.textContent = capacityText;
      if (finalProduct) finalProduct.textContent = primary.title;
      var calculated = root.querySelector('[data-bw-calculated-state]');
      var uncalculated = root.querySelector('[data-bw-uncalculated-state]');
      if (calculated) calculated.hidden = !state.hasCalculated;
      if (uncalculated) uncalculated.hidden = !!state.hasCalculated;
    }

    function calculate(markCalculated) {
      state.people = Number(inputs.people.value);
      state.pv = Number(inputs.pv.value);
      state.annual = Number(inputs.annual.value);
      state.tier = getTier(state.people, state.pv, state.annual);
      if (markCalculated) state.hasCalculated = true;
      save();
      render();
      var primary = recommendation();
      root.dispatchEvent(new CustomEvent('venus:capacity-recommendation', { bubbles: true, detail: { people: state.people, pvKw: state.pv, annualKwh: state.annual, capacityKwh: tierValues[state.tier], tier: state.tier, primaryVariantId: primary.variant && primary.variant.id ? primary.variant.id : null, hasCalculated: state.hasCalculated } }));
    }

    Object.keys(inputs).forEach(function (key) { if (inputs[key]) inputs[key].addEventListener('input', function () { calculate(true); }); });
    root.querySelectorAll('[data-bw-preset]').forEach(function (button) {
      button.addEventListener('click', function () {
        var values = valuesForTier(button.dataset.bwPreset);
        Object.keys(values).forEach(function (key) { if (inputs[key]) inputs[key].value = values[key]; });
        calculate(true);
      });
    });
    root.querySelector('[data-bw-scroll-results]')?.addEventListener('click', function () { var result = root.querySelector('[data-bw-results]'); if (result) result.scrollIntoView({ behavior: 'smooth', block: 'start' }); });

    root.addEventListener('click', function (event) {
      var action = event.target.closest('[data-bw-product-role]');
      if (!action) return;
      if (action.dataset.directAdd !== 'true') {
        if (action.dataset.productUrl) window.location.href = action.dataset.productUrl;
        return;
      }
      event.preventDefault();
      if (action.dataset.busy === 'true') return;
      action.dataset.busy = 'true';
      var originalLabel = action.textContent;
      action.textContent = 'Wird hinzugefügt …';
      fetch(getRootUrl() + 'cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ items: [{ id: Number(action.dataset.variantId), quantity: 1 }] }) })
        .then(function (response) { if (!response.ok) throw new Error('cart'); return response.json(); })
        .then(function (item) { document.dispatchEvent(new CustomEvent('ajaxProduct:added', { detail: item })); action.textContent = 'Hinzugefügt ✓'; setTimeout(function () { action.textContent = originalLabel; }, 2200); })
        .catch(function () { action.textContent = 'Erneut versuchen'; setTimeout(function () { action.textContent = originalLabel; }, 2200); })
        .finally(function () { action.dataset.busy = 'false'; });
    });
    var finalAction = root.querySelector('[data-bw-final-action]');
    if (finalAction) finalAction.addEventListener('click', function () { var primary = root.querySelector('[data-bw-product-role="primary"]'); if (primary) primary.click(); });

    root.querySelectorAll('[data-bw-flow-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var target = tab.dataset.bwFlowTab;
        root.querySelectorAll('[data-bw-flow-tab]').forEach(function (button) { var active = button === tab; button.classList.toggle('is-active', active); button.setAttribute('aria-selected', active ? 'true' : 'false'); });
        root.querySelectorAll('[data-bw-flow-panel]').forEach(function (panel) { panel.hidden = panel.dataset.bwFlowPanel !== target; });
      });
    });
    root.querySelectorAll('[data-bw-anchor-link]').forEach(function (link) { link.addEventListener('click', function (event) { var href = link.getAttribute('href'); if (href && href.charAt(0) === '#') { event.preventDefault(); scrollToTarget(href); } }); });
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) { entries.forEach(function (entry) { if (!entry.isIntersecting) return; var id = '#' + entry.target.id; root.querySelectorAll('[data-bw-anchor-link]').forEach(function (link) { link.classList.toggle('is-active', link.getAttribute('href') === id); }); }); }, { rootMargin: '-25% 0px -65% 0px', threshold: 0 });
      root.querySelectorAll('.bw-anchor-target[id]').forEach(function (target) { observer.observe(target); });
    }
    render();
  }

  function boot() { document.querySelectorAll('[data-bw-storage]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
