import { DeviceState } from '../../core/types';
import { HidManager }  from '../../core/HidManager';
import { DeviceStore } from '../../core/DeviceStore';
import { eulerXYZ } from '../../core/mathUtils';

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
  [dYaw, dPit, dRol].forEach(d => dialWrap.appendChild(d.wrap));
  el.appendChild(dialWrap);

  const updateDials = (s: DeviceState) =>{
    const [yaw,pit,rol] = eulerXYZ(s.quat).map(rad=>rad*180/Math.PI);
    drawDial(dYaw.canvas.getContext('2d')!, yaw, s.color);
    drawDial(dPit.canvas.getContext('2d')!, pit, s.color);
    drawDial(dRol.canvas.getContext('2d')!, rol, s.color);
  };
  
  /* run immediately and on every device update */
  updateDials(state);
  store.addEventListener('update', ev=>{
    const s = (ev as CustomEvent<DeviceState>).detail;
    if(s.id===state.id) updateDials(s);
  });
  

  return el;
}
