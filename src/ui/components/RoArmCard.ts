import { prefs } from '../../core/preferences';
import { RoArmController } from '../../core/RoArmController';

export function mountRoArmCard(side: 'left'|'right', parent: HTMLElement, ctrl: RoArmController){
  const wrap = document.createElement('div');
  wrap.className = 'border-t border-neutral-700 pt-1 mt-1';
  wrap.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="font-semibold text-sm">${side.toUpperCase()} Ro-Arm</span>
      <button class="btn px-1" id="p">${ctrl['paused']?.[side]?'▶':'⏸'}</button>
      <span id="xyz" class="text-xs ml-auto">x:- y:- z:-</span>
    </div>`;
  parent.appendChild(wrap);

  const btn  = wrap.querySelector('#p')   as HTMLButtonElement;
  const xyz  = wrap.querySelector('#xyz') as HTMLSpanElement;

  btn.onclick = ()=>{
    ctrl.togglePause(side);
    btn.textContent = btn.textContent==='⏸'?'▶':'⏸';
  };

  document.addEventListener('roStatus', e=>{
    const d = (e as CustomEvent<any>).detail;
    if(d.side!==side) return;
    xyz.textContent = `x:${d.xyz[0].toFixed(2)} y:${d.xyz[1].toFixed(2)} z:${d.xyz[2].toFixed(2)}`;
  });
}
