(() => {
  const pageSelector = '[data-smart-meter-page]';

  function initialiseMeterTabs(tabList) {
    if (tabList.dataset.smartMeterReady === 'true') return;

    const page = tabList.closest(pageSelector);
    if (!page) return;

    const tabs = Array.from(tabList.querySelectorAll('[data-sm-meter-tab]'));
    const panels = Array.from(page.querySelectorAll('[data-sm-meter-panel]'));
    const steps = Array.from(page.querySelectorAll('[data-sm-meter-step-content]'));
    if (!tabs.length) return;

    function activate(tab, moveFocus) {
      const target = tab.dataset.smMeterTab;

      tabs.forEach((candidate) => {
        const selected = candidate === tab;
        candidate.setAttribute('aria-selected', String(selected));
        candidate.tabIndex = selected ? 0 : -1;
      });

      panels.forEach((panel) => {
        const selected = panel.dataset.smMeterPanel === target;
        panel.hidden = !selected;
        panel.classList.toggle('is-active', selected);
      });

      steps.forEach((step) => {
        step.hidden = step.dataset.smMeterStepContent !== target;
      });

      if (moveFocus) tab.focus();
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activate(tab, false));
      tab.addEventListener('keydown', (event) => {
        let nextIndex = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabs.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        activate(tabs[nextIndex], true);
      });
    });

    const activeTab = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true') || tabs[0];
    activate(activeTab, false);
    tabList.dataset.smartMeterReady = 'true';
  }

  function initialiseFaq(faqList) {
    if (faqList.dataset.smartMeterReady === 'true') return;

    const items = Array.from(faqList.querySelectorAll('.sm-faq-item'));
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function setItem(item, shouldOpen) {
      const button = item.querySelector('[data-sm-faq-button]');
      const panel = item.querySelector('[data-sm-faq-answer]');
      const symbol = item.querySelector('.sm-faq-question__symbol');
      if (!button || !panel) return;

      window.clearTimeout(panel._smartMeterCloseTimer);
      button.setAttribute('aria-expanded', String(shouldOpen));
      panel.setAttribute('aria-hidden', String(!shouldOpen));
      item.classList.toggle('is-open', shouldOpen);
      if (symbol) symbol.textContent = shouldOpen ? '–' : '+';

      if (shouldOpen) {
        panel.hidden = false;
        panel.style.maxHeight = '0px';
        const expand = () => {
          panel.style.maxHeight = `${panel.scrollHeight}px`;
        };
        if (reduceMotion) expand();
        else window.requestAnimationFrame(expand);
        return;
      }

      if (panel.hidden) return;
      panel.style.maxHeight = `${panel.scrollHeight}px`;
      const collapse = () => {
        panel.style.maxHeight = '0px';
      };
      if (reduceMotion) collapse();
      else window.requestAnimationFrame(collapse);
      panel._smartMeterCloseTimer = window.setTimeout(() => {
        if (button.getAttribute('aria-expanded') === 'false') panel.hidden = true;
      }, reduceMotion ? 0 : 360);
    }

    items.forEach((item) => {
      const button = item.querySelector('[data-sm-faq-button]');
      if (!button) return;
      button.addEventListener('click', () => {
        const willOpen = button.getAttribute('aria-expanded') !== 'true';
        items.forEach((candidate) => {
          if (candidate !== item) setItem(candidate, false);
        });
        setItem(item, willOpen);
      });
    });

    faqList.dataset.smartMeterReady = 'true';
  }

  function initialise(scope = document) {
    const pages = [];
    if (scope instanceof Element && scope.matches(pageSelector)) pages.push(scope);
    if (scope.querySelectorAll) pages.push(...scope.querySelectorAll(pageSelector));

    pages.forEach((page) => {
      page.querySelectorAll('[data-sm-meter-tabs]').forEach(initialiseMeterTabs);
      page.querySelectorAll('[data-sm-faq]').forEach(initialiseFaq);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initialise(), { once: true });
  } else {
    initialise();
  }

  document.addEventListener('shopify:section:load', (event) => initialise(event.target));
})();
