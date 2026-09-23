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

  var CAPACITY_RULES = {
    distanceKm: {
      under20: 15,
      '20to40': 30,
      '40to80': 60,
      over80: 100
    },
    consumptionKwhPer100Km: {
      efficient: 16,
      average: 19,
      high: 24
    },
    noPvValues: ['low'],
    daytimeValue: 'daytime',
    step: 2.5,
    lowerCoverage: 0.8,
    upperCoverage: 1.6,
    upperBuffer: 2,
    maxCapacity: 30
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

  var PRODUCT_COPY = {
    mini: {
      title: 'VENUS E Mini',
      badge: 'KOMPAKT & EINSTEIGER',
      capacityRange: '2 – 6 kWh',
      description: 'Für kurze Strecken und wenig Fahrleistung – speichert den Tagesüberschuss für die ersten Abendstunden.',
      ctaLabel: 'VENUS E Mini ansehen →'
    },
    venus3: {
      title: 'VENUS E 3.0',
      badge: 'FLEXIBEL & ERWEITERBAR',
      capacityRange: '5,12 – 15,36 kWh',
      description: 'Modular erweiterbar – wächst mit deinem Fahrprofil und deinem Haushalt mit.',
      ctaLabel: 'VENUS E 3.0 ansehen →'
    },
    venus4: {
      title: 'VENUS E 4.0',
      badge: 'EMPFOHLEN FÜR E-AUTO',
      capacityRange: '5 – 15 kWh',
      description: 'Der Ausgleich zwischen Tagesüberschuss und Abend-Laden – die häufigste Konfiguration für Pendler.',
      ctaLabel: 'VENUS E 4.0 ansehen →'
    }
  };

  var DEFAULT_STATE = {
    distance: 'under20',
    efficiency: 'efficient',
    pv: 'medium',
    chargeWindow: 'evening'
  };
  var navigationScrollHandler = null;
  var navigationResizeHandler = null;

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

  function roundUpToStep(value, step) {
    return Math.ceil(parseNumber(value, 0) / step) * step;
  }

  function calculateCapacity(selection) {
    var distance = CONFIG.distance[selection.distance] || CONFIG.distance.under20;
    var km = CAPACITY_RULES.distanceKm[selection.distance] || CAPACITY_RULES.distanceKm.under20;
    var verbrauch = CAPACITY_RULES.consumptionKwhPer100Km[selection.efficiency] || CAPACITY_RULES.consumptionKwhPer100Km.average;
    var dailyKwh = km * verbrauch / 100;
    var rawLower = dailyKwh * CAPACITY_RULES.lowerCoverage;
    var rawUpper = dailyKwh * CAPACITY_RULES.upperCoverage + CAPACITY_RULES.upperBuffer;
    var lower = Math.max(5, roundUpToStep(rawLower, CAPACITY_RULES.step));
    var upper = Math.min(CAPACITY_RULES.maxCapacity, Math.max(5, roundUpToStep(rawUpper, CAPACITY_RULES.step)));

    if (selection.chargeWindow === CAPACITY_RULES.daytimeValue) {
      lower = Math.max(5, lower * 0.6);
    }

    if (CAPACITY_RULES.noPvValues.indexOf(selection.pv) !== -1) {
      lower = Math.max(10, lower);
      upper = Math.max(15, upper);
    }

    upper = Math.min(CAPACITY_RULES.maxCapacity, upper);
    if (upper <= lower && lower < CAPACITY_RULES.maxCapacity) {
      upper = Math.min(CAPACITY_RULES.maxCapacity, lower + 5);
    }

    return {
      lower: lower,
      upper: upper,
      distanceLabel: distance.label,
      dailyKwh: dailyKwh,
      verbrauch: verbrauch,
      pv: selection.pv,
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
    var allowedTokens = /\{\{\s*(product_title|product_capacity|range|lower|upper|unit)\s*\}\}|\[\[\s*(product_title|product_capacity|range|lower|upper|unit)\s*\]\]/g;
    return String(template || '').replace(allowedTokens, function (match, liquidToken, bracketToken) {
      var token = liquidToken || bracketToken;
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
    if (navigationScrollHandler) {
      window.removeEventListener('scroll', navigationScrollHandler);
      navigationScrollHandler = null;
    }
    if (navigationResizeHandler) {
      window.removeEventListener('resize', navigationResizeHandler);
      navigationResizeHandler = null;
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

    if (!targets.length) return;

    var scheduled = false;
    function updateActiveAnchor() {
      scheduled = false;

      var navBottom = nav.getBoundingClientRect().bottom;
      var activationLine = Math.max(0, navBottom) + 36;
      var activeTarget = targets[0];

      targets.forEach(function (target) {
        if (target.getBoundingClientRect().top <= activationLine) activeTarget = target;
      });

      setActiveAnchor(links, activeTarget.id, navScroller);
    }

    function scheduleActiveAnchorUpdate() {
      if (scheduled) return;
      scheduled = true;
      if (window.requestAnimationFrame) window.requestAnimationFrame(updateActiveAnchor);
      else window.setTimeout(updateActiveAnchor, 0);
    }

    navigationScrollHandler = scheduleActiveAnchorUpdate;
    navigationResizeHandler = scheduleActiveAnchorUpdate;
    window.addEventListener('scroll', navigationScrollHandler, { passive: true });
    window.addEventListener('resize', navigationResizeHandler);
    updateActiveAnchor();
  }

  function familyOrderFor(result) {
    if (result.upper <= 6) return ['mini', 'venus3', 'venus4', 'max'];
    if (result.lower >= 20) return ['max', 'venus3', 'venus4', 'mini'];
    return ['venus3', 'venus4', 'max', 'mini'];
  }

  function recommendedFamily(result) {
    var midpoint = (result.lower + result.upper) / 2;
    if (midpoint <= 6) return 'mini';
    if (midpoint <= 8.5) return 'venus3';
    if (midpoint <= 15) return 'venus4';
    return 'max';
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
    var candidates = allCandidates(products);
    var modelOrder = ['mini', 'venus3', 'venus4', 'max'];
    var primaryFamily = recommendedFamily(result);
    var midpoint = (result.lower + result.upper) / 2;

    function nearestForFamily(productKey) {
      return candidates
        .filter(function (candidate) { return candidate.productKey === productKey; })
        .sort(function (a, b) {
          var midpointDifference = Math.abs(a.capacity - midpoint) - Math.abs(b.capacity - midpoint);
          if (midpointDifference !== 0) return midpointDifference;
          return a.capacity - b.capacity;
        })[0];
    }

    var primary = nearestForFamily(primaryFamily);
    if (!primary) return candidates.slice(0, 3);

    var alternatives = modelOrder
      .filter(function (productKey) { return productKey !== primaryFamily; })
      .sort(function (a, b) {
        return Math.abs(modelOrder.indexOf(a) - modelOrder.indexOf(primaryFamily))
          - Math.abs(modelOrder.indexOf(b) - modelOrder.indexOf(primaryFamily));
      })
      .map(nearestForFamily)
      .filter(Boolean)
      .slice(0, 2);

    return [primary].concat(alternatives);
  }

  function productVariantUrl(item) {
    if (item.variant && item.variant.url) return item.variant.url;
    return item.url || '/collections/alle-venus-e-serie';
  }

  function setText(root, selector, value) {
    var node = root.querySelector(selector);
    if (node) node.textContent = value;
  }

  function readCardOverrides(card) {
    var dataset = card ? card.dataset : {};
    return {
      badge: dataset.eautoCardBadgeOverride || '',
      title: dataset.eautoCardTitleOverride || '',
      variant: dataset.eautoCardVariantOverride || '',
      capacity: dataset.eautoCardCapacityOverride || '',
      price: dataset.eautoCardPriceOverride || '',
      availability: dataset.eautoCardAvailabilityOverride || '',
      ctaLabel: dataset.eautoCardCtaLabelOverride || '',
      ctaLink: dataset.eautoCardCtaLinkOverride || ''
    };
  }

  function renderCard(root, index, item, copy, unit) {
    var card = root.querySelector('[data-eauto-card="' + index + '"]');
    if (!card) return;

    var overrides = readCardOverrides(card);
    var productUrl = productVariantUrl(item);
    var title = (item.quantity > 1 ? item.quantity + '× ' : '') + item.title;
    var productCopy = PRODUCT_COPY[item.productKey] || {};
    var renderedTitle = overrides.title || productCopy.title || title;
    var image = card.querySelector('[data-eauto-card-image]');
    var placeholder = card.querySelector('[data-eauto-card-placeholder]');
    var titleLink = card.querySelector('[data-eauto-card-title-link]');
    var mediaLink = card.querySelector('[data-eauto-card-link]');
    var action = card.querySelector('[data-eauto-card-action]');
    var actionUrl = overrides.ctaLink || productUrl;
    setText(card, '[data-eauto-card-title]', renderedTitle);
    setText(card, '[data-eauto-card-variant]', overrides.variant || (item.variant ? item.variant.title : copy.variantUnavailableLabel));
    setText(card, '[data-eauto-card-capacity]', overrides.capacity || productCopy.capacityRange || formatCapacity(item.capacity, unit));
    var description = card.querySelector('[data-eauto-card-description]');
    if (description) {
      description.textContent = productCopy.description || '';
      description.hidden = !productCopy.description;
    }
    setText(card, '[data-eauto-card-price]', overrides.price || (item.variant ? formatMoney(item.variant.price) : '—'));

    var availability = item.preorder
      ? copy.preorderLabel
      : item.available
        ? copy.availableLabel
        : copy.unavailableLabel;
    setText(card, '[data-eauto-card-availability]', overrides.availability || availability);
    setText(card, '[data-eauto-card-badge]', overrides.badge || productCopy.badge || (index === 0 ? copy.primaryLabel : copy.alternativeLabel));
    setText(card, '[data-eauto-card-action]', overrides.ctaLabel || productCopy.ctaLabel || card.dataset.eautoCardDefaultCtaLabel || '');

    if (item.image) {
      image.src = item.image;
      image.alt = renderedTitle;
      image.hidden = false;
      placeholder.hidden = true;
    } else {
      image.hidden = true;
      placeholder.hidden = false;
    }

    [titleLink, mediaLink].forEach(function (link) {
      if (!link) return;
      link.href = productUrl;
      link.removeAttribute('aria-disabled');
    });
    if (action) {
      action.href = actionUrl;
      action.removeAttribute('aria-disabled');
    }

    if (!item.url) {
      [titleLink, mediaLink].forEach(function (link) {
        if (!link) return;
        link.href = '/collections/alle-venus-e-serie';
        link.setAttribute('aria-disabled', 'true');
      });
    }
    if (!actionUrl && action) {
      action.href = '/collections/alle-venus-e-serie';
      action.setAttribute('aria-disabled', 'true');
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
      summaryTemplate: readDataValue(pageMarker.dataset, 'eautoSummaryTemplate', 'Kapazitätsbereich: [[range]]. Preise und Verfügbarkeit werden direkt aus Shopify geladen.')
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
        readDataValue(calculatorSettings, 'eautoResultModelTemplate', 'Passt zu [[product_title]]'),
        templateValues
      ));
      setText(root, '[data-eauto-result-copy]', interpolateTemplate(
        readDataValue(calculatorSettings, 'eautoResultCopyTemplate', 'Mit deiner Auswahl liegt der sinnvolle Orientierungsbereich bei [[range]].'),
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
    var buttons = Array.prototype.slice.call(root.querySelectorAll('[data-eauto-flow-toggle]'));

    function renderFlow(mode) {
      buttons.forEach(function (toggle) {
        var active = toggle.dataset.eautoFlowToggle === mode;
        toggle.classList.toggle('is-active', active);
        toggle.setAttribute('aria-selected', active ? 'true' : 'false');
        toggle.tabIndex = active ? 0 : -1;
      });
      root.querySelectorAll('[data-eauto-flow-panel]').forEach(function (panel) {
        var active = panel.dataset.eautoFlowPanel === mode;
        panel.hidden = !active;
        panel.classList.toggle('is-active', active);
        panel.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
    }

    buttons.forEach(function (button, index) {
      if (button.dataset.eautoBound === 'true') return;
      button.dataset.eautoBound = 'true';
      button.addEventListener('click', function () {
        renderFlow(button.dataset.eautoFlowToggle);
      });
      button.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        var direction = event.key === 'ArrowRight' ? 1 : -1;
        var next = buttons[(index + direction + buttons.length) % buttons.length];
        renderFlow(next.dataset.eautoFlowToggle);
        next.focus();
      });
    });

    if (buttons.length) {
      var activeButton = buttons.find(function (button) { return button.getAttribute('aria-selected') === 'true'; }) || buttons[0];
      renderFlow(activeButton.dataset.eautoFlowToggle);
    }
  }

  function bindProfiles(root) {
    var buttons = Array.prototype.slice.call(root.querySelectorAll('[data-eauto-profile-tab]'));

    function renderProfile(profileId) {
      buttons.forEach(function (tab) {
        var active = tab.dataset.eautoProfileTab === profileId;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        tab.tabIndex = active ? 0 : -1;
      });
      root.querySelectorAll('[data-eauto-profile-panel]').forEach(function (panel) {
        var active = panel.dataset.eautoProfilePanel === profileId;
        panel.hidden = !active;
        panel.classList.toggle('is-active', active);
        panel.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
    }

    buttons.forEach(function (button, index) {
      if (button.dataset.eautoBound === 'true') return;
      button.dataset.eautoBound = 'true';
      button.addEventListener('click', function () {
        renderProfile(button.dataset.eautoProfileTab);
      });
      button.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        var direction = event.key === 'ArrowRight' ? 1 : -1;
        var next = buttons[(index + direction + buttons.length) % buttons.length];
        renderProfile(next.dataset.eautoProfileTab);
        next.focus();
      });
    });

    if (buttons.length) {
      var activeButton = buttons.find(function (button) { return button.getAttribute('aria-selected') === 'true'; }) || buttons[0];
      renderProfile(activeButton.dataset.eautoProfileTab);
    }
  }

  function bindFaq(root) {
    function getAnswer(question) {
      var answerId = question.getAttribute('aria-controls');
      var answer = answerId ? document.getElementById(answerId) : null;
      return answer || (question.parentElement && question.parentElement.querySelector('[data-eauto-faq-answer]'));
    }

    function scheduleFrame(callback) {
      if (window.requestAnimationFrame) window.requestAnimationFrame(callback);
      else window.setTimeout(callback, 0);
    }

    function closeAnswer(question, answer) {
      question.setAttribute('aria-expanded', 'false');
      var item = question.closest('.e-auto-page__faq-item');
      if (item) item.classList.remove('is-open');
      if (!answer) return;

      answer.classList.remove('is-open');
      answer.setAttribute('aria-hidden', 'true');
      answer.style.maxHeight = '0px';
      answer.style.opacity = '0';
      if (answer._eAutoFaqHideTimer) window.clearTimeout(answer._eAutoFaqHideTimer);
      answer._eAutoFaqHideTimer = window.setTimeout(function () {
        if (!answer.classList.contains('is-open')) answer.hidden = true;
      }, 340);
    }

    function openAnswer(question, answer) {
      if (!answer) return;

      if (answer._eAutoFaqHideTimer) window.clearTimeout(answer._eAutoFaqHideTimer);
      question.setAttribute('aria-expanded', 'true');
      var item = question.closest('.e-auto-page__faq-item');
      if (item) item.classList.add('is-open');
      answer.hidden = false;
      answer.classList.add('is-open');
      answer.setAttribute('aria-hidden', 'false');
      answer.style.maxHeight = '0px';
      answer.style.opacity = '0';
      scheduleFrame(function () {
        if (question.getAttribute('aria-expanded') === 'true') {
          answer.style.maxHeight = answer.scrollHeight + 'px';
          answer.style.opacity = '1';
        }
      });
    }

    root.querySelectorAll('[data-eauto-faq-question]').forEach(function (button) {
      if (button.dataset.eautoBound === 'true') return;
      button.dataset.eautoBound = 'true';
      button.addEventListener('click', function () {
        var answer = getAnswer(button);
        var wasOpen = button.getAttribute('aria-expanded') === 'true';
        root.querySelectorAll('[data-eauto-faq-question]').forEach(function (question) {
          closeAnswer(question, getAnswer(question));
        });
        if (!wasOpen) openAnswer(button, answer);
      });
    });

    root.querySelectorAll('[data-eauto-faq-answer]').forEach(function (answer) {
      var item = answer.closest('.e-auto-page__faq-item');
      if (item) item.classList.remove('is-open');
      answer.classList.remove('is-open');
      answer.setAttribute('aria-hidden', 'true');
      answer.style.maxHeight = '0px';
      answer.style.opacity = '0';
      answer.hidden = true;
    });
  }

  function boot() {
    bindFaq(document);
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
