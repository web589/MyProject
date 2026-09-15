(function () {
  'use strict';

  if (window.__bwStorageControllerInstalled) {
    document.dispatchEvent(new CustomEvent('venus:storage-rescan'));
    return;
  }
  window.__bwStorageControllerInstalled = true;

  var STORAGE_KEY_V1 = 'venusBalkonStorageRecommendation:v1';
  var STORAGE_KEY_V2 = 'venusBalkonStorageRecommendation:v2';
  var STORAGE_KEY_V3 = 'venusBalkonStorageRecommendation:v3';
  /* All calculator rules and the capacity-to-product matrix live here. */
  var CALCULATOR_CONFIG = {
    coefficients: { annual: 1.5, pv: 1.5, lowPv: 0.5 },
    classes: [
      { key: 'below-2', min: null, max: 1.5, value: 2, label: 'bis ca. 2 kWh' },
      { key: '2', min: 1.5, max: 3, value: 2, label: 'ca. 2 kWh' },
      { key: '4', min: 3, max: 4.5, value: 4, label: 'ca. 4 kWh' },
      { key: '5', min: 4.5, max: 5.5, value: 5, label: 'ca. 5 kWh' },
      { key: '6', min: 5.5, max: 8, value: 6, label: 'ca. 6 kWh' },
      { key: '10', min: 8, max: 12.5, value: 10, label: 'ca. 10 kWh' },
      { key: '15', min: 12.5, max: 17.5, value: 15, label: 'ca. 15 kWh' },
      { key: '20', min: 17.5, max: 25, value: 20, label: 'ca. 20 kWh' },
      { key: '30', min: 25, max: null, value: 30, label: 'ca. 30 kWh' }
    ],
    products: {
      mini: { label: 'VENUS E Mini' },
      venus3: { label: 'VENUS E 3.0' },
      venus4: { label: 'VENUS E 4.0' },
      max: { label: 'VENUS E Max' }
    },
    recommendations: {
      2: [{ product: 'mini', capacity: 2, count: 1 }],
      4: [{ product: 'mini', capacity: 4, count: 2 }],
      5: [{ product: 'venus3', capacity: 5.12, count: 1 }, { product: 'venus4', capacity: 5, count: 1 }, { product: 'mini', capacity: 6, count: 3 }],
      6: [{ product: 'mini', capacity: 6, count: 3 }, { product: 'venus3', capacity: 5.12, count: 1 }, { product: 'venus4', capacity: 5, count: 1 }],
      10: [{ product: 'venus3', capacity: 10.24, count: 2 }, { product: 'venus4', capacity: 10, count: 2 }, { product: 'max', capacity: 10, count: 1 }],
      15: [{ product: 'venus3', capacity: 15.36, count: 3 }, { product: 'venus4', capacity: 15, count: 3 }],
      20: [{ product: 'max', capacity: 20, count: 2 }],
      30: [{ product: 'max', capacity: 30, count: 3 }]
    },
    presets: {
      2: { people: 1, pv: 0.8, annual: 1000 },
      4: { people: 2, pv: 3, annual: 2000 },
      5: { people: 1, pv: 11, annual: 3200 },
      6: { people: 3, pv: 6, annual: 4000 },
      10: { people: 3, pv: 6, annual: 6200 },
      15: { people: 4, pv: 10, annual: 9000 },
      20: { people: 5, pv: 14, annual: 12000 },
      30: { people: 6, pv: 20, annual: 20000 }
    }
  };
  var DEFAULT_STATE = {
    people: 3,
    pv: 6,
    annual: 4000,
    tier: '6',
    storageClass: null,
    rawCapacity: 6,
    lowPvWarning: false,
    hasCalculated: false,
    resultsVisible: false
  };
  var state = Object.assign({}, DEFAULT_STATE);
  var products = {};
  var hasStoredState = false;
  var resolvedRecommendation = null;
  var navigationObserver = null;
  var renderFrame = null;
  var rangeResizeFrame = null;
  var rangeResizeBound = false;

  function isDesignMode() {
    return Boolean(window.Shopify && window.Shopify.designMode);
  }

  function prefersReducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function scrollToElement(element) {
    if (!element) return;
    element.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('de-DE').format(Number(value));
  }

  function formatCapacity(value) {
    var number = Number(value);
    return (number % 1 ? number.toFixed(2) : number.toFixed(0)).replace('.', ',') + ' kWh';
  }

  function formatMoney(cents) {
    var currency = window.Shopify && window.Shopify.currency && window.Shopify.currency.active
      ? window.Shopify.currency.active
      : 'EUR';
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency }).format(Number(cents || 0) / 100);
  }

  function parseCapacity(title) {
    var match = String(title || '').match(/(\d+(?:[,.]\d+)?)\s*kWh/i);
    return match ? parseFloat(match[1].replace(',', '.')) : null;
  }

  function finiteNumber(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function getRootUrl() {
    return window.Shopify && window.Shopify.routes && window.Shopify.routes.root
      ? window.Shopify.routes.root
      : '/';
  }

  function readStoredState() {
    var stored = null;
    try {
      stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY_V3) || 'null');
      if (!stored) stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY_V2) || 'null');
      if (!stored) stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY_V1) || 'null');
    } catch (error) {
      stored = null;
    }

    if (!stored || stored.people === undefined || stored.pv === undefined || stored.annual === undefined) return;
    hasStoredState = true;
    state = Object.assign({}, DEFAULT_STATE, stored);
    state.tier = null;
    state.storageClass = null;
    state.hasCalculated = false;
    state.resultsVisible = false;
  }

  function saveState() {
    try {
      window.sessionStorage.setItem(STORAGE_KEY_V3, JSON.stringify(state));
    } catch (error) {
      // Storage can be unavailable in private browsing contexts.
    }
  }

  function getCapacityRoot() {
    return document.querySelector('[data-bw-capacity-root], [data-bw-module="capacity"]');
  }

  function getRecommendationsRoot() {
    return document.querySelector('[data-bw-recommendations], [data-bw-module="recommendations"]');
  }

  function findStorageClass(rawCapacity) {
    var raw = finiteNumber(rawCapacity, 0);
    return CALCULATOR_CONFIG.classes.find(function (item) {
      return (item.min === null || raw >= item.min) && (item.max === null || raw < item.max);
    }) || CALCULATOR_CONFIG.classes[CALCULATOR_CONFIG.classes.length - 1];
  }

  function calculateCapacity(people, pv, annual) {
    var consumptionCapacity = annual / 1000 * CALCULATOR_CONFIG.coefficients.annual;
    var pvCapacity = pv * CALCULATOR_CONFIG.coefficients.pv;
    var rawCapacity = Math.min(consumptionCapacity, pvCapacity);
    var storageClass = findStorageClass(rawCapacity);
    return {
      consumptionCapacity: consumptionCapacity,
      pvCapacity: pvCapacity,
      rawCapacity: rawCapacity,
      storageClass: storageClass,
      lowPvWarning: pv < annual / 1000 * CALCULATOR_CONFIG.coefficients.lowPv
    };
  }

  function valuesForTier(tier) {
    return CALCULATOR_CONFIG.presets[String(tier)] || CALCULATOR_CONFIG.presets[6];
  }

  function findVariant(product, capacity) {
    if (!product || !Array.isArray(product.variants)) return null;
    var matches = product.variants.filter(function (variant) {
      var parsed = parseCapacity(variant.title);
      return parsed !== null && Math.abs(parsed - capacity) < 0.08;
    });
    return matches[0] || null;
  }

  function findBundleImage(productKey, capacity, count) {
    var mappings = products && Array.isArray(products.bundle_images) ? products.bundle_images : [];
    return mappings.find(function (mapping) {
      return mapping
        && mapping.image
        && String(mapping.product || '') === String(productKey)
        && Math.abs(finiteNumber(mapping.capacity, -1) - Number(capacity)) < 0.08
        && finiteNumber(mapping.quantity, -1) === Number(count);
    }) || null;
  }

  function readProductData() {
    var root = getRecommendationsRoot();
    var node = root && root.querySelector('[data-bw-product-data]');
    if (!node) {
      products = {};
      return;
    }
    try {
      products = JSON.parse(node.textContent) || {};
    } catch (error) {
      products = {};
    }
  }

  function recommendationForState() {
    return configuredRecommendations()[0] || null;
  }

  function alternativeForState(role) {
    var configured = configuredRecommendations();
    return role === 'alt4' ? configured[1] || null : configured[2] || null;
  }

  function configuredItem(productKey, capacity, count) {
    var product = products[productKey];
    var variant = findVariant(product, capacity);
    var productMeta = CALCULATOR_CONFIG.products[productKey] || { label: productKey };
    var bundleImage = findBundleImage(productKey, capacity, count);
    var fallbackImage = product && (product.featured_image || product.image)
      ? (product.featured_image || product.image)
      : '';
    return {
      productKey: productKey,
      product: product || {},
      variant: variant,
      capacity: capacity,
      count: count,
      title: String(count) + '× ' + productMeta.label,
      url: product && product.url ? product.url : '',
      image: bundleImage && bundleImage.image
        ? bundleImage.image
        : variant && variant.image
          ? variant.image
          : fallbackImage,
      imageAlt: bundleImage && bundleImage.alt ? bundleImage.alt : productMeta.label,
      available: Boolean(variant && variant.available),
      preorder: Boolean(product && product.preorder_enabled),
      preorderLabel: product && product.preorder_label ? product.preorder_label : 'Jetzt vormerken'
    };
  }

  function configuredRecommendations() {
    var storageClass = state.storageClass || findStorageClass(state.rawCapacity || 0);
    var specs = CALCULATOR_CONFIG.recommendations[storageClass.value] || [];
    return specs.map(function (spec) { return configuredItem(spec.product, spec.capacity, spec.count); })
      .filter(function (item) { return item.product && (item.variant || item.url); });
  }

  function inputsFrom(root) {
    return {
      people: root && root.querySelector('[data-bw-input="people"]'),
      pv: root && root.querySelector('[data-bw-input="pv"]'),
      annual: root && root.querySelector('[data-bw-input="annual"]')
    };
  }

  function syncStateFromInputs(root, markCalculated) {
    var inputs = inputsFrom(root);
    if (!inputs.people || !inputs.pv || !inputs.annual) return;
    var people = finiteNumber(inputs.people.value, DEFAULT_STATE.people);
    var pv = finiteNumber(inputs.pv.value, DEFAULT_STATE.pv);
    var annual = finiteNumber(inputs.annual.value, DEFAULT_STATE.annual);
    var calculation = calculateCapacity(people, pv, annual);
    var tier = String(calculation.storageClass.value);
    var hasCalculated = markCalculated ? true : state.hasCalculated;
    var changed = state.people !== people
      || state.pv !== pv
      || state.annual !== annual
      || state.tier !== tier
      || !state.storageClass
      || state.storageClass.key !== calculation.storageClass.key
      || state.rawCapacity !== calculation.rawCapacity
      || state.lowPvWarning !== calculation.lowPvWarning
      || state.hasCalculated !== hasCalculated;

    if (!changed) return;

    state.people = people;
    state.pv = pv;
    state.annual = annual;
    state.tier = tier;
    state.storageClass = calculation.storageClass;
    state.rawCapacity = calculation.rawCapacity;
    state.lowPvWarning = calculation.lowPvWarning;
    state.hasCalculated = hasCalculated;
    scheduleRender();
  }

  function scheduleRender() {
    if (renderFrame !== null) return;
    renderFrame = window.requestAnimationFrame(function () {
      renderFrame = null;
      saveState();
      renderAll();
    });
  }

  function renderNow() {
    if (renderFrame !== null) {
      window.cancelAnimationFrame(renderFrame);
      renderFrame = null;
    }
    saveState();
    renderAll();
  }

  function setText(root, selector, value) {
    var node = root && root.querySelector(selector);
    if (node) node.textContent = value;
  }

  function setAllText(root, selector, value) {
    if (!root) return;
    root.querySelectorAll(selector).forEach(function (node) { node.textContent = value; });
  }

  function syncRangeProgress(input) {
    if (!input) return;
    var minimum = finiteNumber(input.min, 0);
    var maximum = finiteNumber(input.max, 100);
    var value = finiteNumber(input.value, minimum);
    var ratio = maximum === minimum ? 0 : (value - minimum) / (maximum - minimum);
    var trackWidth = input.getBoundingClientRect().width;
    var thumbSize = parseFloat(window.getComputedStyle(input).getPropertyValue('--bw-range-thumb-size')) || 16;
    var thumbOffset = trackWidth > thumbSize ? (thumbSize / (trackWidth * 2)) * 100 : 0;
    var progress = thumbOffset + Math.max(0, Math.min(1, ratio)) * (100 - thumbOffset * 2);
    var progressValue = Math.max(0, Math.min(100, progress)) + '%';
    var control = input.closest('.bw-slider-row__control');
    (control || input).style.setProperty('--bw-range-progress', progressValue);
  }

  function syncRangeScale(input) {
    if (!input) return;
    var control = input.closest('.bw-slider-row__control');
    var scale = control && control.querySelector('.bw-slider-scale');
    if (!scale) return;
    var minimum = finiteNumber(input.min, 0);
    var maximum = finiteNumber(input.max, 100);
    var trackWidth = input.getBoundingClientRect().width;
    var thumbSize = parseFloat(window.getComputedStyle(input).getPropertyValue('--bw-range-thumb-size')) || 16;
    var thumbOffset = trackWidth > thumbSize ? (thumbSize / (trackWidth * 2)) * 100 : 0;
    scale.classList.add('is-positioned');
    scale.querySelectorAll('[data-bw-scale-value]').forEach(function (mark) {
      var value = finiteNumber(mark.dataset.bwScaleValue, minimum);
      var ratio = maximum === minimum ? 0 : (value - minimum) / (maximum - minimum);
      var position = thumbOffset + Math.max(0, Math.min(1, ratio)) * (100 - thumbOffset * 2);
      mark.style.setProperty('--bw-scale-position', Math.max(0, Math.min(100, position)) + '%');
    });
  }

  function renderCapacity() {
    var root = getCapacityRoot();
    if (!root) return;
    var inputs = inputsFrom(root);
    Object.keys(inputs).forEach(function (key) {
      if (!inputs[key]) return;
      if (document.activeElement !== inputs[key]) inputs[key].value = state[key];
      syncRangeProgress(inputs[key]);
      syncRangeScale(inputs[key]);
    });

    var peopleText = state.people + (Number(state.people) >= 6 ? '+ Personen' : ' Personen');
    var pvText = String(state.pv).replace('.', ',') + ' kWp';
    var annualText = formatNumber(state.annual) + ' kWh/Jahr';
    if (inputs.people) inputs.people.setAttribute('aria-valuetext', peopleText);
    if (inputs.pv) inputs.pv.setAttribute('aria-valuetext', pvText);
    if (inputs.annual) inputs.annual.setAttribute('aria-valuetext', annualText);
    setText(root, '[data-bw-output="people"]', peopleText);
    setText(root, '[data-bw-output="pv"]', pvText);
    setText(root, '[data-bw-output="annual"]', annualText);
    var storageClass = state.storageClass || findStorageClass(state.rawCapacity || 0);
    setAllText(root, '[data-bw-capacity]', storageClass.label);
    setText(root, '[data-bw-summary="people"]', peopleText);
    setText(root, '[data-bw-summary="pv"]', pvText);
    setText(root, '[data-bw-summary="annual"]', annualText);
    var combined = root.querySelector('[data-bw-summary]:not([data-bw-summary="people"]):not([data-bw-summary="pv"]):not([data-bw-summary="annual"])');
    if (combined) combined.textContent = peopleText + ' · ' + pvText + ' · ' + annualText;
    root.querySelectorAll('[data-bw-preset]').forEach(function (button) {
      var preset = valuesForTier(button.dataset.bwPreset);
      var active = Number(preset.people) === Number(state.people)
        && Number(preset.pv) === Number(state.pv)
        && Number(preset.annual) === Number(state.annual);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    var warning = root.querySelector('[data-bw-low-pv-warning]');
    if (warning) warning.hidden = !state.lowPvWarning;
  }

  function bindRangeResize() {
    if (rangeResizeBound) return;
    rangeResizeBound = true;
    window.addEventListener('resize', function () {
      if (rangeResizeFrame !== null) return;
      rangeResizeFrame = window.requestAnimationFrame(function () {
        rangeResizeFrame = null;
        var root = getCapacityRoot();
        if (!root) return;
        var inputs = inputsFrom(root);
        Object.keys(inputs).forEach(function (key) {
          syncRangeProgress(inputs[key]);
          syncRangeScale(inputs[key]);
        });
      });
    });
  }

  function updateMedia(container, imageUrl, alt) {
    if (!container) return;
    var image = container.matches('img') ? container : container.querySelector('[data-bw-result-image], [data-bw-final-image], img');
    var placeholder = container.matches('[data-bw-result-placeholder], [data-bw-final-placeholder]')
      ? container
      : container.querySelector('[data-bw-result-placeholder], [data-bw-final-placeholder], .bw-product-placeholder');
    var wrapper = image && image.closest('[data-bw-result-image-wrap], [data-bw-final-image-wrap]');
    if (imageUrl) {
      if (wrapper) wrapper.hidden = false;
      if (image) {
        image.removeAttribute('srcset');
        image.src = imageUrl;
        image.alt = alt || '';
        image.hidden = false;
      }
      if (placeholder) placeholder.hidden = true;
    } else {
      if (image) image.hidden = true;
      if (wrapper) wrapper.hidden = true;
      if (placeholder) placeholder.hidden = false;
    }
  }

  function configureAction(action, item, direct, fallbackLabel) {
    if (!action) return;
    var directAdd = Boolean(direct && item && item.variant && item.variant.available);
    action.dataset.variantId = item && item.variant && item.variant.id ? item.variant.id : '';
    action.dataset.productUrl = item && item.url ? item.url : '';
    action.dataset.directAdd = directAdd ? 'true' : 'false';
    action.removeAttribute('aria-disabled');
    if ('disabled' in action) action.disabled = false;

    if (direct && !directAdd) {
      action.textContent = item && item.url ? 'Zur Produktseite' : 'Nicht verfügbar';
      if (!item || !item.url) {
        action.setAttribute('aria-disabled', 'true');
        if ('disabled' in action) action.disabled = true;
      }
    } else if (fallbackLabel) {
      action.textContent = fallbackLabel;
    }

    if (action.tagName === 'A' && item && item.url) action.href = item.url;
  }

  function renderResultCard(root, role, item) {
    var card = root.querySelector('[data-bw-result-card="' + role + '"]');
    if (!card || !item) return;
    setText(card, '[data-bw-result-title]', item.title);
    setText(card, '[data-bw-result-capacity]', formatCapacity(item.capacity));
    setText(card, '[data-bw-' + (role === 'primary' ? 'primary' : role === 'alt4' ? 'alt4' : 'altmax') + '-title]', item.title);
    setText(card, '[data-bw-' + (role === 'primary' ? 'primary' : role === 'alt4' ? 'alt4' : 'altmax') + '-capacity]', formatCapacity(item.capacity));

    var price = card.querySelector('[data-bw-result-price]');
    var compareAt = card.querySelector('[data-bw-result-compare-at]');
    if (price) {
      price.textContent = item.variant ? formatMoney(item.variant.price) : '';
      price.hidden = !item.variant;
    }
    if (compareAt) {
      var showCompare = item.variant && Number(item.variant.compare_at_price) > Number(item.variant.price);
      compareAt.textContent = showCompare ? formatMoney(item.variant.compare_at_price) : '';
      compareAt.hidden = !showCompare;
    }
    setText(card, '[data-bw-result-availability]', item.available ? 'Verfügbar' : 'Nicht verfügbar');
    updateMedia(card.querySelector('[data-bw-result-media]') || card, item.image, item.imageAlt || item.title);
    var action = card.querySelector('[data-bw-product-role], [data-bw-product-action]');
    configureAction(action, item, role === 'primary', role === 'primary' ? 'In den Warenkorb' : 'Zur Produktseite');
    card.classList.toggle('is-unavailable', !item.available);
  }

  function resultSummary() {
    return state.people + (Number(state.people) >= 6 ? '+ Personen' : ' Personen') + ' · '
      + String(state.pv).replace('.', ',') + ' kWp · '
      + formatNumber(state.annual) + ' kWh/Jahr';
  }

  function renderRecommendations() {
    return renderRecommendationsV2();
  }

  function productVariantUrl(item) {
    var productUrl = item && item.url ? item.url : '';
    var variantId = item && item.variant && item.variant.id ? String(item.variant.id) : '';
    if (!productUrl || !variantId) return productUrl;
    try {
      var url = new URL(productUrl, window.location.origin);
      url.searchParams.set('variant', variantId);
      return url.pathname + url.search + url.hash;
    } catch (error) {
      return productUrl + (productUrl.indexOf('?') === -1 ? '?' : '&') + 'variant=' + encodeURIComponent(variantId);
    }
  }

  function configureActionV2(action, item, fallbackLabel) {
    if (!action) return;
    var directAdd = Boolean(item && item.variant && item.variant.available && !item.preorder);
    var productUrl = productVariantUrl(item);
    action.dataset.variantId = item && item.variant && item.variant.id ? String(item.variant.id) : '';
    action.dataset.productUrl = productUrl;
    action.dataset.productHandle = item && item.product && item.product.handle ? item.product.handle : '';
    action.dataset.productId = item && item.product && item.product.id ? String(item.product.id) : '';
    action.dataset.directAdd = directAdd ? 'true' : 'false';
    action.dataset.preorder = item && item.preorder ? 'true' : 'false';
    action.removeAttribute('aria-disabled');
    if ('disabled' in action) action.disabled = false;
    if (directAdd) {
      action.textContent = fallbackLabel || 'In den Warenkorb';
    } else if (item && item.preorder) {
      action.textContent = item.preorderLabel || 'Jetzt vormerken';
    } else if (productUrl && !item.variant) {
      action.textContent = 'Zur Produktseite';
    } else {
      action.textContent = 'Nicht verfügbar';
      action.setAttribute('aria-disabled', 'true');
      if ('disabled' in action) action.disabled = true;
    }
  }

  function renderResultCardV2(root, slot, item) {
    var card = root.querySelector('[data-bw-result-card="' + slot + '"]');
    if (!card) return;
    card.hidden = !item;
    if (!item) return;
    setText(card, '[data-bw-result-title]', item.title);
    setText(card, '[data-bw-result-capacity]', formatCapacity(item.capacity));
    var price = card.querySelector('[data-bw-result-price]');
    var compareAt = card.querySelector('[data-bw-result-compare-at]');
    if (price) {
      price.textContent = item.variant ? formatMoney(item.variant.price) : '';
      price.hidden = !item.variant;
    }
    if (compareAt) {
      var showCompare = item.variant && Number(item.variant.compare_at_price) > Number(item.variant.price);
      compareAt.textContent = showCompare ? formatMoney(item.variant.compare_at_price) : '';
      compareAt.hidden = !showCompare;
    }
    setText(card, '[data-bw-result-availability]', item.preorder ? 'Jetzt vormerken' : item.available ? 'Verfügbar' : 'Nicht verfügbar');
    updateMedia(card.querySelector('[data-bw-result-media]') || card, item.image, item.imageAlt || item.title);
    var productUrl = productVariantUrl(item);
    var mediaWrap = card.querySelector('[data-bw-result-image-wrap]');
    if (mediaWrap && productUrl) mediaWrap.href = productUrl;
    var productLink = card.querySelector('[data-bw-result-product-link]');
    if (productLink && productUrl) productLink.href = productUrl;
    configureActionV2(card.querySelector('[data-bw-product-role], [data-bw-product-action]'), item, 'In den Warenkorb');
    card.classList.toggle('is-unavailable', !item.available && !item.preorder);
    card.classList.toggle('is-preorder', item.preorder);
  }

  function resultSummaryV2() {
    return state.people + (Number(state.people) >= 6 ? '+ Personen' : ' Personen') + ' · '
      + String(state.pv).replace('.', ',') + ' kWp · '
      + formatNumber(state.annual) + ' kWh/Jahr';
  }

  function renderRecommendationsV2() {
    var root = getRecommendationsRoot();
    if (!root) {
      resolvedRecommendation = null;
      renderFinalCta();
      return;
    }
    var resultsVisible = state.resultsVisible;
    root.hidden = !resultsVisible;
    root.dataset.bwResultsState = resultsVisible ? 'visible' : 'hidden';
    syncResultsControls(root, resultsVisible);
    var storageClass = state.storageClass || findStorageClass(state.rawCapacity || 0);
    setAllText(root, '[data-bw-capacity-inline]', storageClass.label);
    setText(root, '[data-bw-results-input-summary], [data-bw-recommendation-summary]', resultSummaryV2());
    var recommendations = configuredRecommendations();
    resolvedRecommendation = recommendations[0] || null;
    ['slot1', 'slot2', 'slot3'].forEach(function (slot, index) {
      renderResultCardV2(root, slot, recommendations[index] || null);
    });
    var primary = resolvedRecommendation;
    document.dispatchEvent(new CustomEvent('venus:recommendation-resolved', { detail: {
      tier: state.tier,
      storageClass: storageClass.label,
      rawCapacity: state.rawCapacity,
      capacityKwh: storageClass.value,
      productTitle: primary ? primary.title : '',
      productUrl: primary ? primary.url : '',
      variantId: primary && primary.variant ? String(primary.variant.id) : null,
      available: Boolean(primary && primary.available),
      recommendations: recommendations
    }}));
  }

  function syncResultsControls(root, expanded) {
    var controls = document.querySelectorAll('[data-bw-results-control]');
    controls.forEach(function (control) {
      if (root && root.id) control.setAttribute('aria-controls', root.id);
      control.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    });
  }

  function renderFinalCta() {
    document.querySelectorAll('[data-bw-final-state], [data-bw-module="final-cta"]').forEach(function (root) {
      var calculated = root.querySelector('[data-bw-calculated-state]');
      var uncalculated = root.querySelector('[data-bw-uncalculated-state]');
      var hasRecommendation = Boolean(state.hasCalculated && resolvedRecommendation);
      if (calculated) calculated.hidden = !hasRecommendation;
      if (uncalculated) uncalculated.hidden = hasRecommendation;
      if (!hasRecommendation) return;

      var finalClass = state.storageClass || findStorageClass(state.rawCapacity || 0);
      setAllText(root, '[data-bw-final-capacity]', finalClass.label);
      setAllText(root, '[data-bw-final-product]', resolvedRecommendation.title);
      setText(root, '[data-bw-final-price]', resolvedRecommendation.variant ? formatMoney(resolvedRecommendation.variant.price) : '');
      updateMedia(root.querySelector('[data-bw-final-media]') || root, resolvedRecommendation.image, resolvedRecommendation.imageAlt || resolvedRecommendation.title);
      configureActionV2(root.querySelector('[data-bw-final-action]'), resolvedRecommendation, 'In den Warenkorb');
    });
  }

  function emitCapacityChange() {
    var primary = resolvedRecommendation || configuredRecommendations()[0] || null;
    document.dispatchEvent(new CustomEvent('venus:capacity-change', {
      detail: {
        people: state.people,
        pvKw: state.pv,
        annualKwh: state.annual,
        tier: state.tier,
        capacityKwh: state.storageClass ? state.storageClass.value : null,
        rawCapacity: state.rawCapacity,
        lowPvWarning: state.lowPvWarning,
        hasCalculated: state.hasCalculated,
        resultsVisible: state.resultsVisible,
        primaryVariantId: primary && primary.variant && primary.variant.id ? primary.variant.id : null
      }
    }));
  }

  function renderAll() {
    readProductData();
    renderCapacity();
    renderRecommendationsV2();
    renderFinalCta();
    emitCapacityChange();
  }

  function bindCapacity() {
    var root = getCapacityRoot();
    if (!root || root.dataset.bwInitialized === 'true') return;
    root.dataset.bwInitialized = 'true';
    bindRangeResize();
    var inputs = inputsFrom(root);
    if (!hasStoredState && inputs.people && inputs.pv && inputs.annual) {
      state.people = finiteNumber(inputs.people.value, DEFAULT_STATE.people);
      state.pv = finiteNumber(inputs.pv.value, DEFAULT_STATE.pv);
      state.annual = finiteNumber(inputs.annual.value, DEFAULT_STATE.annual);
    }
    Object.keys(inputs).forEach(function (key) {
      if (!inputs[key]) return;
      if (hasStoredState) inputs[key].value = state[key];
      inputs[key].addEventListener('input', function () {
        syncRangeProgress(this);
        syncStateFromInputs(root, true);
      });
      inputs[key].addEventListener('change', function () { syncStateFromInputs(root, true); });
    });
    root.querySelectorAll('[data-bw-preset]').forEach(function (button) {
      button.addEventListener('click', function () {
        var configured = valuesForTier(button.dataset.bwPreset);
        var values = {
          people: finiteNumber(button.dataset.bwPresetPeople, configured.people),
          pv: finiteNumber(button.dataset.bwPresetPv, configured.pv),
          annual: finiteNumber(button.dataset.bwPresetAnnual, configured.annual)
        };
        Object.keys(values).forEach(function (key) { if (inputs[key]) inputs[key].value = values[key]; });
        syncStateFromInputs(root, true);
      });
    });
    syncStateFromInputs(root, false);
    hasStoredState = true;
    root.querySelectorAll('[data-bw-scroll-results]').forEach(function (button) {
      button.addEventListener('click', function () {
        syncStateFromInputs(root, true);
        state.resultsVisible = true;
        renderNow();
        var resultsRoot = getRecommendationsRoot();
        if (resultsRoot) resultsRoot.dataset.bwResultsState = 'hidden';
        refreshNavigation();
        window.requestAnimationFrame(function () {
          if (!resultsRoot) return;
          resultsRoot.dataset.bwResultsState = 'visible';
          scrollToElement(resultsRoot);
          var resultsHeading = resultsRoot.querySelector('[data-bw-results-heading]');
          if (resultsHeading && typeof resultsHeading.focus === 'function') {
            resultsHeading.focus({ preventScroll: true });
          }
        });
      });
    });
  }

  function bindFlowSections() {
    document.querySelectorAll('[data-bw-flow]').forEach(function (root) {
      if (root.dataset.bwInitialized === 'true') return;
      root.dataset.bwInitialized = 'true';
      var tabs = Array.prototype.slice.call(root.querySelectorAll('[data-bw-flow-tab]'));
      var panels = Array.prototype.slice.call(root.querySelectorAll('[data-bw-flow-panel]'));
      var reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var hasPairedVideos = panels.length === 2 && panels.every(function (panel) {
        return Boolean(panel.querySelector('video'));
      });
      var shouldAutoCycle = hasPairedVideos && !reducedMotion;
      var isInViewport = false;

      function activePanel() {
        return panels.find(function (panel) { return panel.classList.contains('is-active'); }) || panels[0] || null;
      }

      function pauseVideos(exceptPanel) {
        panels.forEach(function (panel) {
          if (panel === exceptPanel) return;
          panel.querySelectorAll('video').forEach(function (video) { video.pause(); });
        });
      }

      function playPanelVideo(panel, restart, userInitiated) {
        if (!panel || !isInViewport || (!shouldAutoCycle && !userInitiated)) return;
        var video = panel.querySelector('video');
        if (!video) return;
        pauseVideos(panel);
        video.muted = true;
        video.playsInline = true;
        if (restart) {
          try { video.currentTime = 0; } catch (error) { /* The stream is not seekable yet. */ }
        }
        var playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(function () {});
      }

      function activate(tab, options) {
        if (!tab) return;
        var settings = options || {};
        var target = tab.dataset.bwFlowTab;
        tabs.forEach(function (button) {
          var active = button === tab;
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-selected', active ? 'true' : 'false');
          button.tabIndex = active ? 0 : -1;
        });
        panels.forEach(function (panel) {
          var active = panel.dataset.bwFlowPanel === target;
          panel.classList.toggle('is-active', active);
          panel.setAttribute('aria-hidden', active ? 'false' : 'true');
          if (active) playPanelVideo(panel, Boolean(settings.restart), Boolean(settings.userInitiated));
          else panel.querySelectorAll('video').forEach(function (video) { video.pause(); });
        });
      }

      tabs.forEach(function (tab, index) {
        tab.addEventListener('click', function () { activate(tab, { restart: true, userInitiated: true }); });
        tab.addEventListener('keydown', function (event) {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          var direction = event.key === 'ArrowRight' ? 1 : -1;
          var next = tabs[(index + direction + tabs.length) % tabs.length];
          activate(next, { restart: true, userInitiated: true });
          next.focus();
        });
      });

      panels.forEach(function (panel) {
        panel.querySelectorAll('video').forEach(function (video) {
          video.addEventListener('ended', function () {
            if (!shouldAutoCycle || !isInViewport || !panel.classList.contains('is-active')) return;
            var currentIndex = tabs.findIndex(function (tab) {
              return tab.dataset.bwFlowTab === panel.dataset.bwFlowPanel;
            });
            activate(tabs[(currentIndex + 1) % tabs.length], { restart: true });
          });
        });
      });

      var initialTab = tabs.find(function (tab) { return tab.classList.contains('is-active'); }) || tabs[0];
      if (initialTab) activate(initialTab);

      function updateViewport(isVisible) {
        isInViewport = isVisible;
        if (!isInViewport) {
          pauseVideos(null);
          return;
        }
        if (shouldAutoCycle) playPanelVideo(activePanel(), false, false);
      }

      if (typeof window.IntersectionObserver === 'function') {
        var observer = new window.IntersectionObserver(function (entries) {
          var entry = entries[0];
          updateViewport(Boolean(entry && entry.isIntersecting && entry.intersectionRatio >= 0.25));
        }, { threshold: [0, 0.25] });
        observer.observe(root);
      } else {
        updateViewport(true);
      }
    });
  }

  function executeScripts(container) {
    container.querySelectorAll('script').forEach(function (oldScript) {
      var script = document.createElement('script');
      Array.prototype.forEach.call(oldScript.attributes, function (attribute) {
        script.setAttribute(attribute.name, attribute.value);
      });
      script.text = oldScript.text || oldScript.textContent;
      oldScript.parentNode.replaceChild(script, oldScript);
    });
  }

  function requestHomepageSection(sectionId) {
    var homepageUrl = new URL(getRootUrl(), window.location.origin);
    var requestUrl = new URL(homepageUrl.toString());
    requestUrl.searchParams.set('section_id', sectionId);
    var previewThemeId = new URLSearchParams(window.location.search).get('preview_theme_id');
    if (previewThemeId) {
      requestUrl.searchParams.set('preview_theme_id', previewThemeId);
      homepageUrl.searchParams.set('preview_theme_id', previewThemeId);
    }

    function requestMarkup(url) {
      return fetch(url, { credentials: 'same-origin', headers: { Accept: 'text/html' } }).then(function (response) {
        if (!response.ok) throw new Error('Homepage section request failed.');
        return response.text();
      });
    }

    return requestMarkup(requestUrl.toString()).catch(function () {
      return requestMarkup(homepageUrl.toString()).then(function (homepageMarkup) {
        var documentCopy = new DOMParser().parseFromString(homepageMarkup, 'text/html');
        var homepageSection = documentCopy.getElementById('shopify-section-' + sectionId)
          || documentCopy.querySelector('[id^="shopify-section-"][id$="__' + sectionId + '"]');
        if (!homepageSection) throw new Error('Homepage section is unavailable.');
        return homepageSection.outerHTML;
      });
    });
  }

  function bindHomepageSync() {
    document.querySelectorAll('[data-bw-homepage-product-sync], [data-bw-homepage-newsletter-sync]').forEach(function (mount) {
      if (mount.dataset.bwInitialized === 'true') return;
      mount.dataset.bwInitialized = 'true';
      mount.setAttribute('aria-busy', 'true');
      var sectionId = mount.dataset.bwSourceSectionId;
      if (!sectionId || !window.fetch) {
        mount.removeAttribute('aria-busy');
        return;
      }
      requestHomepageSection(sectionId).then(function (markup) {
        if (!markup || !markup.trim()) throw new Error('Homepage section is unavailable.');
        mount.innerHTML = markup;
        mount.removeAttribute('aria-busy');
        executeScripts(mount);
        mount.dispatchEvent(new CustomEvent('venus:homepage-sync-ready', { bubbles: true }));
      }).catch(function () {
        mount.removeAttribute('aria-busy');
        if (isDesignMode()) {
          mount.innerHTML = '<p class="bw-sync-error">Die Startseiten-Synchronisierung ist aktuell nicht verfügbar.</p>';
        }
      });
    });
  }

  function refreshNavigation() {
    if (navigationObserver) navigationObserver.disconnect();
    var nav = document.querySelector('[data-bw-anchor-nav]');
    if (!nav) return;
    var navScroller = nav.querySelector('.bw-anchor-nav__inner');
    var links = Array.prototype.slice.call(nav.querySelectorAll('[data-bw-anchor-link]'));
    var targets = [];

    function revealActiveLink(link) {
      if (!navScroller || !link || !link.classList.contains('bw-anchor-nav__link')) return;
      var scrollerRect = navScroller.getBoundingClientRect();
      var linkRect = link.getBoundingClientRect();
      if (linkRect.left < scrollerRect.left) {
        navScroller.scrollLeft -= scrollerRect.left - linkRect.left;
      } else if (linkRect.right > scrollerRect.right) {
        navScroller.scrollLeft += linkRect.right - scrollerRect.right;
      }
    }

    links.forEach(function (link) {
      if (link.dataset.bwInitialized !== 'true') {
        link.dataset.bwInitialized = 'true';
        link.addEventListener('click', function (event) {
          var href = link.getAttribute('href');
          if (!href || href.charAt(0) !== '#') return;
          var target = document.querySelector(href);
          if (!target) return;
          event.preventDefault();
          scrollToElement(target);
        });
      }
      var href = link.getAttribute('href');
      var target = href && href.charAt(0) === '#' ? document.querySelector(href) : null;
      link.hidden = !target || target.hidden;
      if (link.hidden) {
        link.classList.remove('is-active');
        link.removeAttribute('aria-current');
      }
      if (target && !target.hidden && !targets.includes(target)) targets.push(target);
    });

    if (!('IntersectionObserver' in window)) return;
    navigationObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = '#' + entry.target.id;
        links.forEach(function (link) {
          var active = link.getAttribute('href') === id;
          link.classList.toggle('is-active', active);
          if (active) {
            link.setAttribute('aria-current', 'location');
            revealActiveLink(link);
          } else {
            link.removeAttribute('aria-current');
          }
        });
      });
    }, { rootMargin: '-25% 0px -65% 0px', threshold: 0 });
    targets.forEach(function (target) { navigationObserver.observe(target); });
  }

  function bindAnchorLinks() {
    document.querySelectorAll('[data-bw-anchor-link]').forEach(function (link) {
      if (link.dataset.bwAnchorInitialized === 'true') return;
      link.dataset.bwAnchorInitialized = 'true';
      link.addEventListener('click', function (event) {
        var href = link.getAttribute('href');
        if (!href || href.charAt(0) !== '#') return;
        var target = document.querySelector(href);
        if (!target) return;
        event.preventDefault();
        scrollToElement(target);
      });
    });
  }

  function handleProductAction(event) {
    var action = event.target.closest('[data-bw-product-role], [data-bw-product-action], [data-bw-final-action]');
    if (!action) return;
    if (action.dataset.preorder === 'true') {
      event.preventDefault();
      var triggers = document.querySelectorAll('[data-preorder-open]');
      var matchingTrigger = Array.prototype.find.call(triggers, function (trigger) {
        return (!action.dataset.productHandle || trigger.dataset.productHandle === action.dataset.productHandle)
          && (!action.dataset.productId || trigger.dataset.productId === action.dataset.productId);
      });
      if (!matchingTrigger) {
        matchingTrigger = triggers[0];
      }
      if (matchingTrigger && typeof matchingTrigger.click === 'function') {
        matchingTrigger.click();
      } else if (action.dataset.productUrl) {
        window.location.href = action.dataset.productUrl;
      }
      return;
    }
    var directAdd = action.dataset.directAdd === 'true';
    var productUrl = action.dataset.productUrl;
    if (!directAdd) {
      if (action.tagName !== 'A' && productUrl) window.location.href = productUrl;
      return;
    }
    event.preventDefault();
    if (action.dataset.busy === 'true') return;
    action.dataset.busy = 'true';
    action.setAttribute('aria-busy', 'true');
    var originalLabel = action.textContent;
    action.textContent = 'Wird hinzugefügt …';
    fetch(getRootUrl() + 'cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: [{ id: action.dataset.variantId, quantity: 1 }] })
    }).then(function (response) {
      if (!response.ok) throw new Error('cart');
      return response.json();
    }).then(function (item) {
      document.dispatchEvent(new CustomEvent('ajaxProduct:added', { detail: item }));
      action.textContent = 'Hinzugefügt ✓';
      window.setTimeout(function () { action.textContent = originalLabel; }, 2200);
    }).catch(function () {
      action.textContent = 'Erneut versuchen';
      window.setTimeout(function () { action.textContent = originalLabel; }, 2200);
    }).finally(function () {
      action.dataset.busy = 'false';
      action.removeAttribute('aria-busy');
    });
  }

  function bindFinalCta() {
    document.querySelectorAll('[data-bw-final-state], [data-bw-module="final-cta"]').forEach(function (root) {
      if (root.dataset.bwInitialized === 'true') return;
      root.dataset.bwInitialized = 'true';
      root.querySelectorAll('[data-bw-final-calculate]').forEach(function (link) {
        link.addEventListener('click', function (event) {
          var href = link.getAttribute('href');
          var target = href && href.charAt(0) === '#' ? document.querySelector(href) : null;
          if (!target) return;
          event.preventDefault();
          scrollToElement(target);
        });
      });
    });
  }

  function boot() {
    bindCapacity();
    bindFlowSections();
    bindHomepageSync();
    bindFinalCta();
    bindAnchorLinks();
    refreshNavigation();
    renderAll();
  }

  readStoredState();
  document.addEventListener('click', handleProductAction);
  document.addEventListener('venus:storage-rescan', boot);
  document.addEventListener('shopify:section:load', function () { window.setTimeout(boot, 0); });
  document.addEventListener('shopify:section:unload', function () { window.setTimeout(boot, 0); });
  document.addEventListener('shopify:section:reorder', function () { window.setTimeout(boot, 0); });
  document.addEventListener('venus:recommendation-resolved', renderFinalCta);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
