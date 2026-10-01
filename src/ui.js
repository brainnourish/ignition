// The few words. Nothing else.
const STORE_KEY = 'ignition.minutes';

export function loadMinutes(fallback, allowed) {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const v = Number(raw);
    return raw !== null && allowed.includes(v) ? v : fallback;
  } catch (e) { return fallback; }
}
function saveMinutes(v) {
  try { window.localStorage.setItem(STORE_KEY, String(v)); } catch (e) { /* private mode: not remembered */ }
}

export const formatClock = (seconds) => {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60), r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

export class UI {
  constructor() {
    this.root = document.getElementById('ui');
    this.title = document.getElementById('title');
    this.hint = document.getElementById('hint');
    this.release = document.getElementById('release');
    this.msg = document.getElementById('msg');
    this.snd = document.getElementById('snd');
    this.timer = document.getElementById('timer');
    this.length = document.getElementById('length');
    this.lenVal = document.getElementById('lenVal');
    this.endEl = document.getElementById('end');
    this.endTimer = 0;
    this.onEnd = null;
    this.fade = document.getElementById('fade');
    this.confirmEl = document.getElementById('confirm');
    this.mode = 'idle';
    this.minutes = 1;
    this.onLength = null;
    this.lengths = [1];
    this.onConfirm = null;
    this.confirming = false;
    this._set(this.title, 1); this._set(this.hint, 1);
    const stop = (e) => e.stopPropagation();
    // the length stepper: arrows, scroll; clicks never start a hold
    for (const [id, dir] of [['lenDown', -1], ['lenUp', 1]]) {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', stop);
      el.addEventListener('click', (e) => { stop(e); this.step(dir); });
    }
    this.length.addEventListener('pointerdown', stop);
    this.length.addEventListener('wheel', (e) => { e.preventDefault(); if (Math.abs(e.deltaY) > 2) this.step(e.deltaY > 0 ? -1 : 1); }, { passive: false });
    const endBtn = document.getElementById('endBtn');
    endBtn.addEventListener('pointerdown', stop);
    endBtn.addEventListener('click', (e) => { stop(e); this.hideEnd(); if (this.onEnd) this.onEnd(); });
    for (const id of ['yes', 'no']) {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', stop);
      el.addEventListener('click', (e) => { stop(e); this.answer(id === 'yes'); });
    }
  }

  // session length: one value from a list of sensible steps, shown as '‹  25 min  ›'
  buildLengths(values, selected) {
    this.lengths = values;
    this.minutes = selected;
    this.renderLength();
  }
  renderLength() {
    this.lenVal.textContent = String(this.minutes);
    document.getElementById('lenCap').textContent = this.minutes === 1 ? 'minute of focus' : 'minutes of focus';
    const i = this.lengths.indexOf(this.minutes);
    document.getElementById('lenDown').classList.toggle('off', i <= 0);
    document.getElementById('lenUp').classList.toggle('off', i >= this.lengths.length - 1);
  }
  step(dir) {
    if (!this.length.classList.contains('live')) return false;
    const i = this.lengths.indexOf(this.minutes);
    const j = Math.max(0, Math.min(this.lengths.length - 1, (i < 0 ? 0 : i) + dir));
    if (this.lengths[j] === this.minutes) return true;
    this.minutes = this.lengths[j];
    saveMinutes(this.minutes);
    this.renderLength();
    if (this.onLength) this.onLength(this.minutes);
    return true;
  }
  showLength(on) { this.length.classList.toggle('live', on); this._set(this.length, on ? 1 : 0); }
  // kept for callers of the old preset row
  showPresets(on) { this.showLength(on); }

  // the countdown on the glass: screen position in CSS pixels (follows the porthole as it sways)
  placeTimer(x, y) {
    const s = this.timer.style;
    const l = `${x.toFixed(1)}px`, t = `${y.toFixed(1)}px`;
    if (s.left !== l) s.left = l;
    if (s.top !== t) s.top = t;
  }
  // 'end session': appears while the pointer moves during a session, fades when it rests
  pokeEnd(active) {
    if (!active || this.confirming) { this.hideEnd(); return; }
    this.endEl.classList.add('show');
    clearTimeout(this.endTimer);
    this.endTimer = setTimeout(() => this.hideEnd(), 2600);
  }
  hideEnd() { clearTimeout(this.endTimer); this.endEl.classList.remove('show'); }

  setTimer(seconds) {
    const txt = formatClock(seconds);
    if (this.timer.textContent !== txt) this.timer.textContent = txt;
  }
  showTimer(on) { this._set(this.timer, on ? 1 : 0); }
  // 0 = clear, 1 = black; seconds = transition length
  setFade(v, seconds) {
    this.fade.style.transition = seconds > 0 ? `opacity ${seconds}s ease` : 'none';
    // force style flush so a changed transition applies to this update
    void this.fade.offsetHeight;
    this.fade.style.opacity = v;
  }
  _set(el, o) { if (el._o !== o) { el.style.opacity = o; el._o = o; } }

  // where the words sit: beside the rocket on the pad, below the porthole in the cabin
  setPlace(orbit) {
    this.root.classList.toggle('orbit', orbit);
    document.getElementById('credit').classList.toggle('show', orbit);
  }

  // "end session?" — quiet, answered with a click, Enter/Y or Escape/N
  askEnd() { this.hideEnd(); this.confirming = true; this.confirmEl.classList.add('show'); }
  answer(yes) {
    if (!this.confirming) return;
    this.confirming = false;
    this.confirmEl.classList.remove('show');
    if (yes && this.onConfirm) this.onConfirm();
  }
  hideConfirm() { this.confirming = false; this.confirmEl.classList.remove('show'); }

  // visible words as the hold builds (0..1); both fade quickly
  hold(p) {
    const o = Math.max(0, 1 - p * 2.5);
    this._set(this.title, o); this._set(this.hint, o); this._set(this.release, 0); this._set(this.msg, 0);
    if (p > 0.02) this.showLength(false);
  }
  showRelease() { this._set(this.release, 1); this._set(this.title, 0); this._set(this.hint, 0); this.showLength(false); }
  hideAll() { this._set(this.release, 0); this._set(this.title, 0); this._set(this.hint, 0); this._set(this.msg, 0); this.showLength(false); }
  idle() {
    this.setPlace(false);
    if (this.fade.style.opacity === '0.5') this.setFade(0, 1.2);
    this.hint.textContent = 'hold to ignite';
    this._set(this.title, 1); this._set(this.hint, 1); this._set(this.release, 0); this._set(this.msg, 0);
    this.showLength(true);
  }
  // after the session: how it went, and the way back down
  ended(leaves) {
    this.setPlace(true);
    this.msg.textContent = 'your ascent is complete';
    this.setFade(0.5, 2.4);
    this.hint.textContent = 'hold to launch again';
    this._set(this.title, 0); this._set(this.msg, 1); this._set(this.hint, 1); this._set(this.release, 0);
    this.showLength(true);
  }
  setSound(on) { this.snd.classList.toggle('on', on); }
}
