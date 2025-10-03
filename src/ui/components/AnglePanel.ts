// src/ui/components/AnglePanel.ts
import { ArmSolver } from '../../core/ArmSolver';
import styles from './styles/AnglePanel.module.css';

// Global state for angle mode toggle - load from localStorage
let useActuatorAngles = localStorage.getItem('useActuatorAngles') === 'true';

export function mountAnglePanel(parent: HTMLElement, solver: ArmSolver) {
  /* ------------------------------------------------------------
   * Build wrapper element and inject table markup
   * ---------------------------------------------------------- */
  const wrapper = document.createElement('div');
  wrapper.className = styles.wrapper;
  wrapper.innerHTML = `
    <div class="${styles.header}">
      <h3 class="${styles.title}">
        📐 Actuator Angles
      </h3>
      <button id="angleMode" class="${styles.toggleButton}" style="width: 40px;">
        ${useActuatorAngles ? '◻️' : '▶'}
      </button>
    </div>

    <table class="${styles.anglesTable}" id="tblAngles">
      <thead>
        <tr>
          <th></th><th>Yaw</th><th>Pitch</th><th>Roll</th>
          <th>Flex</th><th>FA-Roll</th><th>W-Pitch</th><th>W-Yaw</th>
        </tr>
      </thead>
      <tbody>
        <tr id="rowL"><td>L</td>${'<td>-</td>'.repeat(7)}</tr>
        <tr id="rowR"><td>R</td>${'<td>-</td>'.repeat(7)}</tr>
      </tbody>
    </table>
  `;

  /* Append once—does NOT replace sidebar, so button listeners survive */
  parent.appendChild(wrapper);

  /* ------------------------------------------------------------
   * Cache cell references for fast updates
   * ---------------------------------------------------------- */
  const rowL = wrapper.querySelector('#rowL') as HTMLTableRowElement;
  const rowR = wrapper.querySelector('#rowR') as HTMLTableRowElement;
  const tdL  = (i: number) => rowL.children[i + 1] as HTMLTableCellElement;
  const tdR  = (i: number) => rowR.children[i + 1] as HTMLTableCellElement;
  
  /* ------------------------------------------------------------
   * Toggle button functionality
   * ---------------------------------------------------------- */
  const toggleBtn = wrapper.querySelector('#angleMode') as HTMLButtonElement;
  
  toggleBtn.onclick = () => {
    useActuatorAngles = !useActuatorAngles;
    toggleBtn.textContent = useActuatorAngles ? '◻️' : '▶';
    console.log('AnglePanel: Toggle clicked, new state:', useActuatorAngles);
    
    // Save to localStorage
    localStorage.setItem('useActuatorAngles', useActuatorAngles.toString());
    
    // Dispatch event to notify skeletal rig of mode change
    document.dispatchEvent(new CustomEvent('angleModeChanged', {
      detail: { useActuatorAngles }
    }));
    console.log('AnglePanel: Event dispatched');
  };

  /* ------------------------------------------------------------
   * Dispatch initial state on load
   * ---------------------------------------------------------- */
  setTimeout(() => {
    document.dispatchEvent(new CustomEvent('angleModeChanged', {
      detail: { useActuatorAngles }
    }));
    console.log('AnglePanel: Initial state dispatched:', useActuatorAngles);
  }, 100);

  /* ------------------------------------------------------------
   * Update on solver event
   * ---------------------------------------------------------- */
  solver.addEventListener('angles', () => {
    const left  = solver.getAngles('left');
    const right = solver.getAngles('right');

    if (left)  Object.values(left ).forEach((v, i) => tdL(i).textContent = `${v.toFixed(0)}°`);
    if (right) Object.values(right).forEach((v, i) => tdR(i).textContent = `${v.toFixed(0)}°`);
  });
}

// Export function to get current mode
export function getAngleModeState() {
  return useActuatorAngles;
}
