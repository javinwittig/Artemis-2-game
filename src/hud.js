const $ = (id) => document.getElementById(id);
const fmtInt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export class Hud {
  constructor() {
    this.el = {
      loading: $('loading'), loadingFill: $('loading-fill'), loadingText: $('loading-text'),
      title: $('title'), titleBest: $('title-best'),
      countdown: $('countdown'), countdownValue: $('countdown-value'),
      callout: $('callout'), skip: $('btn-skip'),
      hud: $('hud'), score: $('hud-score'), speed: $('hud-speed'), best: $('hud-best'),
      shield: $('shield'), shieldTime: $('shield-time'), shieldFill: $('shield-fill'),
      gameover: $('gameover'), goScore: $('go-score'), goBest: $('go-best'), goRecord: $('go-record'),
      mute: $('btn-mute'), flash: $('flash'),
    };
    this.calloutTimer = 0;
    this.titleHideT = 0;
    this.flashLevel = 0;
    this.last = {};
  }

  setLoading(p) {
    const pct = Math.round(p * 100);
    this.el.loadingFill.style.width = `${pct}%`;
    this.el.loadingText.textContent = `Loading model… ${pct}%`;
  }

  setLoadingText(text) {
    this.el.loadingText.textContent = text;
  }

  hideLoading() {
    this.el.loading.classList.add('hidden');
  }

  showTitle(bestKm) {
    this.titleHideT = 0;
    this.el.title.classList.remove('hidden', 'leaving');
    this.el.titleBest.textContent = bestKm > 0 ? `Best: ${fmtInt.format(bestKm)} km` : '';
  }

  hideTitle() {
    this.el.title.classList.add('leaving');
    this.titleHideT = 0.6;
  }

  setCountdown(n) {
    if (n === null) {
      this.el.countdown.classList.add('hidden');
      return;
    }
    this.el.countdown.classList.remove('hidden');
    const v = this.el.countdownValue;
    v.textContent = String(n);
    v.classList.remove('tick');
    void v.offsetWidth;
    v.classList.add('tick');
  }

  callout(text, seconds = 2.2) {
    const c = this.el.callout;
    c.textContent = text;
    c.classList.remove('hidden');
    c.style.animation = 'none';
    void c.offsetWidth;
    c.style.animation = '';
    this.calloutTimer = seconds;
  }

  showSkip(on) {
    this.el.skip.classList.toggle('hidden', !on);
  }

  showHud(on) {
    this.el.hud.classList.toggle('visible', on);
  }

  setStats(km, speedKmS, bestKm) {
    const s = fmtInt.format(km);
    if (s !== this.last.score) this.el.score.textContent = this.last.score = s;
    const v = fmt1.format(speedKmS);
    if (v !== this.last.speed) this.el.speed.textContent = this.last.speed = v;
    const b = fmtInt.format(bestKm);
    if (b !== this.last.best) this.el.best.textContent = this.last.best = b;
  }

  setShield(remaining, total, warn) {
    const on = remaining > 0;
    this.el.shield.classList.toggle('active', on);
    this.el.shield.classList.toggle('warn', on && warn);
    if (!on) return;
    this.el.shieldFill.style.width = `${(remaining / total) * 100}%`;
    this.el.shieldTime.textContent = fmt1.format(remaining);
  }

  showGameOver(km, bestKm, record) {
    this.el.goScore.textContent = fmtInt.format(km);
    this.el.goBest.textContent = `Best: ${fmtInt.format(bestKm)} km`;
    this.el.goRecord.classList.toggle('hidden', !record);
    this.el.gameover.classList.remove('hidden');
  }

  hideGameOver() {
    this.el.gameover.classList.add('hidden');
  }

  flash(strength) {
    this.flashLevel = Math.max(this.flashLevel, strength);
  }

  setMuted(m) {
    this.el.mute.textContent = m ? 'Sound off' : 'Sound on';
    this.el.mute.setAttribute('aria-pressed', String(!m));
  }

  update(dt) {
    if (this.titleHideT > 0) {
      this.titleHideT -= dt;
      if (this.titleHideT <= 0) this.el.title.classList.add('hidden');
    }
    if (this.calloutTimer > 0) {
      this.calloutTimer -= dt;
      if (this.calloutTimer <= 0) this.el.callout.classList.add('hidden');
    }
    if (this.flashLevel > 0) {
      this.flashLevel *= Math.exp(-4 * dt);
      if (this.flashLevel < 0.003) this.flashLevel = 0;
      this.el.flash.style.opacity = this.flashLevel.toFixed(3);
    }
  }
}
