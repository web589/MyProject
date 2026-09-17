(function() {
  if (window.CartShippingRates) return;

  const countryNames = {
    DE: 'Germany',
    NL: 'Netherlands',
    BE: 'Belgium'
  };

  const completedRates = new Map();
  const pendingRates = new Map();
  let activeRequest = null;

  function abortError() {
    const error = new Error('Shipping rate request was cancelled.');
    error.name = 'AbortError';
    return error;
  }

  function delay(milliseconds, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) {
        reject(abortError());
        return;
      }

      const cleanup = () => {
        if (signal) signal.removeEventListener('abort', onAbort);
      };
      const cleanupAndResolve = () => {
        cleanup();
        resolve();
      };
      const onAbort = () => {
        window.clearTimeout(timeout);
        cleanup();
        reject(abortError());
      };
      const timeout = window.setTimeout(cleanupAndResolve, milliseconds);

      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  async function readJsonSafely(response) {
    const text = await response.text();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  function normalizePostcode(postcode) {
    return String(postcode || '').trim();
  }

  function buildQuery(countryCode, postcode) {
    const params = new URLSearchParams();
    params.set('shipping_address[country]', countryNames[countryCode] || countryCode);

    const normalizedPostcode = normalizePostcode(postcode);
    if (normalizedPostcode) params.set('shipping_address[zip]', normalizedPostcode);

    params.set('shipping_address[province]', '');
    return params.toString();
  }

  function payloadMessage(payload) {
    const message = payload && (payload.description || payload.message || payload.error || payload.errors);
    if (Array.isArray(message) && message.length) return message.join(' ');
    if (typeof message === 'string' && message.trim()) return message;
    return '';
  }

  function needsPostcode(payload) {
    const raw = JSON.stringify(payload || '').toLowerCase();
    return /zip|postal|postleitzahl|plz/.test(raw);
  }

  function shippingError(payload, fallback) {
    const error = new Error(payloadMessage(payload) || fallback);
    error.needsPostcode = needsPostcode(payload);
    return error;
  }

  function priceToCents(price) {
    const amount = Number(price);
    return Number.isFinite(amount) ? Math.round(amount * 100) : null;
  }

  function formatPrice(price, currency) {
    const amount = Number(price);
    if (!Number.isFinite(amount)) return String(price || '');
    if (amount === 0) return 'Kostenlos';

    return amount.toLocaleString('de-DE', {
      style: 'currency',
      currency: currency || 'EUR'
    });
  }

  function getCartFingerprint(cart) {
    if (!cart || typeof cart !== 'object') return 'unknown-cart';

    return JSON.stringify({
      currency: cart.currency || '',
      total_price: cart.total_price || 0,
      total_discount: cart.total_discount || 0,
      item_count: cart.item_count || 0,
      discount_codes: (cart.discount_codes || []).map(discount => ({
        code: discount.code || '',
        applicable: discount.applicable !== false
      })),
      items: (cart.items || []).map(item => ({
        key: item.key || '',
        id: item.id || item.variant_id || '',
        quantity: item.quantity || 0,
        final_line_price: item.final_line_price || item.line_price || 0,
        properties: item.properties || {}
      }))
    });
  }

  function buildRequestKey(options) {
    const config = options || {};
    return [
      String(config.countryCode || '').toUpperCase(),
      normalizePostcode(config.postcode),
      String(config.cartFingerprint || 'unknown-cart')
    ].join('|');
  }

  async function requestRates(options, requestKey, controller) {
    const config = options || {};
    const rootUrl = config.rootUrl || '/';
    const query = buildQuery(config.countryCode, config.postcode);
    const prepareUrl = `${rootUrl}cart/prepare_shipping_rates.json?${query}`;
    const ratesUrl = `${rootUrl}cart/async_shipping_rates.json?${query}`;

    const prepareResponse = await fetch(prepareUrl, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      signal: controller.signal
    });

    if (!prepareResponse.ok) {
      const payload = await readJsonSafely(prepareResponse);
      throw shippingError(payload, 'Versandkosten konnten nicht geladen werden.');
    }

    let shippingData = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await delay(350 + attempt * 120, controller.signal);

      const ratesResponse = await fetch(ratesUrl, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        signal: controller.signal
      });

      if (!ratesResponse.ok) {
        const payload = await readJsonSafely(ratesResponse);
        throw shippingError(payload, 'Versandkosten konnten nicht geladen werden.');
      }

      shippingData = await readJsonSafely(ratesResponse);
      if (shippingData && Array.isArray(shippingData.shipping_rates)) break;
    }

    const rates = shippingData && Array.isArray(shippingData.shipping_rates)
      ? shippingData.shipping_rates
      : null;

    if (!rates) {
      throw shippingError(null, 'Die Versandkostenberechnung dauert zu lange. Bitte erneut versuchen.');
    }

    if (!rates.length) {
      throw shippingError(null, 'Für dieses Lieferland ist aktuell keine Versandrate verfügbar.');
    }

    rates.sort((a, b) => Number(a.price) - Number(b.price));
    const cheapest = rates[0];
    const amountCents = priceToCents(cheapest.price);
    if (amountCents === null) {
      throw shippingError(null, 'Die Versandrate hat keinen gültigen Betrag.');
    }

    const currency = cheapest.currency || config.currency || 'EUR';
    return {
      rates,
      amountCents,
      currency,
      hasMultipleRates: rates.length > 1,
      requestKey,
      formattedPrice: formatPrice(cheapest.price, currency)
    };
  }

  function getRates(options) {
    const config = options || {};
    const postcode = normalizePostcode(config.postcode);
    if (!postcode) {
      return Promise.reject(shippingError(null, 'Bitte eine Postleitzahl eingeben.'));
    }

    const requestKey = buildRequestKey({ ...config, postcode });
    if (completedRates.has(requestKey)) return Promise.resolve(completedRates.get(requestKey));
    if (pendingRates.has(requestKey)) return pendingRates.get(requestKey).promise;

    if (activeRequest && activeRequest.requestKey !== requestKey) {
      activeRequest.controller.abort();
    }

    const controller = new AbortController();
    const request = {
      requestKey,
      controller,
      promise: null
    };
    request.promise = requestRates(config, requestKey, controller)
      .then(result => {
        completedRates.set(requestKey, result);
        return result;
      })
      .finally(() => {
        pendingRates.delete(requestKey);
        if (activeRequest === request) activeRequest = null;
      });

    pendingRates.set(requestKey, request);
    activeRequest = request;
    return request.promise;
  }

  function invalidate(cartFingerprint) {
    if (!cartFingerprint) {
      completedRates.clear();
      return;
    }

    [...completedRates.keys()].forEach(key => {
      if (!key.endsWith(`|${cartFingerprint}`)) completedRates.delete(key);
    });
  }

  window.CartShippingRates = {
    countryNames,
    buildQuery,
    buildRequestKey,
    getCartFingerprint,
    formatPrice,
    getRates,
    invalidate
  };
  window.dispatchEvent(new CustomEvent('cart:shipping-rates-ready'));
})();
