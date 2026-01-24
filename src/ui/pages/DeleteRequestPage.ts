import styles from './styles/DeleteRequestPage.module.css';
import { LoginStateManager, LoginState } from '../../core/LoginStateManager';
import { AuthModal } from '../../ui/components/AuthModal';

export class DeleteRequestPage {
  private container: HTMLElement;
  private content: HTMLElement;
  private authModal: AuthModal | null = null;
  private deleteProfileChecked: boolean = false;
  private deleteRecordingsChecked: boolean = false;
  private isSubmitting: boolean = false;
  private unsubscribe: (() => void) | null = null;
  private hasRenderedMainContent: boolean = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = styles.container;
    
    this.content = document.createElement('div');
    this.content.className = styles.contentWrapper;
    this.container.appendChild(this.content);
  }

  public async mount(parent: HTMLElement): Promise<void> {
    this.updateMetadata();
    
    parent.innerHTML = '';
    parent.appendChild(this.container);

    this.renderHeader();
    
    const loginStateManager = LoginStateManager.getInstance();
    const loginState = loginStateManager.getState();
    
    // Check if logged in
    if (!loginState.isLoggedIn) {
      this.showAuthModal();
      return;
    }

    // Subscribe to state changes to handle profile loading
    this.unsubscribe = loginStateManager.addListener((state: LoginState) => {
      this.handleStateChange(state);
    });

    // If profile is already loaded, render main content
    // Otherwise show loading state and wait for profile
    if (loginState.profile) {
      this.renderMainContent();
      this.hasRenderedMainContent = true;
    } else {
      this.renderLoadingState();
    }
  }

  private handleStateChange(state: LoginState): void {
    // If we now have profile data and haven't rendered main content yet
    if (state.profile && !this.hasRenderedMainContent && state.isLoggedIn) {
      this.content.innerHTML = '';
      this.renderHeader();
      this.renderMainContent();
      this.hasRenderedMainContent = true;
    }
    
    // If user logged out, show auth modal
    if (!state.isLoggedIn && this.hasRenderedMainContent) {
      this.hasRenderedMainContent = false;
      this.content.innerHTML = '';
      this.renderHeader();
      this.showAuthModal();
    }
  }

  private renderLoadingState(): void {
    const loadingSection = document.createElement('div');
    loadingSection.className = styles.section;
    loadingSection.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.7);">
        <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
        Loading your profile...
      </div>
    `;
    this.content.appendChild(loadingSection);
  }

  public unmount(): void {
    this.restoreDefaultMetadata();
    
    // Unsubscribe from state changes
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    
    if (this.authModal) {
      this.authModal.unmount();
      this.authModal = null;
    }

    this.container.remove();
  }

  private updateMetadata(): void {
    document.title = 'Delete Account Data - Eidon';
    
    this.setMetaTag('name', 'title', 'Delete Account Data - Eidon');
    this.setMetaTag('name', 'description', 'Request deletion of your Eidon account data including profile and recordings.');
    this.setMetaTag('name', 'robots', 'noindex, nofollow');
    
    this.setMetaTag('property', 'og:title', 'Delete Account Data - Eidon');
    this.setMetaTag('property', 'og:description', 'Request deletion of your Eidon account data.');
  }

  private restoreDefaultMetadata(): void {
    document.title = 'Eidon Sym';
    
    this.setMetaTag('name', 'title', 'Eidon Sym');
    this.setMetaTag('name', 'description', 'Visualize sensor recordings, analyze device data, and test connections with Eidon Sym.');
    
    // Remove noindex
    const robotsMeta = document.querySelector('meta[name="robots"]');
    if (robotsMeta) {
      robotsMeta.remove();
    }
    
    this.setMetaTag('property', 'og:title', 'Eidon Sym');
    this.setMetaTag('property', 'og:description', 'Visualize sensor recordings, analyze device data, and test connections with Eidon Sym.');
  }

  private setMetaTag(attribute: 'name' | 'property', key: string, value: string): void {
    let meta = document.querySelector(`meta[${attribute}="${key}"]`) as HTMLMetaElement;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute(attribute, key);
      document.head.appendChild(meta);
    }
    meta.content = value;
  }

  private showAuthModal(): void {
    this.content.innerHTML = '';
    this.renderHeader();
    
    const message = document.createElement('div');
    message.className = styles.noAuth;
    message.textContent = 'Please sign in to request account data deletion.';
    message.style.marginTop = '2rem';
    this.content.appendChild(message);

    this.authModal = new AuthModal(
      async () => {
        try {
          const loginStateManager = LoginStateManager.getInstance();
          await loginStateManager.login();
          
          if (this.authModal) {
            this.authModal.unmount();
            this.authModal = null;
          }
          
          this.content.innerHTML = '';
          this.renderHeader();
          
          // Subscribe to state changes if not already subscribed
          if (!this.unsubscribe) {
            this.unsubscribe = loginStateManager.addListener((state: LoginState) => {
              this.handleStateChange(state);
            });
          }
          
          // Check if profile is available after login
          const state = loginStateManager.getState();
          if (state.profile) {
            this.renderMainContent();
            this.hasRenderedMainContent = true;
          } else {
            // Show loading while waiting for profile
            this.renderLoadingState();
          }
        } catch (error) {
          console.error('Login failed:', error);
          alert('Login failed. Please try again.');
        }
      },
      () => {
        window.location.href = '/';
      }
    );
    
    this.authModal.mount(this.container);
  }

  private renderHeader(): void {
    const header = document.createElement('div');
    header.className = styles.header;
    
    const title = document.createElement('h1');
    title.className = styles.title;
    title.textContent = 'Delete Account Data';
    
    const backBtn = document.createElement('button');
    backBtn.className = styles.backButton;
    backBtn.innerHTML = '<i class="fas fa-arrow-left"></i> Back to App';
    backBtn.onclick = () => {
      window.location.href = '/';
    };
    
    header.appendChild(title);
    header.appendChild(backBtn);
    this.content.appendChild(header);
  }

  private renderMainContent(): void {
    const loginState = LoginStateManager.getInstance().getState();
    const user = loginState.profile;

    // Warning Section
    const warningSection = document.createElement('div');
    warningSection.className = styles.warning;
    warningSection.innerHTML = `
      <i class="fas fa-exclamation-triangle"></i>
      <div>
        <strong>Warning:</strong> Data deletion requests are permanent and cannot be undone. 
        Please review your selections carefully before submitting.
      </div>
    `;
    this.content.appendChild(warningSection);

    // User Info Section
    const userSection = document.createElement('div');
    userSection.className = styles.section;
    
    const userTitle = document.createElement('h2');
    userTitle.className = styles.sectionTitle;
    userTitle.innerHTML = '<i class="fas fa-user"></i> Your Account';
    
    const userInfo = document.createElement('div');
    userInfo.className = styles.userInfo;
    userInfo.innerHTML = `
      <div class="${styles.userInfoRow}">
        <span class="${styles.userInfoLabel}">Name:</span>
        <span class="${styles.userInfoValue}">${user?.fullName || 'Unknown'}</span>
      </div>
      <div class="${styles.userInfoRow}">
        <span class="${styles.userInfoLabel}">Email:</span>
        <span class="${styles.userInfoValue}">${user?.emailAddress || 'Not available'}</span>
      </div>
      <div class="${styles.userInfoRow}">
        <span class="${styles.userInfoLabel}">Total Recordings:</span>
        <span class="${styles.userInfoValue}">${user?.totalRecordings || 0}</span>
      </div>
    `;
    
    userSection.appendChild(userTitle);
    userSection.appendChild(userInfo);
    this.content.appendChild(userSection);

    // Deletion Options Section
    const optionsSection = document.createElement('div');
    optionsSection.className = styles.section;
    
    const optionsTitle = document.createElement('h2');
    optionsTitle.className = styles.sectionTitle;
    optionsTitle.innerHTML = '<i class="fas fa-trash-alt"></i> Select Data to Delete';
    
    const optionsDescription = document.createElement('p');
    optionsDescription.className = styles.optionsDescription;
    optionsDescription.textContent = 'Select which data you would like to request for deletion. You can select one or both options.';
    
    const checkboxContainer = document.createElement('div');
    checkboxContainer.className = styles.checkboxContainer;
    
    // Delete Profile checkbox
    const profileOption = this.createCheckboxOption(
      'deleteProfile',
      'Delete Profile',
      'Request deletion of your user profile, including personal information, preferences, and account settings.',
      'fa-user-slash',
      (checked) => {
        this.deleteProfileChecked = checked;
        this.updateSubmitButton();
      }
    );
    
    // Delete Recordings checkbox
    const recordingsOption = this.createCheckboxOption(
      'deleteRecordings',
      'Delete All Recordings',
      'Request deletion of all your uploaded recordings, including video files, sensor data, and associated metadata.',
      'fa-film',
      (checked) => {
        this.deleteRecordingsChecked = checked;
        this.updateSubmitButton();
      }
    );
    
    checkboxContainer.appendChild(profileOption);
    checkboxContainer.appendChild(recordingsOption);
    
    optionsSection.appendChild(optionsTitle);
    optionsSection.appendChild(optionsDescription);
    optionsSection.appendChild(checkboxContainer);
    this.content.appendChild(optionsSection);

    // Submit Section
    const submitSection = document.createElement('div');
    submitSection.className = styles.section;
    
    const submitInfo = document.createElement('div');
    submitInfo.className = styles.submitInfo;
    submitInfo.innerHTML = `
      <i class="fas fa-info-circle"></i>
      <div>
        Your request will be sent to our privacy team at <strong>privacy@eidon.ai</strong>. 
        We will process your request within 30 days as required by applicable data protection regulations.
      </div>
    `;
    
    const submitButton = document.createElement('button');
    submitButton.id = 'submitDeleteRequest';
    submitButton.className = styles.submitButton;
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Deletion Request';
    submitButton.onclick = () => this.handleSubmit();
    
    submitSection.appendChild(submitInfo);
    submitSection.appendChild(submitButton);
    this.content.appendChild(submitSection);
  }

  private createCheckboxOption(
    id: string,
    label: string,
    description: string,
    icon: string,
    onChange: (checked: boolean) => void
  ): HTMLElement {
    const option = document.createElement('label');
    option.className = styles.checkboxOption;
    option.htmlFor = id;
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = id;
    checkbox.className = styles.checkbox;
    checkbox.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      onChange(target.checked);
      option.classList.toggle(styles.checkboxOptionChecked, target.checked);
    });
    
    const customCheckbox = document.createElement('span');
    customCheckbox.className = styles.customCheckbox;
    customCheckbox.innerHTML = '<i class="fas fa-check"></i>';
    
    const optionContent = document.createElement('div');
    optionContent.className = styles.checkboxContent;
    
    const optionLabel = document.createElement('div');
    optionLabel.className = styles.checkboxLabel;
    optionLabel.innerHTML = `<i class="fas ${icon}"></i> ${label}`;
    
    const optionDescription = document.createElement('div');
    optionDescription.className = styles.checkboxDescription;
    optionDescription.textContent = description;
    
    optionContent.appendChild(optionLabel);
    optionContent.appendChild(optionDescription);
    
    option.appendChild(checkbox);
    option.appendChild(customCheckbox);
    option.appendChild(optionContent);
    
    return option;
  }

  private updateSubmitButton(): void {
    const submitButton = document.getElementById('submitDeleteRequest') as HTMLButtonElement;
    if (submitButton) {
      submitButton.disabled = !this.deleteProfileChecked && !this.deleteRecordingsChecked;
    }
  }

  private async handleSubmit(): Promise<void> {
    if (this.isSubmitting) return;
    if (!this.deleteProfileChecked && !this.deleteRecordingsChecked) return;

    const loginState = LoginStateManager.getInstance().getState();
    const user = loginState.profile;
    
    if (!user) {
      alert('User information not available. Please try logging in again.');
      return;
    }

    // Confirm the action
    const confirmMessage = this.buildConfirmMessage();
    if (!confirm(confirmMessage)) {
      return;
    }

    this.isSubmitting = true;
    this.updateSubmitButtonState(true);

    try {
      // Send via backend API
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        throw new Error('API URL not configured');
      }

      if (!loginState.tokens?.token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${apiUrl}/users/deletion-request`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${loginState.tokens.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deleteProfile: this.deleteProfileChecked,
          deleteRecordings: this.deleteRecordingsChecked,
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Request failed: ${response.status}`);
      }

      this.showSuccessMessage();

    } catch (error) {
      console.error('Failed to submit deletion request:', error);
      alert('Failed to submit deletion request. Please try again or contact support directly at privacy@eidon.ai');
    } finally {
      this.isSubmitting = false;
      this.updateSubmitButtonState(false);
    }
  }

  private buildConfirmMessage(): string {
    const parts = [];
    if (this.deleteProfileChecked) parts.push('your profile');
    if (this.deleteRecordingsChecked) parts.push('all your recordings');
    
    return `Are you sure you want to request deletion of ${parts.join(' and ')}?\n\nThis action cannot be undone.`;
  }

  private updateSubmitButtonState(loading: boolean): void {
    const submitButton = document.getElementById('submitDeleteRequest') as HTMLButtonElement;
    if (submitButton) {
      if (loading) {
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
      } else {
        submitButton.disabled = !this.deleteProfileChecked && !this.deleteRecordingsChecked;
        submitButton.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Deletion Request';
      }
    }
  }

  private showSuccessMessage(): void {
    this.content.innerHTML = '';
    this.renderHeader();

    const successSection = document.createElement('div');
    successSection.className = styles.successSection;
    
    const successIcon = document.createElement('div');
    successIcon.className = styles.successIcon;
    successIcon.innerHTML = '<i class="fas fa-check-circle"></i>';
    
    const successTitle = document.createElement('h2');
    successTitle.className = styles.successTitle;
    successTitle.textContent = 'Request Submitted';
    
    const successMessage = document.createElement('p');
    successMessage.className = styles.successMessage;
    successMessage.innerHTML = `
      Your data deletion request has been submitted successfully.<br><br>
      Our privacy team will review your request and process it within 30 days. 
      You will receive a confirmation email at your registered email address once the deletion is complete.<br><br>
      If you have any questions, please contact us at <a href="mailto:privacy@eidon.ai">privacy@eidon.ai</a>.
    `;
    
    const backButton = document.createElement('button');
    backButton.className = styles.backToAppButton;
    backButton.innerHTML = '<i class="fas fa-home"></i> Return to App';
    backButton.onclick = () => {
      window.location.href = '/';
    };
    
    successSection.appendChild(successIcon);
    successSection.appendChild(successTitle);
    successSection.appendChild(successMessage);
    successSection.appendChild(backButton);
    
    this.content.appendChild(successSection);
  }
}
