import { prefs } from '../../core/preferences';

export function mountStereoCam(parent: HTMLElement) {
  const wrap = document.createElement('div');
  wrap.id = 'stereoCam';
  wrap.className = 'flex flex-col gap-1 pb-6 border-b border-neutral-700';
  
  // Add title
  wrap.innerHTML = `
    <h3 class="mb-1 font-medium">
      🥽 Stereo Camera Vision
    </h3>
  `;
  
  // Create image container
  const imgContainer = document.createElement('div');
  imgContainer.className = 'flex justify-center gap-1 py-4'; // Added padding for rotation
  wrap.appendChild(imgContainer);

  const makeImg = (deg:number) =>{
    const img = document.createElement('img');
    img.width = 120; img.height = 160;
    img.style.transform = `rotate(${deg}deg)`;
    img.crossOrigin = 'anonymous';
    img.loading = 'lazy';
    return img;
  };
  const imgL = makeImg( 90);
  const imgR = makeImg(-90);
  imgContainer.append(imgL, imgR);

  const updateSrc = ()=>{
    imgL.src = prefs.leftURL;
    imgR.src = prefs.rightURL;
    wrap.style.display = prefs.stereoEnabled ? 'flex' : 'none';
  };
  updateSrc();
  document.addEventListener('prefsChanged', updateSrc);
  
  parent.appendChild(wrap);
}
