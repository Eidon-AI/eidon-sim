import { quat, vec3, vec3 as v3 } from 'gl-matrix';
import { parseTracker, parseGlove } from './reportParsers';
import { DeviceState } from './types';

export class DeviceStore extends EventTarget {
  constructor(){
    super();

    document.addEventListener('deviceColor', e => {
      const { id, hex } =
        (e as CustomEvent<{ id: string; hex: string }>).detail;
      const s = this.map.get(id);
      if (!s) return;
      s.color = hex;
      this.dispatchEvent(new CustomEvent('update', { detail: s }));
    });
  }

  private map = new Map<string, DeviceState>();

  /** Subscribe to HidManager.report */
  handleRaw(id: string, view: DataView) {
    const state = this.map.get(id) ?? this.newState(id, view);
    this.parseInto(state, view);
    this.map.set(id, state);
    this.dispatchEvent(new CustomEvent('update', { detail: state }));
  }

  /* ---------- internal helpers ------------------------------- */
  private newState(id: string, view: DataView): DeviceState {
    // glove reports are > 20 bytes (tracker = 10 bytes)
    const isGlove = view.byteLength > 20;
  
    return {
      id,
      kind: isGlove ? 'glove' : 'tracker',
      color: '#ff8800',
      quat: quat.create(),
      up:   vec3.create(),
      fwd:  vec3.create(),
      chainStart: vec3.create(),
      chainEnd:   vec3.create(),
      lastSeen: performance.now()
    };
  }

  private parseInto(state: DeviceState, view: DataView) {
    if (state.kind === 'tracker')  parseTracker(state, view);
    if (state.kind === 'glove')    parseGlove(state,   view);
    state.lastSeen = performance.now();
  }

  /** Convenience: fetch latest tracker/glove by arm side & level */
  getBy(side: 'left' | 'right', level: 'upper' | 'lower' | 'hand') {
    for (const s of this.map.values()) {
      if (s.arm?.side === side && s.arm?.level === level) return s;
      if (level === 'hand' && s.kind === 'glove' && s.arm?.side === side) return s;
    }
    return undefined;
  }
}
