(function() {
  if (window.CartShippingRates) return;

  const countryNames = {
    DE: 'Germany',
    NL: 'Netherlands',
    BE: 'Belgium'
  };

  function delay(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
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

  function buildQuery(countryCode, postcode) {
    const params = new URLSearchParams();
    params.set('shipping_address[country]', countryNames[countryCode] || countryCode);

    const normalizedPostcode = String(postcode || '').trim();
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

  function formatPrice(price, currency) {
    const amount = Number(price);
    if (!Number.isFinite(amount)) return String(price || '');
    if (amount === 0) return 'Kostenlos';

    return amount.toLocaleString('de-DE', {
      style: 'currency',
      currency: currency || 'EUR'
    });
  }

  async function getRates(options) {
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
      }
    });

    if (!prepareResponse.ok) {
      const payload = await readJsonSafely(prepareResponse);
      throw shippingError(payload, 'Versandkosten konnten nicht geladen werden.');
    }

    let shippingData = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await delay(350 + attempt * 120);

      const ratesResponse = await fetch(ratesUrl, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
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

    return {
      rates,
      formattedPrice: formatPrice(rates[0].price, rates[0].currency || config.currency || 'EUR')
    };
  }

  window.CartShippingRates = {
    countryNames,
    buildQuery,
    formatPrice,
    getRates
  };
  window.dispatchEvent(new CustomEvent('cart:shipping-rates-ready'));
})();
