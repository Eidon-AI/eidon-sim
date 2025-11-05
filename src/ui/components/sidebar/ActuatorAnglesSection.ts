// src/ui/components/sidebar/ActuatorAnglesSection.ts
import { ArmSolver } from '../../../core/ArmSolver';
import { mountAnglePanel } from '../AnglePanel';
import styles from './styles/ActuatorAnglesSection.module.css';

export class ActuatorAnglesSection {
  private section: HTMLElement;
  private content: HTMLElement;
  private isExpanded: boolean = true; // Default expanded

  constructor() {
    this.section = document.createElement('div');
    this.section.className = styles.section;
    
    this.section.innerHTML = `
      <div class="${styles.sectionHeader}">
        <div class="${styles.titleRow}">
          <h4 class="${styles.sectionTitle}">
            <i class="fas fa-chevron-down ${styles.chevron}"></i>
            📐 Actuator Angles
          </h4>
        </div>
        <div class="${styles.colorIndicator}">
          <span class="${styles.colorDot}" style="background-color: #ff69b4;"></span>
          <span class="${styles.colorLabel}">Forward Vector</span>
          <span class="${styles.colorDot}" style="background-color: #00ff00;"></span>
          <span class="${styles.colorLabel}">Up Vector</span>
        </div>
      </div>
      <div class="${styles.sectionContent}">
      </div>
    `;
    
    this.content = this.section.querySelector(`.${styles.sectionContent}`) as HTMLElement;
    
    // Initialize as expanded
    this.section.classList.add(styles.expanded);
    this.content.style.display = '';
    
    const header = this.section.querySelector(`.${styles.sectionHeader}`) as HTMLElement;
    header.addEventListener('click', () => this.toggle());
  }

  public mount(parent: HTMLElement, solver: ArmSolver): void {
    parent.appendChild(this.section);
    mountAnglePanel(this.content, solver);
  }

  public toggle(): void {
    this.isExpanded = !this.isExpanded;
    
    if (this.isExpanded) {
      this.section.classList.add(styles.expanded);
      this.content.style.display = '';
    } else {
      this.section.classList.remove(styles.expanded);
      this.content.style.display = 'none';
    }
  }

  public getElement(): HTMLElement {
    return this.section;
  }

  public unmount(): void {
    this.section.remove();
  }
}

