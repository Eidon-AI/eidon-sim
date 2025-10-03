import styles from './styles/AuthModal.module.css';

export class AuthModal {
  private modal: HTMLDivElement | null = null;
  private onSignIn: () => void;
  private onExploreAnonymously: () => void;

  constructor(onSignIn: () => void, onExploreAnonymously: () => void) {
    this.onSignIn = onSignIn;
    this.onExploreAnonymously = onExploreAnonymously;
  }

  mount(root: HTMLElement) {
    // Create the auth modal
    this.modal = document.createElement('div');
    this.modal.className = styles.overlay;
    this.modal.innerHTML = `
      <div class="${styles.container}">
        <button id="closeModalBtn" class="${styles.closeButton}">×</button>
        <div class="${styles.content}">
          <div class="${styles.logoContainer}">
            <img src="/eidon_ai_logo.svg" alt="Eidon AI" class="${styles.logo}" />
            <div class="${styles.subtitle}">The Robotics Data Network</div>
          </div>
          
          <div class="${styles.buttons}">
            <button id="signInBtn" class="${styles.button} ${styles.primary}">
              Sign In
            </button>
            <a id="exploreAnonymouslyBtn" class="${styles.link}">
              Explore Anonymously
            </a>
          </div>
        </div>
      </div>
    `;

    root.appendChild(this.modal);

    // Add event listeners
    const signInBtn = this.modal.querySelector('#signInBtn') as HTMLButtonElement;
    const exploreAnonymouslyBtn = this.modal.querySelector('#exploreAnonymouslyBtn') as HTMLAnchorElement;
    const closeModalBtn = this.modal.querySelector('#closeModalBtn') as HTMLButtonElement;

    signInBtn.addEventListener('click', this.onSignIn);
    exploreAnonymouslyBtn.addEventListener('click', this.onExploreAnonymously);
    closeModalBtn.addEventListener('click', this.onExploreAnonymously); // Close modal on X click
  }

  unmount() {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }

  show() {
    if (this.modal) {
      this.modal.style.display = 'flex';
    }
  }

  hide() {
    if (this.modal) {
      this.modal.style.display = 'none';
    }
  }
}
