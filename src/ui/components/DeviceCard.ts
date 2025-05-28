import { DeviceState } from '../../types/types';
import { HidManager }  from '../../core/HidManager';
import { DeviceStore } from '../../core/DeviceStore';
import { eulerXYZ } from '../../core/mathUtils';
import { setSelected } from '../App';

function createDial(label: string) {
  const wrap  = document.createElement('div');
  wrap.className = 'flex flex-col items-center';
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 40;
  const cap    = document.createElement('span');
  cap.textContent = label;
  cap.className = 'text-[10px] mt-0.5';
  wrap.appendChild(canvas);
  wrap.appendChild(cap);
  return { wrap, canvas };
}

function createForwardVectorCanvas() {
  const wrap = document.createElement('div');
  wrap.className = 'flex flex-col items-center';
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 40;
  const cap = document.createElement('span');
  cap.textContent = 'Forward';
  cap.className = 'text-[10px] mt-0.5';
  wrap.appendChild(canvas);
  wrap.appendChild(cap);
  return { wrap, canvas };
}

function drawDial(ctx: CanvasRenderingContext2D, valDeg: number, color: string = '#1e90ff') {
  const pct = (valDeg + 180) / 360;          // −180…+180 → 0…1
  const r = 18;
  ctx.clearRect(0,0,40,40);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#333';                  // background ring
  ctx.beginPath(); ctx.arc(20,20,r,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle = color;               // value arc
  ctx.beginPath(); ctx.arc(20,20,r,-Math.PI/2, -Math.PI/2 + pct*2*Math.PI);
  ctx.stroke();

  // Draw the value text
  ctx.fillStyle = color;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(Math.round(valDeg) + '°', 20, 20);
}

function drawForwardVector(ctx: CanvasRenderingContext2D, quat: number[], color: string) {
  const size = 40;
  const center = size / 2;
  const radius = center - 2; // Radius of the sphere
  const arrowLength = radius; // Fixed arrow length
  const aspectRatio = 0.5; // Match the circle's perspective ratio

  // Clear the canvas
  ctx.clearRect(0, 0, size, size);

  // Draw the background circle with perspective
  ctx.beginPath();
  ctx.ellipse(center, center + 2, radius, radius * aspectRatio, 0, Math.PI * 2, 0);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Get Euler angles from quaternion
  const [yaw, pitch, roll] = eulerXYZ(new Float32Array(quat));

  // Calculate 3D vector with constant length
  const x = Math.sin(yaw) * Math.cos(pitch) * arrowLength;
  const y = Math.sin(pitch) * arrowLength;
  const z = Math.cos(yaw) * Math.cos(pitch) * arrowLength;

  // Project to 2D with perspective
  // Only scale the depth (z) component to maintain constant length
  const perspX = x;
  const perspY = -z * aspectRatio - y;

  // Draw the vector
  ctx.beginPath();
  ctx.moveTo(center, center);
  ctx.lineTo(center + perspX, center + perspY);
  ctx.strokeStyle = color;
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
  ctx.fillStyle = color;
  ctx.fill();

  // Add depth indicator based on pitch
  const depthAlpha = Math.max(0.3, 1 - (Math.abs(pitch)));
  ctx.globalAlpha = depthAlpha;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function renderCard(state: DeviceState, hid: HidManager, store: DeviceStore) {

  const el = document.createElement('div');
  el.className = 'flex flex-col gap-2 border-b border-neutral-700 py-1';

  const topRow = document.createElement('div');
  topRow.className = 'flex items-center gap-2 w-full';

  const colorBox = document.createElement('input');
  colorBox.type  = 'color';
  colorBox.value = state.color;
  colorBox.className = 'w-5 h-6 border-none bg-transparent p-0';
  topRow.appendChild(colorBox);

  const label = document.createElement('span');
  label.textContent = `${state.kind} ${state.arm?.side ?? ''} ${state.arm?.level ?? ''}`;
  label.className = 'flex-1';
  topRow.appendChild(label);

  const btnInfo = document.createElement('button');
  btnInfo.textContent = 'ⓘ';
  btnInfo.className = 'px-2';
  topRow.appendChild(btnInfo);

  const btnCal = document.createElement('button');
  btnCal.textContent = '↻';
  btnCal.className   = 'px-2';
  topRow.appendChild(btnCal);

  const btnX = document.createElement('button');
  btnX.textContent = '✕';
  btnX.className   = 'px-2';
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
    const now = btnInfo.classList.toggle('text-blue-400'); // highlight
    // remove highlight from other cards
    document.querySelectorAll('.btnInfo').forEach(b=>{
      if(b!==btnInfo) b.classList.remove('text-blue-400');
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
    container.className = 'w-full mt-2';
    
    // Create rows with labels
    const fingerLabels = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
    const rows = fingerLabels.map((label, rowIndex) => {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2';
      
      // Add label
      const labelEl = document.createElement('span');
      labelEl.textContent = label;
      labelEl.className = 'text-[10px] w-8';
      row.appendChild(labelEl);
      
      // Add bars container
      const barsContainer = document.createElement('div');
      barsContainer.className = 'flex-1 flex gap-1';
      
      // Number of bars for this row (4 for thumb, 3 for others)
      const numBars = rowIndex === 0 ? 4 : 3;
      const startIdx = rowIndex === 0 ? 0 : (rowIndex - 1) * 3 + 4;
      
      for(let i = 0; i < numBars; i++) {
        const bar = document.createElement('div');
        bar.className = 'h-1 bg-neutral-700 flex-1 relative';
        bar.dataset['idx'] = String(startIdx + i);
        
        // Add inner bar for the filled portion
        const innerBar = document.createElement('div');
        innerBar.className = 'absolute inset-0';
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
  dialWrap.className = 'flex gap-1 m-auto';          // push to right
  const dYaw = createDial('Yaw');
  const dPit = createDial('Pitch');
  const dRol = createDial('Roll');
  const fVec = createForwardVectorCanvas();
  [dYaw, dPit, dRol].forEach(d => dialWrap.appendChild(d.wrap));
  dialWrap.appendChild(fVec.wrap);
  el.appendChild(dialWrap);

  const updateDials = (s: DeviceState) =>{
    const [yaw,pit,rol] = eulerXYZ(s.quat).map(rad=>rad*180/Math.PI);
    drawDial(dYaw.canvas.getContext('2d')!, yaw, s.color);
    drawDial(dPit.canvas.getContext('2d')!, pit, s.color);
    drawDial(dRol.canvas.getContext('2d')!, rol, s.color);
    drawForwardVector(fVec.canvas.getContext('2d')!, Array.from(s.quat), s.color);
  };
  
  /* run immediately and on every device update */
  updateDials(state);
  store.addEventListener('update', ev=>{
    const s = (ev as CustomEvent<DeviceState>).detail;
    if(s.id===state.id) updateDials(s);
  });

  return el;
}
