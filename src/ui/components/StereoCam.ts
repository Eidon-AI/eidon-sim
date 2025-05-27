import { prefs } from '../../core/preferences';

export function mountStereoCam(parent: HTMLElement) {
  const wrap = document.createElement('div');
  wrap.id = 'stereoCam';
  wrap.className = 'flex flex-col gap-1 pb-1 border-b border-neutral-700';
  
  // Add title
  wrap.innerHTML = `
    <h3 class="mb-1 font-medium">
      🥽 Stereo Camera Vision
    </h3>
  `;
  
  // Create image container
  const imgContainer = document.createElement('div');
  imgContainer.className = 'flex justify-center gap-1 pt-2 pb-4'; // Added padding for rotation
  wrap.appendChild(imgContainer);

  const makeImg = (deg:number, isLeft: boolean) =>{
    const link = document.createElement('a');
    link.target = '_blank';
    link.className = 'cursor-pointer';
    
    const img = document.createElement('img');
    img.width = 120;
    img.style.minHeight = '120px';
    img.style.backgroundColor = isLeft ? '#444' : '#444';
    img.style.borderRadius = '30px';
    img.style.transform = `rotate(${deg}deg)`;
    img.crossOrigin = 'anonymous';
    img.loading = 'lazy';
    
    link.appendChild(img);
    return link;
  };
  const imgL = makeImg( 90, true);
  const imgR = makeImg(-90, false);
  imgContainer.append(imgL, imgR);

  const updateSrc = ()=>{
    const leftImg = imgL.firstElementChild as HTMLImageElement;
    const rightImg = imgR.firstElementChild as HTMLImageElement;
    
    // Update image sources
    leftImg.src = prefs.leftURL;
    rightImg.src = prefs.rightURL;
    
    // Update link URLs - strip port numbers
    const leftUrl = new URL(prefs.leftURL);
    const rightUrl = new URL(prefs.rightURL);
    const leftBaseUrl = `${leftUrl.protocol}//${leftUrl.hostname}`;
    const rightBaseUrl = `${rightUrl.protocol}//${rightUrl.hostname}`;
    (imgL as HTMLAnchorElement).href = leftBaseUrl;
    (imgR as HTMLAnchorElement).href = rightBaseUrl;
    
    wrap.style.display = prefs.stereoEnabled ? 'flex' : 'none';
  };
  updateSrc();
  document.addEventListener('prefsChanged', updateSrc);
  
  parent.appendChild(wrap);
}
