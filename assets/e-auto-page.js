(function () {
  'use strict';

  if (window.__eAutoPageInstalled) {
    document.dispatchEvent(new CustomEvent('venus:eauto-rescan'));
    return;
  }
  window.__eAutoPageInstalled = true;

  var CONFIG = {
    distance: {
      under20: { label: 'Unter 20 km', min: 2, max: 5 },
      '20to40': { label: '20–40 km', min: 5, max: 8 },
      '40to80': { label: '40–80 km', min: 10, max: 15 },
      over80: { label: 'Über 80 km', min: 20, max: 28 }
    },
    efficiencyCorrection: {
      efficient: 0,
      average: 1,
      high: 2
    },
    pvLimit: {
      low: 5,
      medium: 10,
      high: 30
    },
    chargeCorrection: {
      evening: 0,
      daytime: -2
    }
  };

  var PRODUCT_CONFIG = {
    mini: {
      family: 'Mini',
      capacities: [
        { kwh: 2, quantity: 1 },
        { kwh: 4, quantity: 2 },
        { kwh: 6, quantity: 3 }
      ]
    },
    venus3: {
      family: '3.0',
      capacities: [
        { kwh: 5.12, quantity: 1 },
        { kwh: 10.24, quantity: 2 },
        { kwh: 15.36, quantity: 3 }
      ]
    },
    venus4: {
      family: '4.0',
      capacities: [
        { kwh: 5, quantity: 1 },
        { kwh: 10, quantity: 2 },
        { kwh: 15, quantity: 3 }
      ]
    },
    max: {
      family: 'Max',
      capacities: [
        { kwh: 10, quantity: 1 },
        { kwh: 20, quantity: 2 },
        { kwh: 30, quantity: 3 }
      ]
    }
  };

  var DEFAULT_STATE = {
    distance: 'under20',
    efficiency: 'efficient',
    pv: 'medium',
    chargeWindow: 'evening'
  };
  var navigationObserver = null;

  function parseNumber(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function formatCapacity(value, unit) {
    var number = parseNumber(value, 0);
    return (number % 1 ? number.toFixed(2) : number.toFixed(0)).replace('.', ',') + ' ' + (unit || 'kWh');
  }

  function formatRange(lower, upper, unit) {
    return String(lower).replace('.', ',') + '–' + String(upper).replace('.', ',') + ' ' + (unit || 'kWh');
  }

  function formatMoney(cents) {
    var currency = window.Shopify && window.Shopify.currency && window.Shopify.currency.active
      ? window.Shopify.currency.active
      : 'EUR';
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency }).format(parseNumber(cents, 0) / 100);
  }

  function roundCapacityUpper(value) {
    return Math.min(30, Math.max(5, Math.ceil(parseNumber(value, 0) / 5) * 5));
  }

  function calculateCapacity(selection) {
    var distance = CONFIG.distance[selection.distance] || CONFIG.distance.under20;
    var efficiencyDelta = CONFIG.efficiencyCorrection[selection.efficiency] || 0;
    var chargeDelta = CONFIG.chargeCorrection[selection.chargeWindow] || 0;
    var pvLimit = CONFIG.pvLimit[selection.pv] || CONFIG.pvLimit.medium;
    var rawLower = Math.max(2, distance.min + chargeDelta);
    var rawUpper = distance.max + efficiencyDelta + chargeDelta;
    var lower = Math.min(rawLower, pvLimit);
    var upper = Math.min(roundCapacityUpper(rawUpper), pvLimit);

    if (upper < lower) upper = lower;

    return {
      lower: lower,
      upper: upper,
      distanceLabel: distance.label,
      pvLimit: pvLimit,
      rawLower: rawLower,
      rawUpper: rawUpper
    };
  }

  function parseCapacityFromText(value) {
    var match = String(value || '').match(/(\d+(?:[,.]\d+)?)\s*kWh/i);
    return match ? parseFloat(match[1].replace(',', '.')) : null;
  }

  function findVariant(product, capacity) {
    if (!product || !Array.isArray(product.variants)) return null;
    return product.variants.find(function (variant) {
      var variantText = [variant.title, Array.isArray(variant.options) ? variant.options.join(' ') : variant.options].join(' ');
      var parsed = parseCapacityFromText(variantText);
      return parsed !== null && Math.abs(parsed - capacity) < 0.08;
    }) || null;
  }

  function readProductData(root) {
    var node = root.querySelector('[data-eauto-product-data]');
    if (!node) return {};
    try {
      return JSON.parse(node.textContent) || {};
    } catch (error) {
      return {};
    }
  }

  function readPageMarker() {
    return document.querySelector('[data-eauto-page]') || document.documentElement;
  }

  function readCalculatorSettings(root) {
    var calculator = root.querySelector('[data-eauto-calculator]');
    return calculator ? calculator.dataset : {};
  }

  function readDataValue(dataset, key, fallback) {
    return Object.prototype.hasOwnProperty.call(dataset, key) ? dataset[key] : fallback;
  }

  function interpolateTemplate(template, values) {
    var allowedTokens = /\{\{\s*(product_title|product_capacity|range|lower|upper|unit)\s*\}\}/g;
    return String(template || '').replace(allowedTokens, function (match, token) {
      return values[token] === undefined || values[token] === null ? '' : String(values[token]);
    });
  }

  function prefersReducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function scrollToElement(element) {
    if (!element) return;
    element.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start'
    });
  }

  function setActiveAnchor(links, targetId, navScroller) {
    links.forEach(function (link) {
      var active = link.getAttribute('href') === '#' + targetId;
      link.classList.toggle('is-active', active);
      if (active) {
        link.setAttribute('aria-current', 'location');
        if (navScroller && link.classList.contains('bw-anchor-nav__link')) {
          var scrollerRect = navScroller.getBoundingClientRect();
          var linkRect = link.getBoundingClientRect();
          if (linkRect.left < scrollerRect.left) {
            navScroller.scrollLeft -= scrollerRect.left - linkRect.left;
          } else if (linkRect.right > scrollerRect.right) {
            navScroller.scrollLeft += linkRect.right - scrollerRect.right;
          }
        }
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  function bindAnchorLinks() {
    document.querySelectorAll('[data-eauto-anchor-link]').forEach(function (link) {
      if (link.dataset.eautoAnchorInitialized === 'true') return;
      link.dataset.eautoAnchorInitialized = 'true';
      link.addEventListener('click', function (event) {
        var href = link.getAttribute('href');
        if (!href || href.charAt(0) !== '#') return;
        var target = document.getElementById(href.slice(1));
        if (!target) return;
        event.preventDefault();
        scrollToElement(target);
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', href);
        }
        var nav = link.closest('[data-eauto-anchor-nav]');
        var navLinks = nav
          ? Array.prototype.slice.call(nav.querySelectorAll('[data-eauto-anchor-link]'))
          : [link];
        setActiveAnchor(navLinks, href.slice(1), link.closest('.bw-anchor-nav__inner'));
      });
    });
  }

  function refreshAnchorNavigation() {
    if (navigationObserver) {
      navigationObserver.disconnect();
      navigationObserver = null;
    }

    var nav = document.querySelector('[data-eauto-anchor-nav]');
    if (!nav) return;

    var navScroller = nav.querySelector('.bw-anchor-nav__inner');
    var links = Array.prototype.slice.call(nav.querySelectorAll('[data-eauto-anchor-link]'));
    var targets = [];

    links.forEach(function (link) {
      var href = link.getAttribute('href');
      var target = href && href.charAt(0) === '#' ? document.getElementById(href.slice(1)) : null;
      var targetExists = Boolean(target && !target.hidden && target.getClientRects().length);
      link.hidden = !targetExists;

      if (!targetExists) {
        link.classList.remove('is-active');
        link.removeAttribute('aria-current');
        return;
      }

      if (!targets.includes(target)) targets.push(target);
    });

    if (!('IntersectionObserver' in window) || !targets.length) return;

    navigationObserver = new IntersectionObserver(function (entries) {
      var visibleEntries = entries.filter(function (entry) { return entry.isIntersecting; });
      if (!visibleEntries.length) return;
      visibleEntries.sort(function (a, b) {
        return Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top);
      });
      setActiveAnchor(links, visibleEntries[0].target.id, navScroller);
    }, { rootMargin: '-25% 0px -65% 0px', threshold: 0 });

    targets.forEach(function (target) { navigationObserver.observe(target); });
  }

  function familyOrderFor(result) {
    if (result.upper <= 6) return ['mini', 'venus3', 'venus4', 'max'];
    if (result.lower >= 20) return ['max', 'venus3', 'venus4', 'mini'];
    return ['venus3', 'venus4', 'max', 'mini'];
  }

  function buildCandidate(productKey, capacityConfig, products) {
    var product = products[productKey] || {};
    var variant = findVariant(product, capacityConfig.kwh);
    var productConfig = PRODUCT_CONFIG[productKey];
    return {
      productKey: productKey,
      family: productConfig.family,
      capacity: capacityConfig.kwh,
      quantity: capacityConfig.quantity,
      product: product,
      variant: variant,
      title: product.title || ('VENUS E ' + productConfig.family),
      image: variant && variant.image ? variant.image : product.featured_image || '',
      url: variant && variant.url ? variant.url : product.url || '',
      available: Boolean(variant && variant.available),
      preorder: Boolean(variant && product.preorder_enabled)
    };
  }

  function allCandidates(products) {
    var candidates = [];
    Object.keys(PRODUCT_CONFIG).forEach(function (productKey) {
      PRODUCT_CONFIG[productKey].capacities.forEach(function (capacityConfig) {
        candidates.push(buildCandidate(productKey, capacityConfig, products));
      });
    });
    return candidates;
  }

  function candidateDistance(candidate, result) {
    if (candidate.capacity < result.lower) return result.lower - candidate.capacity;
    if (candidate.capacity > result.upper) return candidate.capacity - result.upper;
    return 0;
  }

  function selectRecommendations(result, products) {
    var order = familyOrderFor(result);
    var priority = {};
    order.forEach(function (productKey, index) { priority[productKey] = index; });
    var candidates = allCandidates(products);
    var eligible = candidates.filter(function (candidate) {
      return result.upper <= 6 || candidate.productKey !== 'mini';
    });
    var inRange = eligible.filter(function (candidate) {
      return candidate.capacity >= result.lower - 0.25 && candidate.capacity <= result.upper + 0.25;
    });
    var selected = [];

    function addFirstForFamily(productKey) {
      var familyCandidate = inRange
        .filter(function (candidate) { return candidate.productKey === productKey; })
        .sort(function (a, b) { return a.capacity - b.capacity; })[0];
      if (familyCandidate && !selected.some(function (item) { return item.productKey === familyCandidate.productKey; })) {
        selected.push(familyCandidate);
      }
    }

    if (result.lower >= 20) {
      inRange
        .filter(function (candidate) { return candidate.productKey === 'max'; })
        .sort(function (a, b) { return a.capacity - b.capacity; })
        .forEach(function (candidate) {
          if (selected.length < 2) selected.push(candidate);
        });
      order.slice(1).forEach(addFirstForFamily);
    } else {
      order.forEach(addFirstForFamily);
    }

    var fallbackCandidates = eligible.slice().sort(function (a, b) {
      var distanceDifference = candidateDistance(a, result) - candidateDistance(b, result);
      if (distanceDifference !== 0) return distanceDifference;
      var priorityDifference = priority[a.productKey] - priority[b.productKey];
      if (priorityDifference !== 0) return priorityDifference;
      return a.capacity - b.capacity;
    });

    fallbackCandidates.forEach(function (candidate) {
      if (selected.length >= 3) return;
      if (!selected.some(function (item) { return item.productKey === candidate.productKey && item.capacity === candidate.capacity; })) {
        selected.push(candidate);
      }
    });

    return selected.slice(0, 3);
  }

  function productVariantUrl(item) {
    if (item.variant && item.variant.url) return item.variant.url;
    return item.url || '#';
  }

  function setText(root, selector, value) {
    var node = root.querySelector(selector);
    if (node) node.textContent = value;
  }

  function renderCard(root, index, item, copy, unit) {
    var card = root.querySelector('[data-eauto-card="' + index + '"]');
    if (!card) return;

    var productUrl = productVariantUrl(item);
    var title = (item.quantity > 1 ? item.quantity + '× ' : '') + item.title;
    var image = card.querySelector('[data-eauto-card-image]');
    var placeholder = card.querySelector('[data-eauto-card-placeholder]');
    var titleLink = card.querySelector('[data-eauto-card-title-link]');
    var mediaLink = card.querySelector('[data-eauto-card-link]');
    var action = card.querySelector('[data-eauto-card-action]');

    setText(card, '[data-eauto-card-title]', title);
    setText(card, '[data-eauto-card-variant]', item.variant ? item.variant.title : copy.variantUnavailableLabel);
    setText(card, '[data-eauto-card-capacity]', formatCapacity(item.capacity, unit));
    setText(card, '[data-eauto-card-price]', item.variant ? formatMoney(item.variant.price) : '—');

    var availability = item.preorder
      ? copy.preorderLabel
      : item.available
        ? copy.availableLabel
        : copy.unavailableLabel;
    setText(card, '[data-eauto-card-availability]', availability);
    setText(card, '[data-eauto-card-badge]', index === 0 ? copy.primaryLabel : copy.alternativeLabel);

    if (item.image) {
      image.src = item.image;
      image.alt = title;
      image.hidden = false;
      placeholder.hidden = true;
    } else {
      image.hidden = true;
      placeholder.hidden = false;
    }

    [titleLink, mediaLink, action].forEach(function (link) {
      if (!link) return;
      link.href = productUrl;
      link.removeAttribute('aria-disabled');
    });

    if (!item.url) {
      [titleLink, mediaLink, action].forEach(function (link) {
        if (!link) return;
        link.href = '#';
        link.setAttribute('aria-disabled', 'true');
      });
    }

    card.classList.toggle('is-unavailable', !item.available && !item.preorder);
    card.classList.toggle('is-preorder', item.preorder);
  }

  function render(root, state, products) {
    var result = calculateCapacity(state);
    var recommendations = selectRecommendations(result, products);
    var primary = recommendations[0];
    var pageMarker = readPageMarker();
    var calculatorSettings = readCalculatorSettings(root);
    var unit = calculatorSettings.eautoCapacityUnit || 'kWh';
    var range = formatRange(result.lower, result.upper, unit);
    var copy = {
      availableLabel: readDataValue(pageMarker.dataset, 'eautoAvailableLabel', 'Verfügbar'),
      unavailableLabel: readDataValue(pageMarker.dataset, 'eautoUnavailableLabel', 'Derzeit nicht verfügbar'),
      preorderLabel: readDataValue(pageMarker.dataset, 'eautoPreorderLabel', 'Demnächst verfügbar'),
      variantUnavailableLabel: readDataValue(pageMarker.dataset, 'eautoVariantUnavailableLabel', 'Variante nicht gefunden'),
      primaryLabel: readDataValue(pageMarker.dataset, 'eautoPrimaryLabel', 'EMPFOHLENE KONFIGURATION'),
      alternativeLabel: readDataValue(pageMarker.dataset, 'eautoAlternativeLabel', 'ALTERNATIVE KONFIGURATION'),
      summaryTemplate: readDataValue(pageMarker.dataset, 'eautoSummaryTemplate', 'Kapazitätsbereich: {{range}}. Preise und Verfügbarkeit werden direkt aus Shopify geladen.')
    };
    var templateValues = {
      product_title: primary ? primary.title : '',
      product_capacity: primary ? formatCapacity(primary.capacity, unit) : '',
      range: range,
      lower: String(result.lower).replace('.', ','),
      upper: String(result.upper).replace('.', ','),
      unit: unit
    };

    setText(root, '[data-eauto-result-range]', range);
    setText(root, '[data-eauto-recommendations-summary]', interpolateTemplate(copy.summaryTemplate, templateValues));

    if (primary) {
      setText(root, '[data-eauto-result-model]', interpolateTemplate(
        readDataValue(calculatorSettings, 'eautoResultModelTemplate', 'Passt zu {{product_title}}'),
        templateValues
      ));
      setText(root, '[data-eauto-result-copy]', interpolateTemplate(
        readDataValue(calculatorSettings, 'eautoResultCopyTemplate', 'Mit deiner Auswahl liegt der sinnvolle Orientierungsbereich bei {{range}}.'),
        templateValues
      ));
    }

    for (var index = 0; index < 3; index += 1) {
      var item = recommendations[index] || buildCandidate('mini', PRODUCT_CONFIG.mini.capacities[0], products);
      renderCard(root, index, item, copy, unit);
    }
  }

  function bindOptions(root, state, products) {
    root.querySelectorAll('[data-eauto-option]').forEach(function (button) {
      if (button.dataset.eautoBound === 'true') return;
      button.dataset.eautoBound = 'true';
      button.addEventListener('click', function () {
        var group = button.closest('[data-eauto-option-group]');
        if (!group) return;
        var groupName = group.dataset.eautoOptionGroup;
        state[groupName] = button.dataset.eautoValue;
        group.querySelectorAll('[data-eauto-option]').forEach(function (option) {
          var active = option === button;
          option.classList.toggle('is-active', active);
          option.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        render(root, state, products);
      });
    });
  }

  function bindFlow(root) {
    root.querySelectorAll('[data-eauto-flow-toggle]').forEach(function (button) {
      if (button.dataset.eautoBound === 'true') return;
      button.dataset.eautoBound = 'true';
      button.addEventListener('click', function () {
        var mode = button.dataset.eautoFlowToggle;
        root.querySelectorAll('[data-eauto-flow-toggle]').forEach(function (toggle) {
          var active = toggle === button;
          toggle.classList.toggle('is-active', active);
          toggle.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        root.querySelectorAll('[data-eauto-flow-panel]').forEach(function (panel) {
          var active = panel.dataset.eautoFlowPanel === mode;
          panel.hidden = !active;
          panel.classList.toggle('is-active', active);
        });
      });
    });
  }

  function bindProfiles(root) {
    root.querySelectorAll('[data-eauto-profile-tab]').forEach(function (button) {
      if (button.dataset.eautoBound === 'true') return;
      button.dataset.eautoBound = 'true';
      button.addEventListener('click', function () {
        var profileId = button.dataset.eautoProfileTab;
        root.querySelectorAll('[data-eauto-profile-tab]').forEach(function (tab) {
          var active = tab === button;
          tab.classList.toggle('is-active', active);
          tab.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        root.querySelectorAll('[data-eauto-profile-panel]').forEach(function (panel) {
          var active = panel.dataset.eautoProfilePanel === profileId;
          panel.hidden = !active;
          panel.classList.toggle('is-active', active);
        });
      });
    });
  }

  function bindFaq(root) {
    root.querySelectorAll('[data-eauto-faq-question]').forEach(function (button) {
      if (button.dataset.eautoBound === 'true') return;
      button.dataset.eautoBound = 'true';
      button.addEventListener('click', function () {
        var answer = button.parentElement && button.parentElement.querySelector('[data-eauto-faq-answer]');
        var wasOpen = button.getAttribute('aria-expanded') === 'true';
        root.querySelectorAll('[data-eauto-faq-question]').forEach(function (question) {
          question.setAttribute('aria-expanded', 'false');
        });
        root.querySelectorAll('[data-eauto-faq-answer]').forEach(function (panel) {
          panel.hidden = true;
        });
        if (!wasOpen && answer) {
          button.setAttribute('aria-expanded', 'true');
          answer.hidden = false;
        }
      });
    });
  }

  function boot() {
    var pageMarker = document.querySelector('[data-eauto-page]');
    if (!pageMarker) return;
    var root = document;
    var state = window.__eAutoState || Object.assign({}, DEFAULT_STATE);
    var products = readProductData(root);
    window.__eAutoState = state;
    bindAnchorLinks();
    refreshAnchorNavigation();
    bindOptions(root, state, products);
    bindFlow(root);
    bindProfiles(root);
    bindFaq(root);
    render(root, state, products);
  }

  window.theme = window.theme || {};
  window.theme.eAutoCalculator = {
    calculateCapacity: calculateCapacity,
    selectRecommendations: selectRecommendations
  };

  document.addEventListener('venus:eauto-rescan', boot);
  document.addEventListener('shopify:section:load', function () { window.setTimeout(boot, 0); });
  document.addEventListener('shopify:section:unload', function () { window.setTimeout(boot, 0); });
  document.addEventListener('shopify:section:reorder', function () { window.setTimeout(boot, 0); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
