(function () {
  if (customElements.get('pdp-video')) return;

  class PdpVideo extends HTMLElement {
    connectedCallback() {
      if (this.video) return;
      this.video = this.querySelector('video');
      if (!this.video) return;
      this.button = this.querySelector('[data-video-play]');
      this.message = this.querySelector('[data-video-message]');
      this.abort = new AbortController();
      var options = { signal: this.abort.signal };
      this.visible = false;
      this.resumeTime = 0;
      this.manual = false;
      this.userPaused = false;
      this.internalPause = false;
      this.loaded = false;
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.onVisibility = this.update.bind(this);
      this.onMotion = this.update.bind(this);
      this.video.addEventListener('playing', () => {
        clearTimeout(this.stallTimer);
        this.dataset.state = 'playing';
        if (this.message) this.message.textContent = '';
      }, options);
      this.video.addEventListener('pause', () => {
        if (!this.internalPause && this.loaded) this.userPaused = true;
        this.internalPause = false;
        if (this.dataset.state !== 'error') this.dataset.state = 'paused';
      }, options);
      this.video.addEventListener('play', () => { this.userPaused = false; }, options);
      this.video.addEventListener('loadedmetadata', () => {
        if (this.resumeTime > 0 && this.resumeTime < this.video.duration) {
          try { this.video.currentTime = this.resumeTime; } catch (error) { /* Some streams are not seekable yet. */ }
        }
        this.resumeTime = 0;
      }, options);
      this.video.addEventListener('error', () => this.showError(), options);
      this.video.addEventListener('waiting', () => {
        this.dataset.state = 'buffering';
        clearTimeout(this.stallTimer);
        this.stallTimer = setTimeout(() => {
          if (this.visible && this.video.readyState < 3) {
            this.video.controls = true;
            this.dataset.state = 'paused';
          }
        }, 12000);
      }, options);
      if (this.button) this.button.addEventListener('click', () => {
        this.manual = true;
        this.userPaused = false;
        this.video.controls = true;
        if (this.video.error) this.release();
        this.update();
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

    update() {
      if (!this.video) return;
      var shouldPlay = this.shouldPlay();
      clearTimeout(this.releaseTimer);
      if (!shouldPlay) {
        this.pauseInternally();
        clearTimeout(this.stallTimer);
        // Stop background downloads as well as decoding when the video leaves view.
        if (this.loaded && (!this.visible || document.hidden)) {
          this.releaseTimer = setTimeout(() => this.release(), 1500);
        }
        return;
      }
      if (!this.loaded) {
        if (this.dataset.controls === 'true') this.video.controls = true;
        this.video.querySelectorAll('source[data-src]').forEach(source => {
          source.src = source.dataset.src;
        });
        this.loaded = true;
        this.dataset.state = 'loading';
        this.video.load();
      }
      if (this.playingPromise || !this.video.paused) return;
      var playbackVideo = this.video;
      var playbackConnection = this.abort;
      var request = playbackVideo.play();
      if (request && request.then) {
        this.playingPromise = request;
        var interrupted = false;
        request.catch(error => {
          interrupted = error.name === 'AbortError';
          if (this.video !== playbackVideo || this.abort !== playbackConnection) return;
          if (error.name !== 'AbortError' && this.visible) {
            this.dataset.state = 'paused';
            this.video.controls = true;
          }
        }).finally(() => {
          if (this.playingPromise === request) {
            this.playingPromise = null;
            // A fast scroll out and back may interrupt play before its promise settles.
            if (interrupted && this.video && this.shouldPlay()) this.update();
          }
        });
      }
    }

    shouldPlay() {
      var saveData = navigator.connection && navigator.connection.saveData;
      return this.visible && !document.hidden && !this.userPaused &&
        (this.manual || (this.dataset.autoplay === 'true' && !this.reducedMotion.matches && !saveData));
    }

    showError() {
      clearTimeout(this.stallTimer);
      this.dataset.state = 'error';
      this.video.controls = true;
      if (this.message) this.message.textContent = this.dataset.errorLabel || '';
    }

    pauseInternally() {
      if (this.video && !this.video.paused) {
        this.internalPause = true;
        this.video.pause();
      }
    }

    release() {
      if (!this.video || !this.loaded) return;
      this.resumeTime = this.video.currentTime || 0;
      this.loaded = false;
      this.pauseInternally();
      this.video.querySelectorAll('source[data-src]').forEach(source => source.removeAttribute('src'));
      this.video.load();
      this.dataset.state = 'paused';
    }

    disconnectedCallback() {
      clearTimeout(this.releaseTimer);
      clearTimeout(this.stallTimer);
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
