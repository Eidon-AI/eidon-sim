/**
 * FingerSensorPanel – compact canvas finger visualization for glove cards.
 *
 * Channel layout (matches JOINT_MAP in ProceduralHand):
 *   0  Thumb  CMC_ABD     4  Index  MCP_ABD     7  Middle MCP_ABD
 *   1  Thumb  CMC_FLEX    5  Index  MCP_FLEX     8  Middle MCP_FLEX
 *   2  Thumb  MCP_FLEX    6  Index  PIP_FLEX     9  Middle PIP_FLEX
 *   3  Thumb  IP_FLEX    10  Ring   MCP_ABD    13  Pinky  MCP_ABD
 *                        11  Ring   MCP_FLEX   14  Pinky  MCP_FLEX
 *                        12  Ring   PIP_FLEX   15  Pinky  PIP_FLEX
 */

const LABELS   = ['T', 'I', 'M', 'R', 'P'];
const BAR_W    = 14;
const BAR_H    = 48;
const GAP      = 5;
const PAD_X    = 6;
const PAD_TOP  = 4;
const LABEL_H  = 12;
const SEG_GAP  = 2;   // gap between proximal / distal segments
const CANVAS_W = PAD_X * 2 + 5 * BAR_W + 4 * GAP;
const CANVAS_H = PAD_TOP + BAR_H + LABEL_H;

/** Per-finger channel indices: [proximal-flex, distal-flex] */
const FLEX_IDX: [number, number][] = [
  [1, 3],   // Thumb:  CMC_FLEX, IP_FLEX
  [5, 6],   // Index:  MCP_FLEX, PIP_FLEX
  [8, 9],   // Middle: MCP_FLEX, PIP_FLEX
  [11, 12], // Ring:   MCP_FLEX, PIP_FLEX
  [14, 15], // Pinky:  MCP_FLEX, PIP_FLEX
];

function flexColor(v: number): string {
  // cyan (extended) → orange (flexed)
  const r = Math.round(20  + 235 * v);
  const g = Math.round(200 - 110 * v);
  const b = Math.round(220 - 190 * v);
  return `rgb(${r},${g},${b})`;
}

export class FingerSensorPanel {
  private root:          HTMLElement;
  private canvas:        HTMLCanvasElement;
  private ctx:           CanvasRenderingContext2D;
  private deviceId:      string;
  private eventHandler:  ((e: Event) => void) | null = null;

  constructor(deviceId: string) {
    this.deviceId = deviceId;

    this.root = document.createElement('div');
    this.root.style.cssText = 'display:flex;flex-direction:column;align-items:center;margin:4px 0 6px;gap:2px';

    const title = document.createElement('span');
    title.textContent = 'Fingers';
    title.style.cssText = 'font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.05em';
    this.root.appendChild(title);

    this.canvas = document.createElement('canvas');
    this.canvas.width  = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.canvas.style.cssText = 'display:block;image-rendering:pixelated';
    this.root.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d')!;
    this._draw(new Array(16).fill(0));
    this._listen();
  }

  private _draw(src: number[]): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    for (let f = 0; f < 5; f++) {
      const x   = PAD_X + f * (BAR_W + GAP);
      const [pi, di] = FLEX_IDX[f];
      const prox = src[pi] ?? 0;
      const dist = src[di] ?? 0;

      // Each bar split into 2 equal segments with a small gap
      const segH = (BAR_H - SEG_GAP) / 2;

      // Bottom segment = distal (DIP/IP)
      const y2 = PAD_TOP + segH + SEG_GAP;
      ctx.fillStyle = '#1e2a2a';
      ctx.fillRect(x, y2, BAR_W, segH);
      const fill2 = Math.round(dist * segH);
      ctx.fillStyle = flexColor(dist);
      ctx.fillRect(x, y2 + segH - fill2, BAR_W, fill2);

      // Top segment = proximal (MCP/CMC)
      const y1 = PAD_TOP;
      ctx.fillStyle = '#1e2a2a';
      ctx.fillRect(x, y1, BAR_W, segH);
      const fill1 = Math.round(prox * segH);
      ctx.fillStyle = flexColor(prox);
      ctx.fillRect(x, y1 + segH - fill1, BAR_W, fill1);

      // Letter label
      ctx.fillStyle = '#777';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(LABELS[f], x + BAR_W / 2, PAD_TOP + BAR_H + LABEL_H - 2);
    }
  }

  private _listen(): void {
    this.eventHandler = (e: Event) => {
      const { deviceId, fingerValues } = (e as CustomEvent).detail;
      if (deviceId === this.deviceId) this._draw(fingerValues);
    };
    document.addEventListener('fingerDataUpdate', this.eventHandler);
  }

  public mount(parent: HTMLElement): void { parent.appendChild(this.root); }

  public unmount(): void {
    if (this.eventHandler) {
      document.removeEventListener('fingerDataUpdate', this.eventHandler);
      this.eventHandler = null;
    }
    this.root.remove();
  }

  public getElement(): HTMLElement { return this.root; }
}
