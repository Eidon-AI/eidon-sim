// src/ui/components/AnglePanel.ts
import { ArmSolver } from '../../core/ArmSolver';
import styles from './styles/AnglePanel.module.css';

export function mountAnglePanel(parent: HTMLElement, solver: ArmSolver) {
  /* ------------------------------------------------------------
   * Build wrapper element and inject table markup
   * ---------------------------------------------------------- */
  const wrapper = document.createElement('div');
  wrapper.className = styles.wrapper;
  
  const content = document.createElement('div');
  content.className = styles.content;
  content.innerHTML = `
    <!-- Shoulder Angles -->
    <div class="${styles.angleGroup}">
      <div class="${styles.groupTitle}">
        <i class="fas fa-user-circle"></i>
        Shoulder
      </div>
      <table class="${styles.anglesTable}" id="tblShoulder">
        <thead>
          <tr>
            <th></th><th>Abduction</th><th>Flexion</th><th>Rotation</th>
          </tr>
        </thead>
        <tbody>
          <tr id="shRowL"><td>L</td><td id="shL0">-</td><td id="shL1">-</td><td id="shL2">-</td></tr>
          <tr id="shRowR"><td>R</td><td id="shR0">-</td><td id="shR1">-</td><td id="shR2">-</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Elbow Angles -->
    <div class="${styles.angleGroup}">
      <div class="${styles.groupTitle}">
        <i class="fas fa-angle-double-right"></i>
        Elbow
      </div>
      <table class="${styles.anglesTable}" id="tblElbow">
        <thead>
          <tr>
            <th></th><th>Flexion</th>
          </tr>
        </thead>
        <tbody>
          <tr id="elRowL"><td>L</td><td id="elL0">-</td></tr>
          <tr id="elRowR"><td>R</td><td id="elR0">-</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Wrist Angles -->
    <div class="${styles.angleGroup}">
      <div class="${styles.groupTitle}">
        <i class="fas fa-hand-paper"></i>
        Wrist
      </div>
      <table class="${styles.anglesTable}" id="tblWrist">
        <thead>
          <tr>
            <th></th><th>Flexion</th><th>Deviation</th><th>Pronation</th>
          </tr>
        </thead>
        <tbody>
          <tr id="wrRowL"><td>L</td><td id="wrL0">-</td><td id="wrL1">-</td><td id="wrL2">-</td></tr>
          <tr id="wrRowR"><td>R</td><td id="wrR0">-</td><td id="wrR1">-</td><td id="wrR2">-</td></tr>
        </tbody>
      </table>
    </div>
  `;
  
  wrapper.appendChild(content);

  /* Append once—does NOT replace sidebar, so button listeners survive */
  parent.appendChild(wrapper);

  /* ------------------------------------------------------------
   * Cache cell references for fast updates
   * ---------------------------------------------------------- */
  // Shoulder cells (index 0=yaw, 1=pitch, 2=roll)
  const shL = {
    0: content.querySelector('#shL0') as HTMLTableCellElement,
    1: content.querySelector('#shL1') as HTMLTableCellElement,
    2: content.querySelector('#shL2') as HTMLTableCellElement,
  };
  const shR = {
    0: content.querySelector('#shR0') as HTMLTableCellElement,
    1: content.querySelector('#shR1') as HTMLTableCellElement,
    2: content.querySelector('#shR2') as HTMLTableCellElement,
  };
  
  // Elbow cells (index 0=flex)
  const elL = {
    0: content.querySelector('#elL0') as HTMLTableCellElement,
  };
  const elR = {
    0: content.querySelector('#elR0') as HTMLTableCellElement,
  };
  
  // Wrist cells (index 0=w-pitch, 1=w-yaw, 2=fa-roll for pronation)
  const wrL = {
    0: content.querySelector('#wrL0') as HTMLTableCellElement,
    1: content.querySelector('#wrL1') as HTMLTableCellElement,
    2: content.querySelector('#wrL2') as HTMLTableCellElement,
  };
  const wrR = {
    0: content.querySelector('#wrR0') as HTMLTableCellElement,
    1: content.querySelector('#wrR1') as HTMLTableCellElement,
    2: content.querySelector('#wrR2') as HTMLTableCellElement,
  };

  /* ------------------------------------------------------------
   * Update on solver event
   * ---------------------------------------------------------- */
  solver.addEventListener('angles', () => {
    const left  = solver.getAngles('left');
    const right = solver.getAngles('right');

    if (left) {
      // Shoulder: Yaw, Pitch, Roll (indices 0, 1, 2)
      shL[0].textContent = `${left.shYaw.toFixed(0)}°`;
      shL[1].textContent = `${left.shPitch.toFixed(0)}°`;
      shL[2].textContent = `${left.shRoll.toFixed(0)}°`;
      // Elbow: Flex (index 3)
      elL[0].textContent = `${left.elFlex.toFixed(0)}°`;
      // Wrist: W-Pitch, W-Yaw, FA-Roll (indices 5, 6, 4)
      wrL[0].textContent = `${left.wrPitch.toFixed(0)}°`;
      wrL[1].textContent = `${left.wrYaw.toFixed(0)}°`;
      wrL[2].textContent = `${left.faRoll.toFixed(0)}°`;
    }
    
    if (right) {
      // Shoulder: Yaw, Pitch, Roll (indices 0, 1, 2)
      shR[0].textContent = `${right.shYaw.toFixed(0)}°`;
      shR[1].textContent = `${right.shPitch.toFixed(0)}°`;
      shR[2].textContent = `${right.shRoll.toFixed(0)}°`;
      // Elbow: Flex (index 3)
      elR[0].textContent = `${right.elFlex.toFixed(0)}°`;
      // Wrist: W-Pitch, W-Yaw, FA-Roll (indices 5, 6, 4)
      wrR[0].textContent = `${right.wrPitch.toFixed(0)}°`;
      wrR[1].textContent = `${right.wrYaw.toFixed(0)}°`;
      wrR[2].textContent = `${right.faRoll.toFixed(0)}°`;
    }
  });
}
