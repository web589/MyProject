(function () {
  if (customElements.get('homepage-section-sync')) return;

  // Every synced block on this page shares the same homepage response. The
  // rendered wrapper contains the complete dynamic section ID, unlike the key
  // stored in index.json, so there is no speculative section_id request.
  var homepageRequests = new Map();
  var sectionScripts = new Map();

  function getHomepageUrl(element) {
    var root = element.getAttribute('data-homepage-url')
      || (window.Shopify && window.Shopify.routes && window.Shopify.routes.root)
      || '/';
    var url = new URL(root, window.location.origin);
    var currentParams = new URLSearchParams(window.location.search);

    ['preview_theme_id', 'preview_key', 'oseid'].forEach(function (name) {
      if (currentParams.has(name)) url.searchParams.set(name, currentParams.get(name));
    });

    return url.toString();
  }

  function getHomepageDocument(url) {
    if (homepageRequests.has(url)) return homepageRequests.get(url);

    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timeout = controller ? window.setTimeout(function () { controller.abort(); }, 15000) : null;
    var request = fetch(url, {
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      if (!response.ok) throw new Error('Homepage sync request failed.');
      return response.text();
    }).then(function (markup) {
      return new DOMParser().parseFromString(markup, 'text/html');
    }).catch(function (error) {
      // A later editor reload or another block entering view can retry a
      // transient network failure, while concurrent blocks still share it.
      homepageRequests.delete(url);
      error.homepageSyncRetryable = true;
      throw error;
    }).finally(function () {
      if (timeout !== null) window.clearTimeout(timeout);
    });

    homepageRequests.set(url, request);
    return request;
  }

  function findSection(homepage, key) {
    var staticSection = homepage.getElementById('shopify-section-' + key);
    if (staticSection) return staticSection;

    return Array.from(homepage.querySelectorAll('[id^="shopify-section-"]')).find(function (section) {
      return section.id.endsWith('__' + key);
    });
  }

  function activateScript(oldScript) {
    var type = (oldScript.getAttribute('type') || '').trim().toLowerCase();
    if (type && type !== 'text/javascript' && type !== 'application/javascript' && type !== 'module') {
      return Promise.resolve();
    }

    var key = type + ':' + (oldScript.src || oldScript.textContent);
    if (sectionScripts.has(key)) {
      // Custom element definitions survive a Shopify editor section reload.
      // Their connectedCallback initializes the new markup without redefining
      // the same class or attaching the old script's global listeners again.
      oldScript.remove();
      return sectionScripts.get(key);
    }

    var script = document.createElement('script');
    Array.from(oldScript.attributes).forEach(function (attribute) {
      script.setAttribute(attribute.name, attribute.value);
    });
    script.async = false;
    script.textContent = oldScript.textContent;

    var execution = new Promise(function (resolve, reject) {
      if (oldScript.src || type === 'module') {
        script.addEventListener('load', resolve, { once: true });
        script.addEventListener('error', function () {
          sectionScripts.delete(key);
          reject(new Error('Homepage section script failed.'));
        }, { once: true });
      }

      oldScript.replaceWith(script);
      if (!oldScript.src && type !== 'module') resolve();
    });

    sectionScripts.set(key, execution);
    return execution;
  }

  class HomepageSectionSync extends HTMLElement {
    connectedCallback() {
      if (this.loaded || this.loading || this.observer) return;

      if ((window.Shopify && window.Shopify.designMode) || !('IntersectionObserver' in window)) {
        this.loadSection();
        return;
      }

      this.observer = new IntersectionObserver(function (entries) {
        if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
        this.observer.disconnect();
        this.observer = null;
        this.loadSection();
      }.bind(this), { rootMargin: '600px 0px' });
      this.observer.observe(this);
    }

    disconnectedCallback() {
      window.clearTimeout(this.retryTimer);
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
    }

    async loadSection() {
      if (this.loaded || this.loading) return;

      this.loading = true;
      this.setAttribute('aria-busy', 'true');
      this.setAttribute('data-homepage-sync-state', 'loading');

      try {
        var key = this.getAttribute('data-source-section-key');
        if (!key) throw new Error('Homepage section key is missing.');

        var homepage = await getHomepageDocument(getHomepageUrl(this));
        if (!this.isConnected) return;

        var sourceSection = findSection(homepage, key);
        if (!sourceSection) throw new Error('Homepage section is unavailable.');

        this.replaceChildren(sourceSection.cloneNode(true));
        var scripts = Array.from(this.querySelectorAll('script'));
        for (var index = 0; index < scripts.length; index++) {
          if (!this.isConnected) return;
          await activateScript(scripts[index]);
        }

        this.loaded = true;
        this.setAttribute('data-homepage-sync-state', 'loaded');
        this.dispatchEvent(new CustomEvent('homepage:section:load', {
          bubbles: true,
          detail: { sectionId: sourceSection.id.replace(/^shopify-section-/, '') }
        }));
      } catch (error) {
        this.setAttribute('data-homepage-sync-state', 'error');
        if (error.homepageSyncRetryable && this.isConnected && (this.retryCount || 0) < 2) {
          this.retryCount = (this.retryCount || 0) + 1;
          this.retryTimer = window.setTimeout(function () {
            if (this.isConnected) this.loadSection();
          }.bind(this), this.retryCount * 1500);
        }
      } finally {
        this.loading = false;
        this.removeAttribute('aria-busy');
      }
    }
  }

  customElements.define('homepage-section-sync', HomepageSectionSync);
})();
