import { AuthManager } from '../../../core/AuthManager';
import { UserApiManager } from '../../../core/UserApiManager';
import styles from './styles/ProfileModal.module.css';

export class ProfileModal {
  private modal: HTMLElement | null = null;
  private profile: any;
  private parent: HTMLElement;
  private toolbar: HTMLElement;

  constructor(profile: any, parent: HTMLElement, toolbar: HTMLElement) {
    this.profile = profile;
    this.parent = parent;
    this.toolbar = toolbar;
    this.modal = this.createUserProfileModal(profile);
  }

  mount(): void {
    if (this.modal) {
      this.parent.appendChild(this.modal);
      this.positionModal(this.modal);
    }
  }

  unmount(): void {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }

  private positionModal(modal: HTMLElement): void {
    // Position modal centered below the toolbar
    const toolbarRect = this.toolbar.getBoundingClientRect();
    
    // Center horizontally and position below toolbar
    const modalWidth = 500; // Profile modal width
    const left = (toolbarRect.width - modalWidth) / 2;
    const top = toolbarRect.height + 16; // 16px gap below toolbar
    
    modal.style.left = `${left}px`;
    modal.style.top = `${top}px`;
  }

  private createUserProfileModal(profile: any): HTMLElement {
    const modal = document.createElement('div');
    modal.className = styles.modal;
    
    const avatarUrl = profile.avatarUrl;
    const formatDuration = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      
      if (hours < 1) {
        return `${minutes}m`;
      } else if (hours >= 10) {
        return `${hours}h`;
      } else {
        return `${hours}h ${minutes}m`;
      }
    };
    
    modal.innerHTML = `
      <div class="${styles.modalContent} ${styles.userProfileModal}">
        <button class="${styles.modalClose}">&times;</button>
        <div class="${styles.userProfileHeader}">
          ${avatarUrl ? `<img src="${avatarUrl}" alt="Profile" class="${styles.profileAvatarLarge}" />` : ''}
          <div class="${styles.profileInfo}">
            <h3 class="${styles.profileName}">${profile.fullName}</h3>
            ${profile.emailAddress ? `<p class="${styles.profileEmail}">${profile.emailAddress}</p>` : ''}
            ${profile.isAdmin ? `<span class="${styles.adminBadge} ${styles.adminBadgeLarge}"><i class="fas fa-shield-alt"></i> Admin</span>` : ''}
          </div>
          <button class="${styles.editButton}" id="editProfileBtn">
            <i class="fas fa-edit"></i>
            Edit
          </button>
        </div>
        <div class="${styles.profileStats}">
          <div class="${styles.statItem}">
            <div class="${styles.statValue}">${profile.totalRecordings}</div>
            <div class="${styles.statLabel}">Recordings</div>
          </div>
          <div class="${styles.statItem}">
            <div class="${styles.statValue}">${formatDuration(profile.totalSecondsRecorded)}</div>
            <div class="${styles.statLabel}">Total Recording Time</div>
          </div>
          ${profile.recordingPercentage ? `
          <div class="${styles.statItem}">
            <div class="${styles.statValue}">${profile.recordingPercentage.toFixed(1)}%</div>
            <div class="${styles.statLabel}">System Share</div>
          </div>
          ` : ''}
          ${profile.devices && profile.devices.length > 0 ? `
          <div class="${styles.statItem}">
            <div class="${styles.statValue}">${profile.devices.length}</div>
            <div class="${styles.statLabel}">Devices</div>
          </div>
          ` : ''}
        </div>
        ${profile.firstTime || profile.newUser ? `
        <div class="${styles.profileBadges}">
          ${profile.newUser ? `<span class="${styles.badge} ${styles.badgeNewUser}">New User</span>` : ''}
          ${profile.firstTime ? `<span class="${styles.badge} ${styles.badgeFirstTime}">First Time</span>` : ''}
        </div>
        ` : ''}
      </div>
    `;
    
    // Add close button functionality
    const closeBtn = modal.querySelector(`.${styles.modalClose}`) as HTMLButtonElement;
    closeBtn.addEventListener('click', () => {
      this.unmount();
    });

    // Add edit button functionality
    const editBtn = modal.querySelector('#editProfileBtn') as HTMLButtonElement;
    editBtn.addEventListener('click', async () => {
      // Fetch latest profile data from backend before showing edit form
      try {
        const authManager = AuthManager.getInstance();
        const tokens = authManager.getTokens();
        
        if (tokens) {
          const userApiManager = UserApiManager.getInstance();
          const latestProfile = await userApiManager.getProfile(tokens);
          this.showEditProfileForm(modal, latestProfile);
        } else {
          // Fallback to current profile if not authenticated
          this.showEditProfileForm(modal, profile);
        }
      } catch (error) {
        console.error('Failed to fetch latest profile:', error);
        // Fallback to current profile on error
        this.showEditProfileForm(modal, profile);
      }
    });

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.unmount();
      }
    });

    // Prevent modal content clicks from bubbling to overlay
    const modalContent = modal.querySelector(`.${styles.modalContent}`) as HTMLElement;
    if (modalContent) {
      modalContent.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
    
    return modal;
  }

  private showEditProfileForm(modal: HTMLElement, profile: any): void {
    const modalContent = modal.querySelector(`.${styles.modalContent}`) as HTMLElement;
    
    modalContent.classList.add(styles.editProfileForm);
    
    modalContent.innerHTML = `
      <button class="${styles.modalClose}">&times;</button>
      <div class="${styles.editFormContainer}">
        <div class="${styles.editFormHeader}">
          <button class="${styles.backButton} ${styles.editBackBtn}" id="backToProfileBtn">
            <i class="fas fa-arrow-left ${styles.backIcon}"></i>
            <span class="${styles.backText}">Back</span>
          </button>
          <h3 class="${styles.editFormTitle}">Edit Profile</h3>
        </div>
        
        <div class="${styles.formRow}">
          <div class="${styles.formGroup} ${styles.nameFieldGroup}">
            <label class="${styles.formLabel} ${styles.nameLabel}" for="profileName">Name</label>
            <input 
              type="text" 
              id="profileName" 
              class="${styles.formInput} ${styles.nameInput}" 
              value="${profile.fullName || ''}" 
              maxlength="100"
              placeholder="Enter your name"
            />
          </div>

          <div class="${styles.formGroup} ${styles.colorFieldGroup}">
            <label class="${styles.formLabel} ${styles.colorLabel}" for="symColor">Sym Color</label>
            <div class="${styles.colorPickerContainer}">
              <input 
                type="color" 
                id="symColor" 
                class="${styles.colorInput} ${styles.colorPicker}" 
                value="${profile.symColor || '#E93570'}"
              />
              <span class="${styles.colorValue} ${styles.colorHexDisplay}">${profile.symColor || '#E93570'}</span>
            </div>
          </div>
        </div>

        <div class="${styles.formGroup} ${styles.avatarFieldGroup}">
          <label class="${styles.formLabel} ${styles.avatarLabel}" for="profileAvatar">Profile Image</label>
          <div class="${styles.avatarUploadContainer}">
            <div class="${styles.avatarPreview} ${styles.avatarPreviewContainer}">
              ${profile.avatarUrl ? `<img src="${profile.avatarUrl}" alt="Current Avatar" class="${styles.avatarPreviewImg} ${styles.currentAvatarImg}" />` : '<div class="${styles.avatarPlaceholder} ${styles.avatarPlaceholderIcon}"><i class="fas fa-user"></i></div>'}
            </div>
            <input 
              type="file" 
              id="profileAvatar" 
              class="${styles.fileInput} ${styles.avatarFileInput}" 
              accept="image/*"
            />
            <button type="button" class="${styles.uploadButton} ${styles.avatarUploadBtn}" id="uploadAvatarBtn">
              <i class="fas fa-camera ${styles.uploadIcon}"></i>
              <span class="${styles.uploadText}">Choose Image</span>
            </button>
          </div>
        </div>

        <div class="${styles.formActions} ${styles.editFormActions}">
          <button type="button" class="${styles.cancelButton} ${styles.editCancelBtn}" id="cancelEditBtn">
            <span class="${styles.cancelText}">Cancel</span>
          </button>
          <button type="button" class="${styles.saveButton} ${styles.editSaveBtn}" id="saveProfileBtn">
            <i class="fas fa-save ${styles.saveIcon}"></i>
            <span class="${styles.saveText}">Save Changes</span>
          </button>
        </div>
      </div>
    `;

    // Add event listeners for the edit form
    this.setupEditFormEventListeners(modal, profile);
  }

  private setupEditFormEventListeners(modal: HTMLElement, originalProfile: any): void {
    const closeBtn = modal.querySelector(`.${styles.modalClose}`) as HTMLButtonElement;
    const backBtn = modal.querySelector(`.${styles.editBackBtn}`) as HTMLButtonElement;
    const cancelBtn = modal.querySelector(`.${styles.editCancelBtn}`) as HTMLButtonElement;
    const saveBtn = modal.querySelector(`.${styles.editSaveBtn}`) as HTMLButtonElement;
    const fileInput = modal.querySelector(`.${styles.avatarFileInput}`) as HTMLInputElement;
    const uploadBtn = modal.querySelector(`.${styles.avatarUploadBtn}`) as HTMLButtonElement;
    const colorInput = modal.querySelector(`.${styles.colorPicker}`) as HTMLInputElement;
    const colorValue = modal.querySelector(`.${styles.colorHexDisplay}`) as HTMLSpanElement;

    // Close button
    closeBtn.addEventListener('click', () => {
      this.unmount();
    });

    // Back button - return to profile view
    backBtn.addEventListener('click', () => {
      this.showUserProfile(modal, originalProfile);
    });

    // Cancel button - restore original profile view
    cancelBtn.addEventListener('click', () => {
      this.showUserProfile(modal, originalProfile);
    });

    // File input trigger
    uploadBtn.addEventListener('click', () => {
      fileInput.click();
    });

    // File selection handler
    fileInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        this.handleAvatarFileSelection(file, modal);
      }
    });

    // Color picker handler
    colorInput.addEventListener('input', (e) => {
      const color = (e.target as HTMLInputElement).value;
      colorValue.textContent = color;
      
      // Apply color changes optimistically to UI elements
      this.applyColorOptimistically(color);
    });

    // Save button
    saveBtn.addEventListener('click', () => {
      this.saveProfileChanges(modal, originalProfile);
    });

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.unmount();
      }
    });

    // Prevent modal content clicks from bubbling to overlay
    const editFormContainer = modal.querySelector(`.${styles.editFormContainer}`) as HTMLElement;
    if (editFormContainer) {
      editFormContainer.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
  }

  private handleAvatarFileSelection(file: File, modal: HTMLElement): void {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file.');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image file size must be less than 5MB.');
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const previewImg = modal.querySelector(`.${styles.currentAvatarImg}`) as HTMLImageElement;
      const placeholder = modal.querySelector(`.${styles.avatarPlaceholderIcon}`) as HTMLDivElement;
      
      if (previewImg) {
        previewImg.src = e.target?.result as string;
      } else if (placeholder) {
        placeholder.innerHTML = `<img src="${e.target?.result}" alt="Preview" class="${styles.avatarPreviewImg} ${styles.currentAvatarImg}" />`;
      }
    };
    reader.readAsDataURL(file);

    // Store the file for later upload
    (modal as any).selectedAvatarFile = file;
  }

  private async saveProfileChanges(modal: HTMLElement, originalProfile: any): Promise<void> {
    const nameInput = modal.querySelector(`.${styles.nameInput}`) as HTMLInputElement;
    const colorInput = modal.querySelector(`.${styles.colorPicker}`) as HTMLInputElement;
    const saveBtn = modal.querySelector(`.${styles.editSaveBtn}`) as HTMLButtonElement;
    const selectedFile = (modal as any).selectedAvatarFile as File;

    const fullName = nameInput.value.trim();
    const symColor = colorInput.value;

    // Validate name
    if (!fullName) {
      alert('Please enter a name.');
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<i class="fas fa-save ${styles.saveIcon}"></i><span class="${styles.saveText}">Save Changes</span>`;
      return;
    }

    if (fullName.length > 100) {
      alert('Name must be 100 characters or less.');
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<i class="fas fa-save ${styles.saveIcon}"></i><span class="${styles.saveText}">Save Changes</span>`;
      return;
    }

    // Show loading state
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    try {
      let avatarUrl = originalProfile.avatarUrl;

      // Handle avatar upload if a new file was selected
      if (selectedFile) {
        try {
          avatarUrl = await this.uploadAvatar(selectedFile);
        } catch (uploadError) {
          console.error('Failed to upload avatar:', uploadError);
          alert('Failed to upload avatar. Please try again.');
          saveBtn.disabled = false;
          saveBtn.innerHTML = `<i class="fas fa-save ${styles.saveIcon}"></i><span class="${styles.saveText}">Save Changes</span>`;
          return;
        }
      }

      // Update profile
      try {
        await this.updateUserProfile({
          fullName,
          avatarUrl,
          symColor
        });
      } catch (profileError) {
        console.error('Failed to update profile:', profileError);
        alert('Failed to update profile. Please try again.');
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i class="fas fa-save ${styles.saveIcon}"></i><span class="${styles.saveText}">Save Changes</span>`;
        return;
      }

      // Show success and refresh profile
      const updatedProfile = { ...originalProfile, fullName, avatarUrl, symColor };
      this.showUserProfile(modal, updatedProfile);
      
      // Sync the ViewControls color picker with the updated symColor
      const viewControls = (window as any).viewControls;
      if (viewControls && viewControls.updateSymColor) {
        viewControls.updateSymColor(symColor);
      }

    } catch (error) {
      console.error('Failed to save profile:', error);
      alert('Failed to save profile changes. Please try again.');
      
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<i class="fas fa-save ${styles.saveIcon}"></i><span class="${styles.saveText}">Save Changes</span>`;
    }
  }

  private async uploadAvatar(file: File): Promise<string> {
    // Get auth tokens from AuthManager
    const authManager = AuthManager.getInstance();
    const tokens = authManager.getTokens();
    if (!tokens) {
      throw new Error('User not authenticated');
    }

    // Use UserApiManager to handle the upload
    const userApiManager = UserApiManager.getInstance();
    return await userApiManager.uploadAvatar(file, tokens);
  }

  private applyColorOptimistically(color: string): void {
    // Update preferences optimistically
    const prefs = (window as any).prefs;
    if (prefs) {
      prefs.symColor = color;
    }

    // Dispatch color change event for IconOverlay to update robot/logo
    const colorChangeEvent = new CustomEvent('colorChange', {
      detail: { color }
    });
    document.dispatchEvent(colorChangeEvent);

    // Update only the Eidon Sym title color (not all text)
    this.updateEidonSymTitleColor(color);
  }

  private updateEidonSymTitleColor(color: string): void {
    const eidonTitle = document.querySelector('[data-eidon-title]') as HTMLElement;
    if (eidonTitle) {
      eidonTitle.style.color = color;
    }
    
    const eidonTitleElements = document.querySelectorAll('.eidon-title, .eidon-sym-title');
    eidonTitleElements.forEach(element => {
      (element as HTMLElement).style.color = color;
    });
  }

  private async updateUserProfile(profileData: { fullName: string; avatarUrl?: string; symColor: string }): Promise<void> {
    const authManager = AuthManager.getInstance();
    const tokens = authManager.getTokens();
    if (!tokens) {
      throw new Error('User not authenticated');
    }

    const userApiManager = UserApiManager.getInstance();
    await userApiManager.updateProfile(profileData, tokens);
  }

  private showUserProfile(modal: HTMLElement, profile: any): void {
    const modalContent = modal.querySelector(`.${styles.modalContent}`) as HTMLElement;
    modalContent.classList.remove(styles.editProfileForm);
    
    // Recreate the profile view
    const avatarUrl = profile.avatarUrl;
    const formatDuration = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      
      if (hours < 1) {
        return `${minutes}m`;
      } else if (hours >= 10) {
        return `${hours}h`;
      } else {
        return `${hours}h ${minutes}m`;
      }
    };
    
    modalContent.innerHTML = `
      <button class="${styles.modalClose}">&times;</button>
      <div class="${styles.userProfileHeader}">
        ${avatarUrl ? `<img src="${avatarUrl}" alt="Profile" class="${styles.profileAvatarLarge}" />` : ''}
        <div class="${styles.profileInfo}">
          <h3 class="${styles.profileName}">${profile.fullName}</h3>
          ${profile.emailAddress ? `<p class="${styles.profileEmail}">${profile.emailAddress}</p>` : ''}
          ${profile.isAdmin ? `<span class="${styles.adminBadge} ${styles.adminBadgeLarge}"><i class="fas fa-shield-alt"></i> Admin</span>` : ''}
        </div>
        <button class="${styles.editButton}" id="editProfileBtn">
          <i class="fas fa-edit"></i>
          Edit
        </button>
      </div>
      <div class="${styles.profileStats}">
        <div class="${styles.statItem}">
          <div class="${styles.statValue}">${profile.totalRecordings}</div>
          <div class="${styles.statLabel}">Recordings</div>
        </div>
        <div class="${styles.statItem}">
          <div class="${styles.statValue}">${formatDuration(profile.totalSecondsRecorded)}</div>
          <div class="${styles.statLabel}">Total Recording Time</div>
        </div>
        ${profile.recordingPercentage ? `
        <div class="${styles.statItem}">
          <div class="${styles.statValue}">${profile.recordingPercentage.toFixed(1)}%</div>
          <div class="${styles.statLabel}">System Share</div>
        </div>
        ` : ''}
        ${profile.devices && profile.devices.length > 0 ? `
        <div class="${styles.statItem}">
          <div class="${styles.statValue}">${profile.devices.length}</div>
          <div class="${styles.statLabel}">Devices</div>
        </div>
        ` : ''}
      </div>
      ${profile.firstTime || profile.newUser ? `
      <div class="${styles.profileBadges}">
        ${profile.newUser ? `<span class="${styles.badge} ${styles.badgeNewUser}">New User</span>` : ''}
        ${profile.firstTime ? `<span class="${styles.badge} ${styles.badgeFirstTime}">First Time</span>` : ''}
      </div>
      ` : ''}
    `;

    // Reattach event listeners
    const closeBtn = modalContent.querySelector(`.${styles.modalClose}`) as HTMLButtonElement;
    closeBtn.addEventListener('click', () => {
      this.unmount();
    });

    const editBtn = modalContent.querySelector('#editProfileBtn') as HTMLButtonElement;
    editBtn.addEventListener('click', async () => {
      try {
        const authManager = AuthManager.getInstance();
        const tokens = authManager.getTokens();
        
        if (tokens) {
          const userApiManager = UserApiManager.getInstance();
          const latestProfile = await userApiManager.getProfile(tokens);
          this.showEditProfileForm(modal, latestProfile);
        } else {
          this.showEditProfileForm(modal, profile);
        }
      } catch (error) {
        console.error('Failed to fetch latest profile:', error);
        this.showEditProfileForm(modal, profile);
      }
    });
  }
}

