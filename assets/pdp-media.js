(function () {
  if (customElements.get('pdp-video')) return;

  class PdpVideo extends HTMLElement {
    connectedCallback() {
      if (this.video) return;
      this.video = this.querySelector('video');
      if (!this.video) return;
      this.message = this.querySelector('[data-video-message]');
      this.abort = new AbortController();
      var options = { signal: this.abort.signal };
      this.visible = false;
      this.resumeTime = 0;
      this.loaded = false;
      this.retryCount = 0;
      this.terminalError = false;
      this.video.controls = false;
      this.video.removeAttribute('controls');
      this.video.muted = true;
      this.video.defaultMuted = true;
      this.video.loop = true;
      this.video.playsInline = true;
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.onVisibility = this.update.bind(this);
      this.onMotion = this.update.bind(this);
      this.video.addEventListener('playing', () => {
        if (!this.shouldPlay()) {
          this.pauseInternally();
          return;
        }
        this.retryCount = 0;
        this.setState('playing');
      }, options);
      this.video.addEventListener('pause', () => {
        if (!this.video || !this.video.paused) return;
        if (this.dataset.state !== 'error' && !this.retryTimer) this.setState('paused');
      }, options);
      this.video.addEventListener('loadedmetadata', () => {
        if (this.resumeTime > 0 && this.resumeTime < this.video.duration) {
          try { this.video.currentTime = this.resumeTime; } catch (error) { /* The stream may not be seekable yet. */ }
        }
        this.resumeTime = 0;
      }, options);
      this.video.addEventListener('error', () => this.retry(), options);
      this.video.querySelectorAll('source[data-src]').forEach(source => {
        source.addEventListener('error', () => this.retry(), options);
      });
      this.video.addEventListener('waiting', () => {
        if (this.loaded && this.shouldPlay()) this.setState('buffering');
      }, options);
      document.addEventListener('visibilitychange', this.onVisibility, options);
      this.reducedMotion.addEventListener('change', this.onMotion);
      if ('IntersectionObserver' in window) {
        this.observer = new IntersectionObserver(entries => {
          this.visible = entries[0].isIntersecting;
          this.update();
        }, { threshold: 0.05 });
        this.observer.observe(this);
      } else {
        this.visible = true;
        this.update();
      }
    }

    setState(state) {
      this.dataset.state = state;
      this.setAttribute('aria-busy', String(state === 'loading' || state === 'buffering'));
      if (this.message) this.message.textContent = state === 'error' ? this.dataset.errorLabel || '' : '';
    }

    shouldPlay() {
      var saveData = navigator.connection && navigator.connection.saveData;
      return this.visible && !document.hidden && this.dataset.autoplay === 'true' &&
        !this.reducedMotion.matches && !saveData;
    }

    update() {
      if (!this.video) return;
      clearTimeout(this.releaseTimer);
      if (!this.shouldPlay()) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
        this.pauseInternally();
        this.setState('paused');
        if (this.loaded) this.releaseTimer = setTimeout(() => this.release(), 1500);
        return;
      }
      if (this.terminalError) {
        this.setState('error');
        return;
      }
      if (this.retryTimer) return;
      if (!this.loaded) {
        this.video.querySelectorAll('source[data-src]').forEach(source => {
          source.src = source.dataset.src;
        });
        this.loaded = true;
        this.setState('loading');
        this.video.load();
      }
      if (this.playingPromise || !this.video.paused) return;
      this.video.muted = true;
      this.setState(this.video.readyState < 3 ? 'loading' : 'buffering');
      var playbackVideo = this.video;
      var playbackConnection = this.abort;
      var request = playbackVideo.play();
      if (request && request.then) {
        this.playingPromise = request;
        var interrupted = false;
        request.catch(error => {
          if (this.video !== playbackVideo || this.abort !== playbackConnection) return;
          interrupted = error.name === 'AbortError';
          if (!this.shouldPlay()) return;
          if (error.name === 'NotAllowedError') this.setState('blocked');
          else if (!interrupted) this.retry();
        }).finally(() => {
          if (this.playingPromise !== request) return;
          this.playingPromise = null;
          if (interrupted && this.video && !this.terminalError && this.shouldPlay() && !this.retryTimer) this.update();
        });
      }
    }

    retry() {
      if (!this.video || !this.loaded || this.retryTimer) return;
      this.release();
      if (!this.shouldPlay()) return;
      if (this.retryCount >= 2) {
        this.terminalError = true;
        this.setState('error');
        return;
      }
      this.retryCount += 1;
      this.setState('loading');
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        if (this.video && this.shouldPlay()) this.update();
      }, this.retryCount * 1500);
    }

    pauseInternally() {
      if (this.video && !this.video.paused) this.video.pause();
    }

    release() {
      if (!this.video || !this.loaded) return;
      this.resumeTime = this.video.currentTime || this.resumeTime || 0;
      this.loaded = false;
      this.pauseInternally();
      this.video.querySelectorAll('source[data-src]').forEach(source => source.removeAttribute('src'));
      this.video.load();
      this.setState('paused');
    }

    disconnectedCallback() {
      clearTimeout(this.releaseTimer);
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
      if (this.observer) this.observer.disconnect();
      if (this.abort) this.abort.abort();
      if (this.reducedMotion) this.reducedMotion.removeEventListener('change', this.onMotion);
      this.release();
      this.video = null;
      this.playingPromise = null;
    }
  }

  customElements.define('pdp-video', PdpVideo);
})();
