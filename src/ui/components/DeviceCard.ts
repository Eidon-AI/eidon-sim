import { ConnectedDevice } from '../../types/device';
import { HidManager }  from '../../core/HidManager';
import { DeviceStore } from '../../core/DeviceStore';
import { eulerXYZ } from '../../core/mathUtils';
import { setSelected } from '../App';
import { vec3, quat } from 'gl-matrix';
import styles from './styles/DeviceCard.module.css';

function createDial(label: string) {
  const wrap  = document.createElement('div');
  wrap.className = styles.dialContainer;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 40;
  canvas.className = styles.dialCanvas;
  const cap    = document.createElement('span');
  cap.textContent = label;
  cap.className = styles.dialLabel;
  wrap.appendChild(canvas);
  wrap.appendChild(cap);
  return { wrap, canvas };
}

function createUpVectorCanvas() {
  const wrap = document.createElement('div');
  wrap.className = styles.dialContainer;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 40;
  canvas.className = styles.dialCanvas;
  const cap = document.createElement('span');
  cap.textContent = 'Top';
  cap.className = styles.dialLabel;
  wrap.appendChild(canvas);
  wrap.appendChild(cap);
  return { wrap, canvas };
}

function createForwardVectorCanvas() {
  const wrap = document.createElement('div');
  wrap.className = styles.dialContainer;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 40;
  canvas.className = styles.dialCanvas;
  const cap = document.createElement('span');
  cap.textContent = 'Forward';
  cap.className = styles.dialLabel;
  wrap.appendChild(canvas);
  wrap.appendChild(cap);
  return { wrap, canvas };
}

function createPrismIndicatorCanvas() {
  const wrap = document.createElement('div');
  wrap.className = styles.dialContainer;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 40;
  canvas.className = styles.dialCanvas;
  const cap = document.createElement('span');
  cap.textContent = 'Device';
  cap.className = styles.dialLabel;
  wrap.appendChild(canvas);
  wrap.appendChild(cap);
  return { wrap, canvas };
}

// Helper to lighten dark colors for visibility
function getVisibleColor(hex: string): string {
  // Remove # if present
  hex = hex.replace('#', '');
  // Parse r, g, b
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  // Perceived luminance
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luminance < 0.4) {
    // Blend with white (simple average)
    const lighten = (c: number) => Math.round((c * 255 + 255) / 2);
    return `rgb(${lighten(r)},${lighten(g)},${lighten(b)})`;
  }
  return '#' + hex;
}

function drawDial(ctx: CanvasRenderingContext2D, valDeg: number, color: string = '#1e90ff') {
  // Normalize angle to 0-360 range with 0° at top
  const normalizedDeg = ((valDeg % 360) + 360) % 360;
  const r = 18;
  ctx.clearRect(0,0,40,40);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#333';                  // background ring
  ctx.beginPath(); ctx.arc(20,20,r,0,Math.PI*2); ctx.stroke();

  // Draw the pointer arc segment
  const angleRad = -Math.PI/2 + normalizedDeg * Math.PI / 180; // 0° at top
  const arcWidth = 30 * Math.PI / 180; // 30° wide segment
  ctx.strokeStyle = getVisibleColor(color);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(20, 20, r, angleRad - arcWidth/2, angleRad + arcWidth/2);
  ctx.stroke();

  // Draw the value text
  ctx.fillStyle = getVisibleColor(color);
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(Math.round(valDeg) + '°', 20, 20);
}

function drawUpVector(ctx: CanvasRenderingContext2D, up: number[], color: string) {
  const size = 40;
  const center = size / 2;
  const radius = center - 2; // Radius of the sphere
  const arrowLength = radius * 0.8; // Slightly shorter than radius
  const aspectRatio = 0.5; // Match the circle's perspective ratio

  // Clear the canvas
  ctx.clearRect(0, 0, size, size);

  // Draw the background circle with perspective
  ctx.beginPath();
  ctx.ellipse(center, center + 2, radius, radius * aspectRatio, 0, Math.PI * 2, 0);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Negate to match forward vector convention (up is up)
  const x = -up[0] * arrowLength;
  const y = up[1] * arrowLength;
  const z = -up[2] * arrowLength;

  // Project to 2D with perspective
  const perspX = -x;  // Negate X to fix yaw rotation direction
  const perspY = -z * aspectRatio - y;

  // Draw the vector
  ctx.beginPath();
  ctx.moveTo(center, center);
  ctx.lineTo(center + perspX, center + perspY);
  ctx.strokeStyle = getVisibleColor(color);
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw the arrow head
  const angle = Math.atan2(perspY, perspX);
  const arrowSize = 4;
  ctx.beginPath();
  ctx.moveTo(center + perspX, center + perspY);
  ctx.lineTo(
    center + perspX - arrowSize * Math.cos(angle - Math.PI / 6),
    center + perspY - arrowSize * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    center + perspX - arrowSize * Math.cos(angle + Math.PI / 6),
    center + perspY - arrowSize * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fillStyle = getVisibleColor(color);
  ctx.fill();

  // Add depth indicator based on up vector's Y component
  const depthAlpha = Math.max(0.3, 1 - Math.abs(up[1]));
  ctx.globalAlpha = depthAlpha;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawForwardVector(ctx: CanvasRenderingContext2D, fwd: number[], color: string) {
  const size = 40;
  const center = size / 2;
  const radius = center - 2; // Radius of the sphere
  const arrowLength = radius * 0.8; // Slightly shorter than radius
  const aspectRatio = 0.5; // Match the circle's perspective ratio

  // Clear the canvas
  ctx.clearRect(0, 0, size, size);

  // Draw the background circle with perspective
  ctx.beginPath();
  ctx.ellipse(center, center + 2, radius, radius * aspectRatio, 0, Math.PI * 2, 0);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Negate to point away from viewer when facing north
  const x = -fwd[0] * arrowLength;
  const y = fwd[1] * arrowLength;
  const z = -fwd[2] * arrowLength;

  // Project to 2D with perspective
  const perspX = -x;  // Negate X to fix yaw rotation direction
  const perspY = -z * aspectRatio - y;

  // Draw the vector
  ctx.beginPath();
  ctx.moveTo(center, center);
  ctx.lineTo(center + perspX, center + perspY);
  ctx.strokeStyle = getVisibleColor(color);
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw the arrow head
  const angle = Math.atan2(perspY, perspX);
  const arrowSize = 4;
  ctx.beginPath();
  ctx.moveTo(center + perspX, center + perspY);
  ctx.lineTo(
    center + perspX - arrowSize * Math.cos(angle - Math.PI / 6),
    center + perspY - arrowSize * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    center + perspX - arrowSize * Math.cos(angle + Math.PI / 6),
    center + perspY - arrowSize * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fillStyle = getVisibleColor(color);
  ctx.fill();

  // Add depth indicator based on forward vector's Y component
  const depthAlpha = Math.max(0.3, 1 - Math.abs(fwd[1]));
  ctx.globalAlpha = depthAlpha;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawPrismIndicator(ctx: CanvasRenderingContext2D, euler: [number, number, number], color: string) {
  const size = 40;
  const center = size / 2;
  const prismHeight = 24; // from vertex to base (fits in 40x40)
  const thickness = prismHeight / 3; // 1/3 thickness
  const halfBase = Math.sqrt(prismHeight ** 2 - (prismHeight / 2) ** 2) / 2;

  // Triangle points (equilateral, pointing up before rotation)
  const points = [
    [0, -prismHeight / 2], // top vertex
    [-halfBase, prismHeight / 2], // bottom left
    [halfBase, prismHeight / 2] // bottom right
  ];

  // 2D rotation: combine yaw, pitch, roll for a dynamic effect
  // For 2D, yaw is most meaningful, but we can combine all for a lively dial
  const [yaw, pitch, roll] = euler;
  const angle = yaw + roll * 0.5 + pitch * 0.2; // weighted sum for visual effect
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  // Rotate and translate points
  const rotated = points.map(([x, y]) => [
    center + x * cosA - y * sinA,
    center + x * sinA + y * cosA
  ]);

  // Draw filled triangle (prism face)
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.moveTo(rotated[0][0], rotated[0][1]);
  ctx.lineTo(rotated[1][0], rotated[1][1]);
  ctx.lineTo(rotated[2][0], rotated[2][1]);
  ctx.closePath();
  ctx.fillStyle = getVisibleColor(color);
  ctx.fill();

  // Fake prism thickness: draw a shadow/side by offsetting the triangle
  const offset = thickness * 0.5;
  const shadow = rotated.map(([x, y]) => [x + offset, y + offset]);
  ctx.beginPath();
  ctx.moveTo(rotated[1][0], rotated[1][1]);
  ctx.lineTo(shadow[1][0], shadow[1][1]);
  ctx.lineTo(shadow[2][0], shadow[2][1]);
  ctx.lineTo(rotated[2][0], rotated[2][1]);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fill();

  // Optionally, draw triangle outline
  ctx.beginPath();
  ctx.moveTo(rotated[0][0], rotated[0][1]);
  ctx.lineTo(rotated[1][0], rotated[1][1]);
  ctx.lineTo(rotated[2][0], rotated[2][1]);
  ctx.closePath();
  ctx.strokeStyle = getVisibleColor(color);
  ctx.lineWidth = 2;
  ctx.stroke();
}

/* ---------- 3-D prism (quaternion-driven, no gimbal lock) ---------- */
function draw3DPrismIndicator(
  ctx   : CanvasRenderingContext2D,
  qRaw  : quat,                  // device quaternion
  color : string
) {
  /* canvas + prism sizes ------------------------------------------------ */
  const S = 40;                      // canvas
  const C = S / 2;                   // centre
  const H = 14;                      // triangle height
  const B = 14;                      // triangle base
  const D =  8;                      // prism depth

  /* prism vertices in sensor space ------------------------------------- */
  const h2 = H / 2, b2 = B / 2, d2 = D / 2;
  const V: vec3[] = [
    [ 0, -h2, -d2],  // 0 top-front
    [-b2,  h2, -d2], // 1 left-front
    [ b2,  h2, -d2], // 2 right-front
    [ 0, -h2,  d2],  // 3 top-back
    [-b2,  h2,  d2], // 4 left-back
    [ b2,  h2,  d2]  // 5 right-back
  ] as vec3[];

  /* 1)  quaternion that turns +Y (firmware forward) into –Z (screen) */
  const qCam = quat.setAxisAngle(quat.create(), [1,0,0],  Math.PI/2);

  /* 2)  flip 180° around Z to orient prism correctly */
  const qFlip = quat.setAxisAngle(quat.create(), [0,0,1],  Math.PI);

  /* 3)  apply transforms: camera then flip */
  const qView = quat.create();
  quat.mul(qView, qCam, qRaw);     // qCam · qDevice
  quat.mul(qView, qView, qFlip);   // then flip 180° around Z

  /* 4)  rotate every vertex with the view quaternion */
  const R: vec3[] = V.map(v => vec3.transformQuat(vec3.create(), v, qView));

  /* 4.5) create and transform "E" vertices in 3D space on front face */
  const SCALE = 1.9;               // tweak until it "feels" right
  const eSize = 4; // size of the "E"
  const eZ = -d2; // same Z as front face
  
  // Define "E" as line segments in 3D space (front face)
  const eVertices3D: vec3[] = [
    // Vertical line (left side) - flipped Y coordinates for canvas
    [-eSize/2, eSize/2 + 1, eZ], [-eSize/2, -eSize/2 + 1, eZ],
    // Top horizontal line
    [-eSize/2, eSize/2 + 1, eZ], [eSize/2, eSize/2 + 1, eZ],
    // Middle horizontal line
    [-eSize/2, 0 + 1, eZ], [eSize/4, 0 + 1, eZ],
    // Bottom horizontal line
    [-eSize/2, -eSize/2 + 1, eZ], [eSize/2, -eSize/2 + 1, eZ],
  ];
  
  // Transform "E" vertices with same quaternion
  const eVertices2D = eVertices3D.map(v => {
    const transformed = vec3.transformQuat(vec3.create(), v, qView);
    return [C - transformed[0]*SCALE, C - transformed[1]*SCALE];
  });

  /* 5)  project: drop Z, scale so the prism fits nicely */
  const P = R.map(([x,y,z]) => [C - x*SCALE, C - y*SCALE]); // negate X to fix yaw direction, invert Y for canvas

  /* faces (indices into P)  – draw back-most first */
  const F = [
    [3,4,5], [1,2,5,4], [0,1,4,3], [0,2,5,3], [0,1,2]   // back, bottom, left, right, front
  ];

  const main   = getVisibleColor(color);
  const shade1 = 'rgba(0,0,0,0.18)';
  const shade2 = 'rgba(0,0,0,0.10)';
  const faceCol= [shade2, shade1, shade2, shade2, main];

  /* 6)  draw ------------------------------------------------------------ */
  ctx.clearRect(0,0,S,S);
  F.forEach((f,i)=>{
    ctx.beginPath();
    ctx.moveTo(P[f[0]][0], P[f[0]][1]);
    f.slice(1).forEach(idx=>ctx.lineTo(P[idx][0], P[idx][1]));
    ctx.closePath();
    ctx.fillStyle   = faceCol[i];
    ctx.strokeStyle = main;
    ctx.lineWidth   = 1.2;
    ctx.fill();
    ctx.stroke();
    
    // Add letter "E" cutout to the front face (last face, index 4)
    if (i === 4) {
      // More robust check: use the average Z-depth of front face vertices
      // Front face should have the smallest (most negative) Z values when facing camera
      const frontFaceZ = R.slice(0, 3).reduce((sum, v) => sum + v[2], 0) / 3; // Average Z of front vertices
      const backFaceZ = R.slice(3, 6).reduce((sum, v) => sum + v[2], 0) / 3;  // Average Z of back vertices
      
      // Draw "E" if front face is closer to camera (more negative Z) than back face
      if (frontFaceZ < backFaceZ - 0.5) {  // Small threshold to avoid flickering
        // Save the current state
        ctx.save();
        
        // Set composite operation to cut out
        ctx.globalCompositeOperation = 'destination-out';
        
        // Draw "E" using transformed 3D vertices as line segments
        ctx.strokeStyle = 'black'; // Color doesn't matter for cutout
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        
        // Draw each line segment of the "E"
        for (let j = 0; j < eVertices2D.length; j += 2) {
          ctx.beginPath();
          ctx.moveTo(eVertices2D[j][0], eVertices2D[j][1]);
          ctx.lineTo(eVertices2D[j + 1][0], eVertices2D[j + 1][1]);
          ctx.stroke();
        }
        
        // Restore the previous state
        ctx.restore();
      }
    }
  });
}

export function renderCard(state: ConnectedDevice, hid: HidManager, store: DeviceStore) {

  const el = document.createElement('div');
  el.className = styles.card;

  const topRow = document.createElement('div');
  topRow.className = styles.topRow;

  const colorBox = document.createElement('input');
  colorBox.type  = 'color';
  colorBox.value = state.color;
  colorBox.className = styles.colorBox;
  topRow.appendChild(colorBox);

  const label = document.createElement('span');
  label.textContent = `${state.kind} ${state.arm?.side ?? ''} ${state.arm?.level ?? ''}`;
  label.className = styles.label;
  topRow.appendChild(label);

  const btnInfo = document.createElement('button');
  btnInfo.textContent = 'ⓘ';
  btnInfo.className = styles.btnInfo;
  topRow.appendChild(btnInfo);

  const btnCal = document.createElement('button');
  btnCal.textContent = '↻';
  btnCal.className   = styles.btnCal;
  topRow.appendChild(btnCal);

  const btnX = document.createElement('button');
  btnX.textContent = '✕';
  btnX.className   = styles.btnX;
  topRow.appendChild(btnX);

  el.appendChild(topRow);

  /* listeners */
  colorBox.oninput = () => {
    const rgb = colorBox.value.match(/\w\w/g)!.map(x => parseInt(x, 16)) as [number, number, number];
    const dev = hid['devices'].get(state.id);
    if (dev) hid.setColor(dev, rgb);           // write feature report
  
    state.color = colorBox.value;              // update local snapshot
    /* 🔔 notify store so scene & other UI react */
    store.dispatchEvent(new CustomEvent('update', { detail: state }));
  };

  btnCal.onclick = () => hid.sendCalibrate(state.id);
  btnX  .onclick = () => { hid.unpair(state.id); store['map'].delete(state.id); el.remove(); };

  btnInfo.onclick = ()=> {
    const now = btnInfo.classList.toggle(styles.highlighted);
    // remove highlight from other cards
    document.querySelectorAll('.btnInfo').forEach(b=>{
      if(b!==btnInfo) b.classList.remove(styles.highlighted);
    });
    setSelected(now ? state.id : null);
  };
  btnInfo.classList.add('btnInfo');

  document.addEventListener('deviceColor', e =>{
    const { id, hex } = (e as CustomEvent<any>).detail;
    if(id === state.id) colorBox.value = hex;
  });

  document.addEventListener('deviceRemoved', e => {
    if ((e as CustomEvent<{id:string}>).detail.id === state.id) {
      el.remove();
    }
  });

  // Finger bars
  if(state.finger){
    const container = document.createElement('div');
    container.className = styles.fingerContainer;
    
    // Create rows with labels
    const fingerLabels = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
    const rows = fingerLabels.map((label, rowIndex) => {
      const row = document.createElement('div');
      row.className = styles.fingerRow;
      
      // Add label
      const labelEl = document.createElement('span');
      labelEl.textContent = label;
      labelEl.className = styles.fingerLabel;
      row.appendChild(labelEl);
      
      // Add bars container
      const barsContainer = document.createElement('div');
      barsContainer.className = styles.barsContainer;
      
      // Number of bars for this row (4 for thumb, 3 for others)
      const numBars = rowIndex === 0 ? 4 : 3;
      const startIdx = rowIndex === 0 ? 0 : (rowIndex - 1) * 3 + 4;
      
      for(let i = 0; i < numBars; i++) {
        const bar = document.createElement('div');
        bar.className = styles.bar;
        bar.dataset['idx'] = String(startIdx + i);
        
        // Add inner bar for the filled portion
        const innerBar = document.createElement('div');
        innerBar.className = styles.innerBar;
        bar.appendChild(innerBar);
        
        barsContainer.appendChild(bar);
      }
      
      row.appendChild(barsContainer);
      return row;
    });
    
    rows.forEach(row => container.appendChild(row));
    el.appendChild(container);
  
    /* update bars on store update */
    store.addEventListener('update', ev=>{
      const s = (ev as CustomEvent<DeviceState>).detail;
      const norm = s.fingerSmooth ?? s.fingerNorm!;

      if(s.id!==state.id||!s.fingerNorm) return;
      
      container.querySelectorAll('[data-idx]').forEach((bar)=>{
        const idx = parseInt((bar as HTMLElement).dataset['idx']!);
        const innerBar = bar.firstElementChild as HTMLElement;
        innerBar.style.width = `${Math.round(norm[idx]*100)}%`;
        innerBar.style.backgroundColor = state.color;
        (bar as HTMLElement).style.backgroundColor = '#333'; // Darker background for empty portion
      });
    });
  }

  /* ----- Euler dials ----- */
  const dialWrap = document.createElement('div');
  dialWrap.className = styles.dialWrap;
  const prism = createPrismIndicatorCanvas();
  const dYaw = createDial('Yaw');
  const dPit = createDial('Pitch');
  const dRol = createDial('Roll');
  const fVec = createForwardVectorCanvas();
  const uVec = createUpVectorCanvas();
  dialWrap.appendChild(prism.wrap);
  dialWrap.appendChild(fVec.wrap);
  dialWrap.appendChild(uVec.wrap);
  [dYaw, dPit, dRol].forEach(d => dialWrap.appendChild(d.wrap));
  el.appendChild(dialWrap);

  // Throttle canvas updates to 10fps max to prevent browser freeze
  let lastCanvasUpdate = 0;
  const CANVAS_UPDATE_INTERVAL = 50; // 10fps max

  const updateDials = (s: ConnectedDevice) =>{
    const now = performance.now();
    if (now - lastCanvasUpdate < CANVAS_UPDATE_INTERVAL) {
      return; // Skip update if too frequent
    }
    lastCanvasUpdate = now;

    const [yaw,pit,rol] = eulerXYZ(s.quat);
    draw3DPrismIndicator(
      prism.canvas.getContext('2d')!,
      s.quat,       // pass the **quaternion**
      s.color
    );
    const [yawDeg,pitDeg,rolDeg] = [yaw,pit,rol].map(rad=>rad*180/Math.PI);
    // Adjust yaw so that facing north = 0° instead of 180°
    const adjustedYaw = -yawDeg + (yawDeg < 0 ? -180 : 180);
    drawDial(dYaw.canvas.getContext('2d')!, adjustedYaw, s.color);
    drawDial(dPit.canvas.getContext('2d')!, pitDeg, s.color);
    drawDial(dRol.canvas.getContext('2d')!, rolDeg, s.color);
    drawForwardVector(fVec.canvas.getContext('2d')!, Array.from(s.fwd), s.color);
    drawUpVector(uVec.canvas.getContext('2d')!, Array.from(s.up), s.color);
  };
  
  /* run immediately and on every device update */
  updateDials(state);
  store.addEventListener('update', ev=>{
    const s = (ev as CustomEvent<ConnectedDevice>).detail;
    if(s.id===state.id) updateDials(s);
  });

  return el;
}
