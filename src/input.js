const KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
};
const BLOCKED = new Set([...Object.values(KEYS).flat(), 'Space']);
const STICK_RADIUS = 60;
const DEADZONE = 0.12;

// Keyboard + floating touch joystick (drag anywhere on the stage).
export class Input {
  constructor(stage, joystick, knob) {
    this.keys = new Set();
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.stickEnabled = false;
    this.joystick = joystick;
    this.knob = knob;
    this.onKey = null;
    this.override = null; // used by automated tests

    window.addEventListener('keydown', (e) => {
      if (BLOCKED.has(e.code)) e.preventDefault();
      if (!e.repeat && this.onKey) this.onKey(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.release();
    });

    stage.addEventListener('pointerdown', (e) => {
      if (!this.stickEnabled || this.stick.id !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      this.stick.id = e.pointerId;
      this.stick.ox = e.clientX;
      this.stick.oy = e.clientY;
      stage.setPointerCapture(e.pointerId);
      this.joystick.style.left = `${e.clientX}px`;
      this.joystick.style.top = `${e.clientY}px`;
      this.joystick.classList.remove('hidden');
      this.moveStick(e.clientX, e.clientY);
    });
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stick.id) this.moveStick(e.clientX, e.clientY);
    });
    const end = (e) => { if (e.pointerId === this.stick.id) this.release(); };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
  }

  moveStick(px, py) {
    let dx = (px - this.stick.ox) / STICK_RADIUS;
    let dy = (py - this.stick.oy) / STICK_RADIUS;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    this.knob.style.transform = `translate(${dx * STICK_RADIUS}px, ${dy * STICK_RADIUS}px)`;
    const mag = Math.min(1, len);
    const k = mag < DEADZONE ? 0 : (mag - DEADZONE) / (1 - DEADZONE) / (mag || 1);
    this.stick.x = dx * k;
    this.stick.y = -dy * k; // screen up = rocket up
  }

  release() {
    this.stick.id = null;
    this.stick.x = 0;
    this.stick.y = 0;
    this.knob.style.transform = '';
    this.joystick.classList.add('hidden');
  }

  setStickEnabled(on) {
    if (on === this.stickEnabled) return;
    this.stickEnabled = on;
    if (!on) this.release();
  }

  any(list) {
    return list.some((k) => this.keys.has(k));
  }

  get x() {
    if (this.override) return this.override.x;
    const k = (this.any(KEYS.right) ? 1 : 0) - (this.any(KEYS.left) ? 1 : 0);
    return Math.max(-1, Math.min(1, k + this.stick.x));
  }

  get y() {
    if (this.override) return this.override.y;
    const k = (this.any(KEYS.up) ? 1 : 0) - (this.any(KEYS.down) ? 1 : 0);
    return Math.max(-1, Math.min(1, k + this.stick.y));
  }
}
