import { prefs } from '../../core/preferences';
import { RoArmController } from '../../core/RoArmController';

export function mountRoArmCard(parent: HTMLElement, ctrl: RoArmController){
  const wrap = document.createElement('div');
  wrap.className = 'border-b border-neutral-700 pb-3 mt-1';
  wrap.innerHTML = `
    <div class="flex flex-col gap-2">
      <div class="flex items-center">
        <h3 class="mb-1 font-medium">
          🦾 Teleoperation
        </h3>
      </div>
      <div class="flex items-center gap-2">
        <span class="font-semibold text-sm">LEFT Ro-Arm</span>
        <span id="xyz-left" class="text-xs ml-auto">x:- y:- z:-</span>
        <button style="width: 40px;" class="px-1" id="p-left">${ctrl['paused']?.['left']?'▶':'◻️'}</button>
      </div>
      <div class="flex items-center gap-2">
        <span class="font-semibold text-sm">RIGHT Ro-Arm</span>
        <span id="xyz-right" class="text-xs ml-auto">x:- y:- z:-</span>
        <button style="width: 40px;" class="px-1" id="p-right">${ctrl['paused']?.['right']?'▶':'◻️'}</button>
      </div>
    </div>`;
  parent.appendChild(wrap);

  const btnLeft = wrap.querySelector('#p-left') as HTMLButtonElement;
  const btnRight = wrap.querySelector('#p-right') as HTMLButtonElement;
  const xyzLeft = wrap.querySelector('#xyz-left') as HTMLSpanElement;
  const xyzRight = wrap.querySelector('#xyz-right') as HTMLSpanElement;

  btnLeft.onclick = ()=>{
    ctrl.togglePause('left');
    btnLeft.textContent = btnLeft.textContent==='◻️'?'▶':'◻️';
  };

  btnRight.onclick = ()=>{
    ctrl.togglePause('right');
    btnRight.textContent = btnRight.textContent==='◻️'?'▶':'◻️';
  };

  document.addEventListener('roStatus', e=>{
    const d = (e as CustomEvent<any>).detail;
    const xyz = d.side === 'left' ? xyzLeft : xyzRight;
    xyz.textContent = `x:${d.xyz[0].toFixed(2)} y:${d.xyz[1].toFixed(2)} z:${d.xyz[2].toFixed(2)}`;
  });
}
