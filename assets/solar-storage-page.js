(function () {
  'use strict';

  var initializedFaqs = new WeakSet();
  var answerHeights = new WeakMap();
  var motionBound = false;

  function measureAnswer(answer) {
    if (!answer) return 0;
    var height = answer.scrollHeight;
    answerHeights.set(answer, height);
    return height;
  }

  function getAnswerHeight(answer) {
    var height = answerHeights.get(answer);
    return typeof height === 'number' ? height : measureAnswer(answer);
  }

  function setOpen(item, shouldOpen) {
    var button = item.querySelector('.ss-faq-item__button');
    var answer = item.querySelector('.ss-faq-item__answer');
    var symbol = item.querySelector('.ss-faq-item__symbol');
    if (!button || !answer) return;

    item.classList.toggle('is-open', shouldOpen);
    button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    if (symbol) symbol.textContent = shouldOpen ? '–' : '+';
    answer.style.maxHeight = shouldOpen ? getAnswerHeight(answer) + 'px' : '0px';
  }

  function setupFaq(section) {
    if (!section || initializedFaqs.has(section)) return;
    initializedFaqs.add(section);

    var items = Array.prototype.slice.call(section.querySelectorAll('.ss-faq-item'));
    items.forEach(function (item) {
      var button = item.querySelector('.ss-faq-item__button');
      var answer = item.querySelector('.ss-faq-item__answer');
      measureAnswer(answer);
      if (!button) return;
      button.addEventListener('click', function () {
        var shouldOpen = !item.classList.contains('is-open');
        items.forEach(function (otherItem) { setOpen(otherItem, otherItem === item && shouldOpen); });
        window.dispatchEvent(new CustomEvent('anchor-navigation:update'));
      });
    });
  }

  function updateOpenAnswers() {
    document.querySelectorAll('[data-ss-faq] .ss-faq-item.is-open').forEach(function (item) {
      var answer = item.querySelector('.ss-faq-item__answer');
      if (answer) answer.style.maxHeight = measureAnswer(answer) + 'px';
    });
  }

  function refreshAnswerHeights() {
    document.querySelectorAll('[data-ss-faq] .ss-faq-item__answer').forEach(measureAnswer);
    updateOpenAnswers();
  }

  function updateVideoMotion() {
    var reduced = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    document.querySelectorAll('.main-content--solar-storage .ss-video__media').forEach(function (video) {
      if (reduced) video.pause();
      else {
        var playResult = video.play();
        if (playResult && typeof playResult.catch === 'function') playResult.catch(function () {});
      }
    });
  }

  function boot(root) {
    var context = root || document;
    if (context.matches && context.matches('[data-ss-faq]')) setupFaq(context);
    if (context.querySelectorAll) context.querySelectorAll('[data-ss-faq]').forEach(setupFaq);
    updateVideoMotion();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(document); }, { once: true });
  else boot(document);

  document.addEventListener('shopify:section:load', function (event) { window.setTimeout(function () { boot(event.target); }, 0); });
  window.addEventListener('resize', updateOpenAnswers);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(refreshAnswerHeights);
  }

  if (!motionBound && window.matchMedia) {
    motionBound = true;
    var media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.addEventListener) media.addEventListener('change', updateVideoMotion);
    else if (media.addListener) media.addListener(updateVideoMotion);
  }
}());
