// src/ui/components/AnglePanel.ts
import { ArmSolver } from '../../core/ArmSolver';

export function mountAnglePanel(parent: HTMLElement, solver: ArmSolver) {
  /* ------------------------------------------------------------
   * Build wrapper element and inject table markup
   * ---------------------------------------------------------- */
  const wrapper = document.createElement('div');
  wrapper.className = 'flex flex-col pb-1';
  wrapper.innerHTML = `
    <h3 class="mb-1 font-medium">
      📐 Actuator Angles
    </h3>

    <table class="text-xs w-full border-separate border-spacing-x-2" id="tblAngles">
      <thead>
        <tr>
          <th></th><th>Yaw</th><th>Pitch</th><th>Roll</th>
          <th>Flex</th><th>FA-Roll</th><th>W-Pitch</th><th>W-Yaw</th>
        </tr>
      </thead>
      <tbody>
        <tr id="rowL"><td>L</td>${'<td class="text-right">-</td>'.repeat(7)}</tr>
        <tr id="rowR"><td>R</td>${'<td class="text-right">-</td>'.repeat(7)}</tr>
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
   * Update on solver event
   * ---------------------------------------------------------- */
  solver.addEventListener('angles', () => {
    const left  = solver.getAngles('left');
    const right = solver.getAngles('right');

    if (left)  Object.values(left ).forEach((v, i) => tdL(i).textContent = `${v.toFixed(0)}°`);
    if (right) Object.values(right).forEach((v, i) => tdR(i).textContent = `${v.toFixed(0)}°`);
  });
}
