(function () {
  'use strict';

  if (window.__bwStorageControllerInstalled) {
    document.dispatchEvent(new CustomEvent('venus:storage-rescan'));
    return;
  }
  window.__bwStorageControllerInstalled = true;

  var STORAGE_KEY_V1 = 'venusBalkonStorageRecommendation:v1';
  var STORAGE_KEY_V2 = 'venusBalkonStorageRecommendation:v2';
  var TIER_VALUES = { '5.12': 5.12, '10.24': 10.24, '15.36': 15.36, '30': 30 };
  var DEFAULT_STATE = {
    people: 3,
    pv: 6,
    annual: 4000,
    tier: '15.36',
    hasCalculated: false,
    resultsVisible: false
  };
  var state = Object.assign({}, DEFAULT_STATE);
  var products = {};
  var resolvedRecommendation = null;
  var navigationObserver = null;
  var renderFrame = null;

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
      stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY_V2) || 'null');
      if (!stored) stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY_V1) || 'null');
    } catch (error) {
      stored = null;
    }

    if (!stored || stored.people === undefined || stored.pv === undefined || stored.annual === undefined) return;
    state = Object.assign({}, DEFAULT_STATE, stored);
    if (!TIER_VALUES[state.tier]) state.tier = '15.36';
    state.hasCalculated = false;
    state.resultsVisible = false;
  }

  function saveState() {
    try {
      window.sessionStorage.setItem(STORAGE_KEY_V2, JSON.stringify(state));
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

  function thresholdsFrom(root) {
    var data = root ? root.dataset : {};
    return {
      people5: finiteNumber(data.peopleTier5, 1),
      people10: finiteNumber(data.peopleTier10, 2),
      people15: finiteNumber(data.peopleTier15, 4),
      pv5: finiteNumber(data.pvTier5, 2),
      pv10: finiteNumber(data.pvTier10, 5),
      pv15: finiteNumber(data.pvTier15, 8),
      annual5: finiteNumber(data.annualTier5, 2500),
      annual10: finiteNumber(data.annualTier10, 4500),
      annual15: finiteNumber(data.annualTier15, 6500)
    };
  }

  function getTier(people, pv, annual, thresholds) {
    var peopleTier = people <= thresholds.people5 ? 5.12 : people <= thresholds.people10 ? 10.24 : people <= thresholds.people15 ? 15.36 : 30;
    var pvTier = pv <= thresholds.pv5 ? 5.12 : pv <= thresholds.pv10 ? 10.24 : pv <= thresholds.pv15 ? 15.36 : 30;
    var annualTier = annual <= thresholds.annual5 ? 5.12 : annual <= thresholds.annual10 ? 10.24 : annual <= thresholds.annual15 ? 15.36 : 30;
    return Math.max(peopleTier, pvTier, annualTier).toFixed(2).replace(/\.00$/, '');
  }

  function valuesForTier(tier) {
    if (tier === '5.12') return { people: 1, pv: 2, annual: 2500 };
    if (tier === '10.24') return { people: 2, pv: 4, annual: 4000 };
    if (tier === '30') return { people: 6, pv: 10, annual: 8000 };
    return { people: 3, pv: 6, annual: 4000 };
  }

  function findVariant(product, capacity) {
    if (!product || !Array.isArray(product.variants)) return null;
    var matches = product.variants.filter(function (variant) {
      var parsed = parseCapacity(variant.title);
      return parsed !== null && Math.abs(parsed - capacity) < 0.08;
    });
    return matches.find(function (variant) { return variant.available; }) || matches[0] || null;
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
    var tier = state.tier;
    if (tier === '5.12') return makeItem(products.venus3, 5.12, '1× VENUS E 3.0');
    if (tier === '10.24') return makeItem(products.venus3, 10.24, '2× VENUS E 3.0');
    if (tier === '30') return makeItem(products.max, 30, '3× VENUS E Max');
    return makeItem(products.venus3, 15.36, '3× VENUS E 3.0');
  }

  function alternativeForState(role) {
    if (role === 'alt4') {
      var cap4 = state.tier === '5.12' ? 5 : state.tier === '10.24' ? 10 : 15;
      return makeItem(products.venus4, cap4, (cap4 === 5 ? '1×' : cap4 === 10 ? '2×' : '3×') + ' VENUS E 4.0');
    }
    var capMax = state.tier === '5.12' ? 10 : state.tier === '30' ? 30 : 20;
    return makeItem(products.max, capMax, (capMax === 10 ? '1×' : capMax === 20 ? '2×' : '3×') + ' VENUS E Max');
  }

  function makeItem(product, capacity, title) {
    var variant = findVariant(product, capacity);
    return {
      product: product || {},
      variant: variant,
      capacity: capacity,
      title: title,
      url: product && product.url ? product.url : '',
      image: variant && variant.image
        ? variant.image
        : product && (product.featured_image || product.image)
          ? (product.featured_image || product.image)
          : '',
      available: Boolean(variant && variant.available)
    };
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
    var tier = getTier(people, pv, annual, thresholdsFrom(root));
    var hasCalculated = markCalculated ? true : state.hasCalculated;
    var changed = state.people !== people
      || state.pv !== pv
      || state.annual !== annual
      || state.tier !== tier
      || state.hasCalculated !== hasCalculated;

    if (!changed) return;

    state.people = people;
    state.pv = pv;
    state.annual = annual;
    state.tier = tier;
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

  function renderCapacity() {
    var root = getCapacityRoot();
    if (!root) return;
    var inputs = inputsFrom(root);
    Object.keys(inputs).forEach(function (key) {
      if (!inputs[key]) return;
      if (document.activeElement !== inputs[key]) inputs[key].value = state[key];
      var minimum = finiteNumber(inputs[key].min, 0);
      var maximum = finiteNumber(inputs[key].max, 100);
      var progress = maximum === minimum ? 0 : ((finiteNumber(inputs[key].value, minimum) - minimum) / (maximum - minimum)) * 100;
      inputs[key].style.setProperty('--bw-range-progress', Math.max(0, Math.min(100, progress)) + '%');
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
    setAllText(root, '[data-bw-capacity]', formatCapacity(TIER_VALUES[state.tier]));
    setText(root, '[data-bw-summary="people"]', peopleText);
    setText(root, '[data-bw-summary="pv"]', pvText);
    setText(root, '[data-bw-summary="annual"]', annualText);
    var combined = root.querySelector('[data-bw-summary]:not([data-bw-summary="people"]):not([data-bw-summary="pv"]):not([data-bw-summary="annual"])');
    if (combined) combined.textContent = peopleText + ' · ' + pvText + ' · ' + annualText;
    root.querySelectorAll('[data-bw-preset]').forEach(function (button) {
      var active = button.dataset.bwPreset === state.tier;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
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
    updateMedia(card.querySelector('[data-bw-result-media]') || card, item.image, item.title);
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
    var root = getRecommendationsRoot();
    if (!root) {
      resolvedRecommendation = null;
      renderFinalCta();
      return;
    }
    var resultsVisible = isDesignMode() || state.resultsVisible;
    root.hidden = !resultsVisible;
    if (!resultsVisible) root.dataset.bwResultsState = 'hidden';
    if (isDesignMode() && root.dataset.bwResultsState === 'hidden') root.dataset.bwResultsState = 'visible';
    syncResultsControls(root, resultsVisible);
    setAllText(root, '[data-bw-capacity-inline]', formatCapacity(TIER_VALUES[state.tier]));
    setText(root, '[data-bw-results-input-summary], [data-bw-recommendation-summary]', resultSummary());

    var primary = recommendationForState();
    var alt4 = alternativeForState('alt4');
    var altMax = alternativeForState('altmax');
    resolvedRecommendation = primary;
    renderResultCard(root, 'primary', primary);
    renderResultCard(root, 'alt4', alt4);
    renderResultCard(root, 'altmax', altMax);

    var detail = {
      tier: state.tier,
      capacityKwh: TIER_VALUES[state.tier],
      productTitle: primary.title,
      productUrl: primary.url,
      variantId: primary.variant && primary.variant.id ? primary.variant.id : null,
      available: primary.available,
      image: primary.image,
      price: primary.variant ? primary.variant.price : null,
      compareAtPrice: primary.variant ? primary.variant.compare_at_price : null
    };
    document.dispatchEvent(new CustomEvent('venus:recommendation-resolved', { detail: detail }));
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

      setAllText(root, '[data-bw-final-capacity]', formatCapacity(TIER_VALUES[state.tier]));
      setAllText(root, '[data-bw-final-product]', resolvedRecommendation.title);
      setText(root, '[data-bw-final-price]', resolvedRecommendation.variant ? formatMoney(resolvedRecommendation.variant.price) : '');
      updateMedia(root.querySelector('[data-bw-final-media]') || root, resolvedRecommendation.image, resolvedRecommendation.title);
      configureAction(root.querySelector('[data-bw-final-action]'), resolvedRecommendation, true, 'Jetzt kaufen');
    });
  }

  function emitCapacityChange() {
    var primary = resolvedRecommendation || recommendationForState();
    document.dispatchEvent(new CustomEvent('venus:capacity-change', {
      detail: {
        people: state.people,
        pvKw: state.pv,
        annualKwh: state.annual,
        tier: state.tier,
        capacityKwh: TIER_VALUES[state.tier],
        hasCalculated: state.hasCalculated,
        resultsVisible: state.resultsVisible,
        primaryVariantId: primary && primary.variant && primary.variant.id ? primary.variant.id : null
      }
    }));
  }

  function renderAll() {
    readProductData();
    renderCapacity();
    renderRecommendations();
    renderFinalCta();
    emitCapacityChange();
  }

  function bindCapacity() {
    var root = getCapacityRoot();
    if (!root || root.dataset.bwInitialized === 'true') return;
    root.dataset.bwInitialized = 'true';
    var inputs = inputsFrom(root);
    Object.keys(inputs).forEach(function (key) {
      if (!inputs[key]) return;
      inputs[key].value = state[key];
      inputs[key].addEventListener('input', function () { syncStateFromInputs(root, true); });
      inputs[key].addEventListener('change', function () { syncStateFromInputs(root, true); });
    });
    root.querySelectorAll('[data-bw-preset]').forEach(function (button) {
      button.addEventListener('click', function () {
        var values = valuesForTier(button.dataset.bwPreset);
        Object.keys(values).forEach(function (key) { if (inputs[key]) inputs[key].value = values[key]; });
        syncStateFromInputs(root, true);
      });
    });
    root.querySelectorAll('[data-bw-scroll-results]').forEach(function (button) {
      button.addEventListener('click', function () {
        syncStateFromInputs(root, true);
        state.resultsVisible = true;
        renderNow();
        var resultsRoot = getRecommendationsRoot();
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
      function activate(tab) {
        var target = tab.dataset.bwFlowTab;
        tabs.forEach(function (button) {
          var active = button === tab;
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-selected', active ? 'true' : 'false');
          button.tabIndex = active ? 0 : -1;
        });
        root.querySelectorAll('[data-bw-flow-panel]').forEach(function (panel) {
          panel.hidden = panel.dataset.bwFlowPanel !== target;
        });
      }
      tabs.forEach(function (tab, index) {
        tab.addEventListener('click', function () { activate(tab); });
        tab.addEventListener('keydown', function (event) {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          var direction = event.key === 'ArrowRight' ? 1 : -1;
          var next = tabs[(index + direction + tabs.length) % tabs.length];
          activate(next);
          next.focus();
        });
      });
      if (tabs[0]) activate(tabs.find(function (tab) { return tab.classList.contains('is-active'); }) || tabs[0]);
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

  function normalizedText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('de-DE');
  }

  function prepareHomepageProductSync(mount) {
    if (!mount || !mount.matches('[data-bw-homepage-product-sync]')) return;
    var category = normalizedText(mount.dataset.bwSourceCategory);

    mount.querySelectorAll('[class*="ai-carousel-header-"], [class*="ai-tab-nav-"], [class*="ai-cta-card-"]').forEach(function (node) {
      node.hidden = true;
    });

    var units = Array.prototype.slice.call(mount.querySelectorAll('.venus-category-unit'));
    if (units.length) {
      var selectedUnit = units.find(function (unit) {
        var tab = unit.querySelector('.venus-category-tab');
        var label = normalizedText(tab && tab.textContent);
        return category && (label.indexOf(category) !== -1 || category.indexOf(label) !== -1);
      }) || units[0];
      var selectedUnitTab = selectedUnit.querySelector('.venus-category-tab');
      if (selectedUnitTab && typeof selectedUnitTab.click === 'function') selectedUnitTab.click();
      units.forEach(function (unit) {
        var selected = unit === selectedUnit;
        unit.hidden = !selected;
        var tab = unit.querySelector('.venus-category-tab');
        var panel = unit.querySelector('.venus-category-panel, [data-tab-content]');
        if (tab) tab.hidden = true;
        if (panel) {
          panel.hidden = !selected;
          panel.classList.toggle('active', selected);
          if (selected) panel.style.removeProperty('display');
        }
      });
    } else {
      var tabs = Array.prototype.slice.call(mount.querySelectorAll('[data-tab]'));
      var selectedTab = tabs.find(function (tab) {
        var label = normalizedText(tab.textContent);
        return category && (label.indexOf(category) !== -1 || category.indexOf(label) !== -1);
      });
      if (selectedTab) {
        if (typeof selectedTab.click === 'function') selectedTab.click();
        var selectedKey = selectedTab.dataset.tab;
        mount.querySelectorAll('[data-tab-content]').forEach(function (panel) {
          var selected = panel.dataset.tabContent === selectedKey;
          panel.hidden = !selected;
          panel.classList.toggle('active', selected);
        });
      }
    }
    mount.dataset.bwSyncReady = 'true';
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
        prepareHomepageProductSync(mount);
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
    var links = Array.prototype.slice.call(nav.querySelectorAll('[data-bw-anchor-link]'));
    var targets = [];
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
      var isCta = link.classList.contains('bw-anchor-nav__cta');
      link.hidden = (!target || target.hidden) && !isCta;
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
            if (link.classList.contains('bw-anchor-nav__link')) {
              link.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
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
