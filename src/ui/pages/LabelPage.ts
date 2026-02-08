import styles from './styles/LabelPage.module.css';
import { LoginStateManager, LoginState } from '../../core/LoginStateManager';
import { AuthModal } from '../../ui/components/AuthModal';
import { AdminRecording } from '../../types/recording';

interface SearchFilters {
  userEmail: string;
  userEmails: string;
  startDate: string;
  endDate: string;
  videoOnly: string;
  valid: string;
  taskType: string;
  page: number;
  limit: number;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface AdminWarning {
  id: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  title: string;
  message: string;
  acknowledgedAt: string | null;
  userFullName: string;
  userEmail: string | null;
}

export class LabelPage {
  private container: HTMLElement;
  private content: HTMLElement;
  private authModal: AuthModal | null = null;
  private unsubscribe: (() => void) | null = null;
  private hasRenderedMainContent: boolean = false;
  private recordings: AdminRecording[] = [];
  private pagination: PaginationInfo | null = null;
  private selectedIds: Set<string> = new Set();
  private filters: SearchFilters = {
    userEmail: '',
    userEmails: '',
    startDate: '',
    endDate: '',
    videoOnly: '',
    valid: '',
    taskType: '',
    page: 1,
    limit: 20,
  };
  private isLoading: boolean = false;
  private videoModalIndex: number | null = null;
  private useBracketKeys: boolean = false;
  private warningModalUserId: string | null = null;
  private toastContainer: HTMLElement | null = null;
  private activeTab: 'recordings' | 'alerts' = 'recordings';
  private warnings: AdminWarning[] = [];
  private warningsPagination: PaginationInfo | null = null;
  private warningsAckFilter: string = '';
  private warningsPage: number = 1;
  private isLoadingWarnings: boolean = false;

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

    // Subscribe to state changes before checking admin,
    // so we react when profile loads asynchronously
    this.unsubscribe = loginStateManager.addListener((state: LoginState) => {
      this.handleStateChange(state);
    });

    if (loginState.profile) {
      // Profile already loaded — check admin status now
      if (!this.isAdmin(loginState)) {
        this.showAccessDenied();
        return;
      }
      this.renderMainContent();
      this.hasRenderedMainContent = true;
    } else {
      // Profile not loaded yet — show loading, listener will handle it
      this.renderLoadingState();
    }
  }

  private isAdmin(state: LoginState): boolean {
    return state.profile?.isAdmin ?? false;
  }

  private handleStateChange(state: LoginState): void {
    if (state.profile && !this.hasRenderedMainContent && state.isLoggedIn) {
      if (!this.isAdmin(state)) {
        this.showAccessDenied();
        return;
      }
      this.content.innerHTML = '';
      this.renderHeader();
      this.renderMainContent();
      this.hasRenderedMainContent = true;
    }

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
      <div class="${styles.loadingState}">
        <i class="fas fa-spinner fa-spin"></i>
        Loading...
      </div>
    `;
    this.content.appendChild(loadingSection);
  }

  private showAccessDenied(): void {
    this.content.innerHTML = '';
    this.renderHeader();

    const deniedSection = document.createElement('div');
    deniedSection.className = styles.section;
    deniedSection.innerHTML = `
      <div class="${styles.emptyState}">
        <i class="fas fa-lock"></i>
        <h3>Access Denied</h3>
        <p>This page is only accessible to Eidon administrators.</p>
      </div>
    `;
    this.content.appendChild(deniedSection);
  }

  public unmount(): void {
    this.restoreDefaultMetadata();

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    if (this.authModal) {
      this.authModal.unmount();
      this.authModal = null;
    }

    if (this.toastContainer) {
      this.toastContainer.remove();
      this.toastContainer = null;
    }

    this.container.remove();
  }

  private updateMetadata(): void {
    document.title = 'Label Recordings - Eidon Admin';
    this.setMetaTag('name', 'robots', 'noindex, nofollow');
  }

  private restoreDefaultMetadata(): void {
    document.title = 'Eidon Sym';
    const robotsMeta = document.querySelector('meta[name="robots"]');
    if (robotsMeta) {
      robotsMeta.remove();
    }
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
    message.textContent = 'Please sign in to access the label page.';
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

          const state = loginStateManager.getState();
          if (!this.isAdmin(state)) {
            this.showAccessDenied();
            return;
          }

          this.content.innerHTML = '';
          this.renderHeader();

          if (!this.unsubscribe) {
            this.unsubscribe = loginStateManager.addListener((s: LoginState) => {
              this.handleStateChange(s);
            });
          }

          if (state.profile) {
            this.renderMainContent();
            this.hasRenderedMainContent = true;
          } else {
            this.renderLoadingState();
          }
        } catch (error) {
          console.error('Login failed:', error);
          this.showNotification('Login failed. Please try again.', 'error');
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
    title.textContent = 'Label Recordings';

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
    // Tab Bar
    const tabBar = document.createElement('div');
    tabBar.className = styles.tabBar;
    tabBar.id = 'tabBar';
    tabBar.innerHTML = this.renderTabBar();
    this.content.appendChild(tabBar);

    // Tab Content Area
    const tabContent = document.createElement('div');
    tabContent.id = 'tabContentArea';
    this.content.appendChild(tabContent);

    this.renderTabContent();
    this.attachTabListeners();
  }

  private renderTabBar(): string {
    return `
      <button class="${styles.tab} ${this.activeTab === 'recordings' ? styles.tabActive : ''}" data-tab="recordings">
        <i class="fas fa-video"></i> Recordings
      </button>
      <button class="${styles.tab} ${this.activeTab === 'alerts' ? styles.tabActive : ''}" data-tab="alerts">
        <i class="fas fa-bell"></i> Alerts
      </button>
    `;
  }

  private attachTabListeners(): void {
    const tabBar = document.getElementById('tabBar');
    if (!tabBar) return;
    tabBar.querySelectorAll(`.${styles.tab}`).forEach(tab => {
      tab.addEventListener('click', () => {
        const newTab = tab.getAttribute('data-tab') as 'recordings' | 'alerts';
        if (newTab && newTab !== this.activeTab) {
          this.switchTab(newTab);
        }
      });
    });
  }

  private switchTab(tab: 'recordings' | 'alerts'): void {
    this.activeTab = tab;

    // Update tab bar highlights
    const tabBar = document.getElementById('tabBar');
    if (tabBar) {
      tabBar.innerHTML = this.renderTabBar();
      this.attachTabListeners();
    }

    this.renderTabContent();
  }

  private renderTabContent(): void {
    const area = document.getElementById('tabContentArea');
    if (!area) return;
    area.innerHTML = '';

    if (this.activeTab === 'recordings') {
      this.renderRecordingsTab(area);
    } else {
      this.renderAlertsTab(area);
    }
  }

  private renderRecordingsTab(container: HTMLElement): void {
    // Filter Section
    const filterSection = document.createElement('div');
    filterSection.className = styles.section;
    filterSection.innerHTML = `
      <h2 class="${styles.sectionTitle}"><i class="fas fa-filter"></i> Search Filters</h2>
      <div class="${styles.filterBar}">
        <div class="${styles.filterGroup}">
          <label class="${styles.filterLabel}">User Email</label>
          <input type="text" class="${styles.filterInput}" id="filterEmail" placeholder="Search by email..." value="${this.filters.userEmail}">
        </div>
        <div class="${styles.filterGroup}">
          <label class="${styles.filterLabel}">Start Date</label>
          <input type="date" class="${styles.filterInput}" id="filterStartDate" value="${this.filters.startDate}">
        </div>
        <div class="${styles.filterGroup}">
          <label class="${styles.filterLabel}">End Date</label>
          <input type="date" class="${styles.filterInput}" id="filterEndDate" value="${this.filters.endDate}">
        </div>
        <div class="${styles.filterGroup}">
          <label class="${styles.filterLabel}">Mode</label>
          <select class="${styles.filterSelect}" id="filterVideoOnly">
            <option value="">All</option>
            <option value="true" ${this.filters.videoOnly === 'true' ? 'selected' : ''}>Video Only</option>
            <option value="false" ${this.filters.videoOnly === 'false' ? 'selected' : ''}>Tracker</option>
          </select>
        </div>
        <div class="${styles.filterGroup}">
          <label class="${styles.filterLabel}">Valid Status</label>
          <select class="${styles.filterSelect}" id="filterValid">
            <option value="">All</option>
            <option value="true" ${this.filters.valid === 'true' ? 'selected' : ''}>Valid</option>
            <option value="false" ${this.filters.valid === 'false' ? 'selected' : ''}>Invalid</option>
          </select>
        </div>
        <div class="${styles.filterGroup}">
          <label class="${styles.filterLabel}">Task Type</label>
          <select class="${styles.filterSelect}" id="filterTaskType">
            <option value="">All Tasks</option>
            <option value="cooking">Cooking</option>
            <option value="folding_laundry">Folding Laundry</option>
            <option value="cleaning">Cleaning</option>
            <option value="making_the_bed">Making the Bed</option>
            <option value="watering_plants">Watering Plants</option>
            <option value="doing_the_dishes">Doing the Dishes</option>
          </select>
        </div>
        <div class="${styles.filterGroup}">
          <label class="${styles.filterLabel}">&nbsp;</label>
          <div style="display: flex; gap: 0.5rem;">
            <button class="${styles.searchButton}" id="searchButton">
              <i class="fas fa-search"></i> Search
            </button>
            <button class="${styles.clearSearchButton}" id="clearSearchButton" style="display: ${this.hasActiveSearch() ? 'flex' : 'none'};">
              <i class="fas fa-times"></i> Clear
            </button>
          </div>
        </div>
      </div>
    `;
    container.appendChild(filterSection);

    // Action Bar
    const actionSection = document.createElement('div');
    actionSection.className = styles.section;
    actionSection.id = 'actionSection';
    actionSection.innerHTML = this.renderActionBar();
    container.appendChild(actionSection);

    // Recordings Grid
    const recordingsSection = document.createElement('div');
    recordingsSection.className = styles.section;
    recordingsSection.id = 'recordingsSection';
    recordingsSection.innerHTML = `
      <div class="${styles.loadingState}">
        <i class="fas fa-spinner fa-spin"></i>
        Loading recordings...
      </div>
    `;
    container.appendChild(recordingsSection);

    this.attachEventListeners();
    this.searchRecordings();
  }

  private renderAlertsTab(container: HTMLElement): void {
    const section = document.createElement('div');
    section.className = styles.section;
    section.id = 'alertsSection';
    section.innerHTML = `
      <h2 class="${styles.sectionTitle}"><i class="fas fa-bell"></i> Alerts</h2>
      <div class="${styles.alertsFilterBar}">
        <div class="${styles.filterGroup}">
          <label class="${styles.filterLabel}">Status</label>
          <select class="${styles.filterSelect}" id="alertsAckFilter">
            <option value="">All</option>
            <option value="false" ${this.warningsAckFilter === 'false' ? 'selected' : ''}>Unacknowledged</option>
            <option value="true" ${this.warningsAckFilter === 'true' ? 'selected' : ''}>Acknowledged</option>
          </select>
        </div>
      </div>
      <div id="alertsContent">
        <div class="${styles.loadingState}">
          <i class="fas fa-spinner fa-spin"></i>
          Loading alerts...
        </div>
      </div>
    `;
    container.appendChild(section);

    const ackFilter = document.getElementById('alertsAckFilter');
    ackFilter?.addEventListener('change', () => {
      this.warningsAckFilter = (ackFilter as HTMLSelectElement).value;
      this.warningsPage = 1;
      this.fetchWarnings();
    });

    this.fetchWarnings();
  }

  private renderActionBar(): string {
    const selectedCount = this.selectedIds.size;
    const hasEmailFilter = this.filters.userEmail.trim() !== '';
    const selectedEmails = this.getSelectedUserEmails();
    const hasSelectedEmails = selectedEmails.length > 0;

    return `
      <div class="${styles.actionBar}">
        <div class="${styles.selectionInfo}">
          ${selectedCount > 0 ? `${selectedCount} recording${selectedCount > 1 ? 's' : ''} selected` : 'No recordings selected'}
        </div>
        <div class="${styles.actionButtons}">
          <button class="${styles.actionButton}" id="selectAllButton" ${this.recordings.length === 0 ? 'disabled' : ''}>
            <i class="fas fa-check-double"></i> Select All on Page
          </button>
          <button class="${styles.actionButton}" id="clearSelectionButton" ${selectedCount === 0 ? 'disabled' : ''}>
            <i class="fas fa-times"></i> Clear Selection
          </button>
          <button class="${styles.actionButton} ${styles.actionButtonUserFilter}" id="seeAllByUsersButton" ${!hasSelectedEmails ? 'disabled' : ''} title="${hasSelectedEmails ? 'Filter to show selected users\' recordings' : 'Select recordings first'}">
            <i class="fas fa-users"></i> See All by User${selectedEmails.length > 1 ? 's' : ''}
          </button>
          <button class="${styles.actionButton} ${styles.actionButtonValid}" id="markValidButton" ${selectedCount === 0 ? 'disabled' : ''}>
            <i class="fas fa-check-circle"></i> Mark Valid
          </button>
          <button class="${styles.actionButton} ${styles.actionButtonInvalid}" id="markInvalidButton" ${selectedCount === 0 ? 'disabled' : ''}>
            <i class="fas fa-times-circle"></i> Mark Invalid
          </button>
          <button class="${styles.actionButton} ${styles.actionButtonWarning}" id="createWarningButton" ${!hasEmailFilter ? 'disabled' : ''} title="${!hasEmailFilter ? 'Enter email filter first' : 'Create warning for filtered user'}">
            <i class="fas fa-exclamation-triangle"></i> Create Warning
          </button>
        </div>
      </div>
    `;
  }

  private getSelectedUserEmails(): string[] {
    const emails = new Set<string>();
    for (const id of this.selectedIds) {
      const recording = this.recordings.find(r => r.id === id);
      if (recording?.userEmail) {
        emails.add(recording.userEmail);
      }
    }
    return Array.from(emails);
  }

  private filterBySelectedUsers(): void {
    const emails = this.getSelectedUserEmails();
    if (emails.length === 0) return;

    if (emails.length === 1) {
      this.filters.userEmail = emails[0];
      this.filters.userEmails = '';
    } else {
      this.filters.userEmail = '';
      this.filters.userEmails = emails.join(',');
    }

    // Update the email input field to reflect the filter
    const emailInput = document.getElementById('filterEmail') as HTMLInputElement;
    if (emailInput) {
      emailInput.value = emails.length === 1 ? emails[0] : emails.join(', ');
    }

    this.filters.page = 1;
    this.selectedIds.clear();
    this.searchRecordings();
  }

  private updateActionBar(): void {
    const actionSection = document.getElementById('actionSection');
    if (actionSection) {
      actionSection.innerHTML = this.renderActionBar();
      this.attachActionListeners();
    }
  }

  private renderRecordingsGrid(): string {
    if (this.recordings.length === 0) {
      return `
        <div class="${styles.emptyState}">
          <i class="fas fa-video-slash"></i>
          <p>No recordings found matching your filters.</p>
        </div>
      `;
    }

    const formatTaskType = (taskType: string | null): string => {
      if (!taskType) return 'No task type';
      return taskType.split('_').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
    };

    const formatDate = (dateString: string): string => {
      const date = new Date(dateString);
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const grid = this.recordings.map(recording => {
      const isSelected = this.selectedIds.has(recording.id);
      const isValid = recording.valid !== false;

      return `
        <div class="${styles.recordingCard} ${isSelected ? styles.recordingCardSelected : ''} ${!isValid ? styles.recordingCardInvalid : ''}"
             data-recording-id="${recording.id}">
          <div class="${styles.recordingThumbnail}">
            ${recording.thumbnailReadUrl ?
              `<img src="${recording.thumbnailReadUrl}" alt="Thumbnail" loading="lazy" />` :
              `<div class="${styles.thumbnailPlaceholder}">No thumbnail</div>`
            }
            <button class="${styles.playButton}" data-video-url="${recording.videoReadUrl}" title="Play video">
              <i class="fas fa-play"></i>
            </button>
            <div class="${styles.selectionCheckbox}">
              ${isSelected ? '<i class="fas fa-check"></i>' : ''}
            </div>
            <div class="${styles.validBadge} ${isValid ? styles.validBadgeValid : styles.validBadgeInvalid}">
              ${isValid ? 'Valid' : 'Invalid'}
            </div>
            <div class="${styles.typeBadge} ${recording.videoOnly ? styles.typeBadgeVideoOnly : styles.typeBadgeTracker}">
              <i class="fas ${recording.videoOnly ? 'fa-video' : 'fa-wave-square'}"></i> ${recording.videoOnly ? 'Video Only' : 'Tracker Data'}
            </div>
          </div>
          <div class="${styles.recordingInfo}">
            <p class="${styles.recordingUser}">${recording.userFullName}</p>
            <p class="${styles.recordingEmail}">${recording.userEmail || 'No email'}</p>
            <p class="${styles.recordingTask}">${formatTaskType(recording.taskType)}</p>
            <p class="${styles.recordingDate}">${formatDate(recording.createdAt.toString())}</p>
          </div>
        </div>
      `;
    }).join('');

    const paginationHTML = this.renderPagination();

    return `
      <div class="${styles.recordingsGrid}">${grid}</div>
      ${paginationHTML}
    `;
  }

  private renderPagination(): string {
    if (!this.pagination || this.pagination.totalPages <= 1) {
      return '';
    }

    const { page, totalPages, total } = this.pagination;

    return `
      <div class="${styles.pagination}">
        <button class="${styles.pageButton}" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">
          <i class="fas fa-chevron-left"></i>
        </button>
        <span class="${styles.pageInfo}">Page ${page} of ${totalPages} (${total} total)</span>
        <button class="${styles.pageButton}" ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}">
          <i class="fas fa-chevron-right"></i>
        </button>
      </div>
    `;
  }

  private attachEventListeners(): void {
    // Search button
    const searchButton = document.getElementById('searchButton');
    if (searchButton) {
      searchButton.addEventListener('click', () => {
        this.readFilters();
        this.filters.page = 1;
        this.selectedIds.clear();
        this.searchRecordings();
      });
    }

    // Enter key on email input
    const emailInput = document.getElementById('filterEmail') as HTMLInputElement;
    if (emailInput) {
      emailInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.readFilters();
          this.filters.page = 1;
          this.selectedIds.clear();
          this.searchRecordings();
        }
      });
    }

    // Clear search button
    const clearSearchButton = document.getElementById('clearSearchButton');
    if (clearSearchButton) {
      clearSearchButton.addEventListener('click', () => this.clearSearch());
    }

    this.attachActionListeners();
  }

  private attachActionListeners(): void {
    // Select all
    const selectAllButton = document.getElementById('selectAllButton');
    if (selectAllButton) {
      selectAllButton.addEventListener('click', () => {
        this.recordings.forEach(r => this.selectedIds.add(r.id));
        this.updateRecordingsGrid();
        this.updateActionBar();
      });
    }

    // Clear selection
    const clearSelectionButton = document.getElementById('clearSelectionButton');
    if (clearSelectionButton) {
      clearSelectionButton.addEventListener('click', () => {
        this.selectedIds.clear();
        this.updateRecordingsGrid();
        this.updateActionBar();
      });
    }

    // Mark valid
    const markValidButton = document.getElementById('markValidButton');
    if (markValidButton) {
      markValidButton.addEventListener('click', () => this.bulkUpdateValid(true));
    }

    // Mark invalid
    const markInvalidButton = document.getElementById('markInvalidButton');
    if (markInvalidButton) {
      markInvalidButton.addEventListener('click', () => this.bulkUpdateValid(false));
    }

    // See all by users
    const seeAllByUsersButton = document.getElementById('seeAllByUsersButton');
    if (seeAllByUsersButton) {
      seeAllByUsersButton.addEventListener('click', () => this.filterBySelectedUsers());
    }

    // Create warning
    const createWarningButton = document.getElementById('createWarningButton');
    if (createWarningButton) {
      createWarningButton.addEventListener('click', () => this.showWarningModal());
    }
  }

  private attachRecordingListeners(): void {
    const recordingsSection = document.getElementById('recordingsSection');
    if (!recordingsSection) return;

    // Recording card clicks (selection toggle)
    const cards = recordingsSection.querySelectorAll(`.${styles.recordingCard}`);
    cards.forEach(card => {
      card.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        // Don't toggle selection if clicking play button
        if (target.closest(`.${styles.playButton}`)) return;

        const recordingId = card.getAttribute('data-recording-id');
        if (recordingId) {
          if (this.selectedIds.has(recordingId)) {
            this.selectedIds.delete(recordingId);
          } else {
            this.selectedIds.add(recordingId);
          }
          this.updateRecordingsGrid();
          this.updateActionBar();
        }
      });
    });

    // Play buttons
    const playButtons = recordingsSection.querySelectorAll(`.${styles.playButton}`);
    playButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = (button as HTMLElement).closest(`.${styles.recordingCard}`);
        const recordingId = card?.getAttribute('data-recording-id');
        if (recordingId) {
          const index = this.recordings.findIndex(r => r.id === recordingId);
          if (index !== -1) {
            this.showVideoModal(index);
          }
        }
      });
    });

    // Pagination buttons
    const pageButtons = recordingsSection.querySelectorAll(`.${styles.pageButton}[data-page]`);
    pageButtons.forEach(button => {
      button.addEventListener('click', () => {
        const page = button.getAttribute('data-page');
        if (page) {
          this.filters.page = parseInt(page, 10);
          this.searchRecordings();
        }
      });
    });
  }

  private hasActiveSearch(): boolean {
    return !!(
      this.filters.userEmail ||
      this.filters.userEmails ||
      this.filters.startDate ||
      this.filters.endDate ||
      this.filters.videoOnly ||
      this.filters.valid ||
      this.filters.taskType
    );
  }

  private clearSearch(): void {
    this.filters = {
      userEmail: '',
      userEmails: '',
      startDate: '',
      endDate: '',
      videoOnly: '',
      valid: '',
      taskType: '',
      page: 1,
      limit: this.filters.limit,
    };
    this.selectedIds.clear();

    // Reset all input fields
    const email = document.getElementById('filterEmail') as HTMLInputElement;
    const startDate = document.getElementById('filterStartDate') as HTMLInputElement;
    const endDate = document.getElementById('filterEndDate') as HTMLInputElement;
    const videoOnly = document.getElementById('filterVideoOnly') as HTMLSelectElement;
    const valid = document.getElementById('filterValid') as HTMLSelectElement;
    const taskType = document.getElementById('filterTaskType') as HTMLSelectElement;

    if (email) email.value = '';
    if (startDate) startDate.value = '';
    if (endDate) endDate.value = '';
    if (videoOnly) videoOnly.value = '';
    if (valid) valid.value = '';
    if (taskType) taskType.value = '';

    this.searchRecordings();
  }

  private updateClearSearchButton(): void {
    const btn = document.getElementById('clearSearchButton');
    if (btn) {
      btn.style.display = this.hasActiveSearch() ? 'flex' : 'none';
    }
  }

  private readFilters(): void {
    const email = document.getElementById('filterEmail') as HTMLInputElement;
    const startDate = document.getElementById('filterStartDate') as HTMLInputElement;
    const endDate = document.getElementById('filterEndDate') as HTMLInputElement;
    const videoOnly = document.getElementById('filterVideoOnly') as HTMLSelectElement;
    const valid = document.getElementById('filterValid') as HTMLSelectElement;
    const taskType = document.getElementById('filterTaskType') as HTMLSelectElement;

    this.filters.userEmail = email?.value || '';
    this.filters.userEmails = '';
    this.filters.startDate = startDate?.value || '';
    this.filters.endDate = endDate?.value || '';
    this.filters.videoOnly = videoOnly?.value || '';
    this.filters.valid = valid?.value || '';
    this.filters.taskType = taskType?.value || '';
  }

  private async searchRecordings(): Promise<void> {
    if (this.isLoading) return;

    this.isLoading = true;
    const recordingsSection = document.getElementById('recordingsSection');
    if (recordingsSection) {
      recordingsSection.innerHTML = `
        <div class="${styles.loadingState}">
          <i class="fas fa-spinner fa-spin"></i>
          Loading recordings...
        </div>
      `;
    }

    try {
      const state = LoginStateManager.getInstance().getState();
      const token = state.tokens?.token;
      if (!token) throw new Error('Not authenticated');

      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) throw new Error('API URL not configured');

      const params = new URLSearchParams();
      params.set('page', this.filters.page.toString());
      params.set('limit', this.filters.limit.toString());
      if (this.filters.userEmails) {
        params.set('userEmails', this.filters.userEmails);
      } else if (this.filters.userEmail) {
        params.set('userEmail', this.filters.userEmail);
      }
      if (this.filters.startDate) params.set('startDate', this.filters.startDate);
      if (this.filters.endDate) params.set('endDate', this.filters.endDate);
      if (this.filters.videoOnly) params.set('videoOnly', this.filters.videoOnly);
      if (this.filters.valid) params.set('valid', this.filters.valid);
      if (this.filters.taskType) params.set('taskType', this.filters.taskType);

      const response = await fetch(`${apiUrl}/admin/recordings/search?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          LoginStateManager.getInstance().logout();
          throw new Error('Session expired');
        }
        throw new Error(`Search failed: ${response.status}`);
      }

      const data = await response.json();
      this.recordings = data.items || [];
      this.pagination = data.pagination || null;

      this.updateRecordingsGrid();
      this.updateActionBar();
      this.updateClearSearchButton();
    } catch (error) {
      console.error('Search failed:', error);
      if (recordingsSection) {
        recordingsSection.innerHTML = `
          <div class="${styles.emptyState}">
            <i class="fas fa-exclamation-circle"></i>
            <p>Failed to load recordings. Please try again.</p>
          </div>
        `;
      }
    } finally {
      this.isLoading = false;
    }
  }

  private updateRecordingsGrid(): void {
    const recordingsSection = document.getElementById('recordingsSection');
    if (recordingsSection) {
      recordingsSection.innerHTML = this.renderRecordingsGrid();
      this.attachRecordingListeners();
    }
  }

  private async bulkUpdateValid(valid: boolean): Promise<void> {
    if (this.selectedIds.size === 0) return;

    const action = valid ? 'mark as valid' : 'mark as invalid';
    const confirmed = await this.showConfirm(
      `Are you sure you want to ${action} ${this.selectedIds.size} recording(s)?`,
      valid ? 'Mark Valid' : 'Mark Invalid',
      !valid
    );
    if (!confirmed) return;

    try {
      const state = LoginStateManager.getInstance().getState();
      const token = state.tokens?.token;
      if (!token) throw new Error('Not authenticated');

      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) throw new Error('API URL not configured');

      const response = await fetch(`${apiUrl}/admin/recordings/bulk-valid`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recordingIds: Array.from(this.selectedIds),
          valid,
        }),
      });

      if (!response.ok) {
        throw new Error(`Update failed: ${response.status}`);
      }

      const result = await response.json();
      this.showNotification(`Successfully updated ${result.updated} recording(s).`, 'success');

      this.selectedIds.clear();
      this.searchRecordings();
    } catch (error) {
      console.error('Bulk update failed:', error);
      this.showNotification('Failed to update recordings. Please try again.', 'error');
    }
  }

  private showWarningModal(): void {
    // Find user ID from filtered recordings
    const userEmail = this.filters.userEmail.trim();
    if (!userEmail) {
      this.showNotification('Please enter an email filter first to target a specific user.', 'info');
      return;
    }

    // Get the first matching user's ID from recordings
    const targetRecording = this.recordings.find(r =>
      r.userEmail && r.userEmail.toLowerCase().includes(userEmail.toLowerCase())
    );

    if (!targetRecording) {
      this.showNotification('No user found matching the email filter. Please search first.', 'info');
      return;
    }

    this.warningModalUserId = targetRecording.userId;

    const overlay = document.createElement('div');
    overlay.className = styles.modalOverlay;
    overlay.id = 'warningModalOverlay';
    overlay.innerHTML = `
      <div class="${styles.modal}">
        <h2 class="${styles.modalTitle}"><i class="fas fa-exclamation-triangle"></i> Create Warning</h2>
        <p style="color: rgba(255, 255, 255, 0.7); margin-bottom: 1.5rem;">
          Creating warning for: <strong>${targetRecording.userFullName}</strong> (${targetRecording.userEmail})
        </p>
        <div class="${styles.modalField}">
          <label class="${styles.modalLabel}">Title</label>
          <input type="text" class="${styles.modalInput}" id="warningTitle" placeholder="Warning title..." maxlength="200">
        </div>
        <div class="${styles.modalField}">
          <label class="${styles.modalLabel}">Message</label>
          <textarea class="${styles.modalTextarea}" id="warningMessage" placeholder="Detailed warning message..."></textarea>
        </div>
        <div class="${styles.modalButtons}">
          <button class="${styles.modalCancelButton}" id="warningCancelButton">Cancel</button>
          <button class="${styles.modalSubmitButton}" id="warningSubmitButton">
            <i class="fas fa-paper-plane"></i> Send Warning
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Attach modal listeners
    const cancelButton = document.getElementById('warningCancelButton');
    const submitButton = document.getElementById('warningSubmitButton');
    const titleInput = document.getElementById('warningTitle') as HTMLInputElement;

    cancelButton?.addEventListener('click', () => this.closeWarningModal());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeWarningModal();
    });
    submitButton?.addEventListener('click', () => this.submitWarning());
    titleInput?.focus();
  }

  private closeWarningModal(): void {
    const overlay = document.getElementById('warningModalOverlay');
    if (overlay) {
      overlay.remove();
    }
    this.warningModalUserId = null;
  }

  private async submitWarning(): Promise<void> {
    if (!this.warningModalUserId) return;

    const titleInput = document.getElementById('warningTitle') as HTMLInputElement;
    const messageInput = document.getElementById('warningMessage') as HTMLTextAreaElement;
    const submitButton = document.getElementById('warningSubmitButton') as HTMLButtonElement;

    const title = titleInput?.value.trim();
    const message = messageInput?.value.trim();

    if (!title) {
      this.showNotification('Please enter a title for the warning.', 'info');
      return;
    }

    if (!message) {
      this.showNotification('Please enter a message for the warning.', 'info');
      return;
    }

    try {
      submitButton.disabled = true;
      submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

      const state = LoginStateManager.getInstance().getState();
      const token = state.tokens?.token;
      if (!token) throw new Error('Not authenticated');

      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) throw new Error('API URL not configured');

      const response = await fetch(`${apiUrl}/admin/warnings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: this.warningModalUserId,
          title,
          message,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create warning: ${response.status}`);
      }

      this.showNotification('Warning created successfully!', 'success');
      this.closeWarningModal();
    } catch (error) {
      console.error('Failed to create warning:', error);
      this.showNotification('Failed to create warning. Please try again.', 'error');
      submitButton.disabled = false;
      submitButton.innerHTML = '<i class="fas fa-paper-plane"></i> Send Warning';
    }
  }

  private async fetchWarnings(): Promise<void> {
    if (this.isLoadingWarnings) return;
    this.isLoadingWarnings = true;

    const alertsContent = document.getElementById('alertsContent');
    if (alertsContent) {
      alertsContent.innerHTML = `
        <div class="${styles.loadingState}">
          <i class="fas fa-spinner fa-spin"></i>
          Loading alerts...
        </div>
      `;
    }

    try {
      const state = LoginStateManager.getInstance().getState();
      const token = state.tokens?.token;
      if (!token) throw new Error('Not authenticated');

      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) throw new Error('API URL not configured');

      const params = new URLSearchParams();
      params.set('page', this.warningsPage.toString());
      params.set('limit', '20');
      if (this.warningsAckFilter) params.set('acknowledged', this.warningsAckFilter);

      const response = await fetch(`${apiUrl}/admin/warnings?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          LoginStateManager.getInstance().logout();
          throw new Error('Session expired');
        }
        throw new Error(`Failed to fetch alerts: ${response.status}`);
      }

      const data = await response.json();
      this.warnings = data.items || [];
      this.warningsPagination = data.pagination || null;

      if (alertsContent) {
        alertsContent.innerHTML = this.renderWarningsTable();
        this.attachWarningsPaginationListeners();
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
      if (alertsContent) {
        alertsContent.innerHTML = `
          <div class="${styles.emptyState}">
            <i class="fas fa-exclamation-circle"></i>
            <p>Failed to load alerts. Please try again.</p>
          </div>
        `;
      }
    } finally {
      this.isLoadingWarnings = false;
    }
  }

  private renderWarningsTable(): string {
    if (this.warnings.length === 0) {
      return `
        <div class="${styles.emptyState}">
          <i class="fas fa-bell-slash"></i>
          <p>No alerts found.</p>
        </div>
      `;
    }

    const formatDate = (dateString: string): string => {
      const date = new Date(dateString);
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const formatDateTime = (dateString: string): string => {
      const date = new Date(dateString);
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) +
        ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const rows = this.warnings.map(warning => {
      const isAcked = warning.acknowledgedAt !== null;
      return `
        <tr>
          <td class="${styles.alertUserCell}">
            <p class="${styles.alertUserName}">${warning.userFullName}</p>
            <p class="${styles.alertUserEmail}">${warning.userEmail || 'No email'}</p>
          </td>
          <td class="${styles.alertTitle}">${warning.title}</td>
          <td class="${styles.alertMessage}" title="${warning.message.replace(/"/g, '&quot;')}">${warning.message}</td>
          <td class="${styles.alertDate}">${formatDate(warning.createdAt)}</td>
          <td>
            <span class="${styles.ackBadge} ${isAcked ? styles.ackBadgeYes : styles.ackBadgeNo}">
              ${isAcked ? 'Acknowledged' : 'Pending'}
            </span>
            ${isAcked ? `<br><span class="${styles.alertDate}">${formatDateTime(warning.acknowledgedAt!)}</span>` : ''}
          </td>
        </tr>
      `;
    }).join('');

    const paginationHTML = this.renderWarningsPagination();

    return `
      <div style="overflow-x: auto;">
        <table class="${styles.alertsTable}">
          <thead>
            <tr>
              <th>User</th>
              <th>Title</th>
              <th>Message</th>
              <th>Created</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${paginationHTML}
    `;
  }

  private renderWarningsPagination(): string {
    if (!this.warningsPagination || this.warningsPagination.totalPages <= 1) return '';

    const { page, totalPages, total } = this.warningsPagination;

    return `
      <div class="${styles.pagination}">
        <button class="${styles.pageButton}" ${page <= 1 ? 'disabled' : ''} data-warnings-page="${page - 1}">
          <i class="fas fa-chevron-left"></i>
        </button>
        <span class="${styles.pageInfo}">Page ${page} of ${totalPages} (${total} total)</span>
        <button class="${styles.pageButton}" ${page >= totalPages ? 'disabled' : ''} data-warnings-page="${page + 1}">
          <i class="fas fa-chevron-right"></i>
        </button>
      </div>
    `;
  }

  private attachWarningsPaginationListeners(): void {
    const buttons = document.querySelectorAll(`.${styles.pageButton}[data-warnings-page]`);
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const page = btn.getAttribute('data-warnings-page');
        if (page) {
          this.warningsPage = parseInt(page, 10);
          this.fetchWarnings();
        }
      });
    });
  }

  private ensureToastContainer(): HTMLElement {
    if (!this.toastContainer || !document.body.contains(this.toastContainer)) {
      this.toastContainer = document.createElement('div');
      this.toastContainer.className = styles.toastContainer;
      document.body.appendChild(this.toastContainer);
    }
    return this.toastContainer;
  }

  private showNotification(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    const container = this.ensureToastContainer();

    const iconMap = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    const styleMap = { success: styles.toastSuccess, error: styles.toastError, info: styles.toastInfo };

    const toast = document.createElement('div');
    toast.className = `${styles.toast} ${styleMap[type]}`;
    toast.innerHTML = `
      <i class="fas ${iconMap[type]}"></i>
      <span class="${styles.toastMessage}">${message}</span>
      <button class="${styles.toastClose}">&times;</button>
    `;

    container.appendChild(toast);

    const dismiss = () => {
      toast.classList.add(styles.toastOut);
      toast.addEventListener('animationend', () => toast.remove());
    };

    toast.querySelector(`.${styles.toastClose}`)?.addEventListener('click', dismiss);
    setTimeout(dismiss, 3500);
  }

  private showConfirm(message: string, confirmLabel: string = 'Confirm', danger: boolean = false): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = styles.confirmOverlay;
      overlay.innerHTML = `
        <div class="${styles.confirmDialog}">
          <p class="${styles.confirmMessage}">${message}</p>
          <div class="${styles.confirmActions}">
            <button class="${styles.confirmCancelButton}" id="confirmCancelBtn">Cancel</button>
            <button class="${styles.confirmActionButton} ${danger ? styles.confirmDanger : ''}" id="confirmOkBtn">${confirmLabel}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const cleanup = (result: boolean) => {
        overlay.remove();
        resolve(result);
      };

      overlay.querySelector('#confirmCancelBtn')?.addEventListener('click', () => cleanup(false));
      overlay.querySelector('#confirmOkBtn')?.addEventListener('click', () => cleanup(true));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup(false);
      });

      (overlay.querySelector('#confirmOkBtn') as HTMLElement)?.focus();
    });
  }

  private showVideoModal(index: number): void {
    this.videoModalIndex = index;

    const overlay = document.createElement('div');
    overlay.className = styles.videoModalOverlay;
    overlay.id = 'videoModalOverlay';

    const modal = document.createElement('div');
    modal.className = styles.videoModal;
    modal.innerHTML = `
      <button class="${styles.videoCloseButton}" id="videoCloseButton">&times;</button>
      <div id="videoModalContent">${this.renderVideoModalContent()}</div>
    `;

    const actionsBar = document.createElement('div');
    actionsBar.className = styles.videoSelectionActions;
    actionsBar.id = 'videoSelectionActions';

    overlay.appendChild(modal);
    overlay.appendChild(actionsBar);
    document.body.appendChild(overlay);

    this.updateVideoSelectionActions();

    const closeButton = document.getElementById('videoCloseButton');
    closeButton?.addEventListener('click', () => this.closeVideoModal());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeVideoModal();
    });

    this.attachVideoModalListeners();
    document.addEventListener('keydown', this.handleVideoKeyDown);
  }

  private updateVideoSelectionActions(): void {
    const actionsBar = document.getElementById('videoSelectionActions');
    if (!actionsBar) return;

    const count = this.selectedIds.size;
    if (count === 0) {
      actionsBar.style.display = 'none';
      return;
    }

    actionsBar.style.display = 'flex';
    actionsBar.innerHTML = `
      <span class="${styles.videoSelectionCount}">${count} selected</span>
      <button class="${styles.actionButton} ${styles.actionButtonValid}" id="videoMarkValidButton">
        <i class="fas fa-check-circle"></i> Mark Valid
      </button>
      <button class="${styles.actionButton} ${styles.actionButtonInvalid}" id="videoMarkInvalidButton">
        <i class="fas fa-times-circle"></i> Mark Invalid
      </button>
    `;

    document.getElementById('videoMarkValidButton')?.addEventListener('click', () => this.bulkUpdateValidFromModal(true));
    document.getElementById('videoMarkInvalidButton')?.addEventListener('click', () => this.bulkUpdateValidFromModal(false));
  }

  private renderVideoModalContent(): string {
    if (this.videoModalIndex === null || !this.recordings[this.videoModalIndex]) return '';

    const recording = this.recordings[this.videoModalIndex];
    const isSelected = this.selectedIds.has(recording.id);
    const globalPosition = this.pagination
      ? (this.pagination.page - 1) * this.pagination.limit + this.videoModalIndex + 1
      : this.videoModalIndex + 1;
    const globalTotal = this.pagination?.total ?? this.recordings.length;
    const pageInfo = this.pagination && this.pagination.totalPages > 1
      ? ` (Page ${this.pagination.page}/${this.pagination.totalPages})`
      : '';
    const isFirst = this.videoModalIndex === 0 && !this.pagination?.hasPrev;
    const isLast = this.videoModalIndex === this.recordings.length - 1 && !this.pagination?.hasNext;

    return `
      <div class="${styles.videoModalHeader}">
        <span class="${styles.videoNavInfo}">${globalPosition} / ${globalTotal}${pageInfo}</span>
        <span class="${styles.videoSelectionBadge} ${isSelected ? styles.videoSelectionBadgeActive : ''}" id="videoSelectionBadge">
          ${isSelected ? 'Selected' : 'Not Selected'}
        </span>
        <span class="${styles.videoUserInfo}" title="${recording.userEmail || ''}">${recording.userFullName}${recording.userEmail ? ` (${recording.userEmail})` : ''}</span>
      </div>
      <video class="${styles.videoElement}" controls autoplay>
        <source src="${recording.videoReadUrl}" type="video/mp4">
        Your browser does not support the video tag.
      </video>
      <div class="${styles.videoModalFooter}">
        <div class="${styles.videoModalControls}">
          <button class="${styles.videoNavButton}" id="videoPrevButton" ${isFirst ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i> Prev
          </button>
          <button class="${styles.videoNavButton}" id="videoNextButton" ${isLast ? 'disabled' : ''}>
            Next <i class="fas fa-chevron-right"></i>
          </button>
        </div>
        <button class="${styles.videoUserButton}" id="videoSeeAllUserButton" ${!recording.userEmail ? 'disabled' : ''}>
          <i class="fas fa-user"></i> See All User Recordings
        </button>
        <label class="${styles.keySchemeToggle}">
          <input type="checkbox" id="videoBracketToggle" ${this.useBracketKeys ? 'checked' : ''}>
          [ ] keys
        </label>
      </div>
    `;
  }

  private attachVideoModalListeners(): void {
    const prevButton = document.getElementById('videoPrevButton');
    const nextButton = document.getElementById('videoNextButton');
    const selectionBadge = document.getElementById('videoSelectionBadge');
    const seeAllUserButton = document.getElementById('videoSeeAllUserButton');
    const bracketToggle = document.getElementById('videoBracketToggle') as HTMLInputElement;

    prevButton?.addEventListener('click', () => this.navigateVideo(-1));
    nextButton?.addEventListener('click', () => this.navigateVideo(1));
    selectionBadge?.addEventListener('click', () => this.toggleCurrentRecordingSelection());
    seeAllUserButton?.addEventListener('click', () => this.seeAllUserRecordingsFromModal());
    bracketToggle?.addEventListener('change', () => {
      this.useBracketKeys = bracketToggle.checked;
    });
  }

  private handleVideoKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.closeVideoModal();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      this.navigateVideo(-1);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      this.navigateVideo(1);
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      this.toggleCurrentRecordingSelection();
      return;
    }
    if (this.useBracketKeys) {
      if (e.key === '[') {
        e.preventDefault();
        e.stopPropagation();
        this.navigateVideo(-1);
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        e.stopPropagation();
        this.navigateVideo(1);
        return;
      }
    }
  };

  private async navigateVideo(direction: -1 | 1): Promise<void> {
    if (this.videoModalIndex === null || this.isLoading) return;

    const newIndex = this.videoModalIndex + direction;

    // Pause current video
    const overlay = document.getElementById('videoModalOverlay');
    if (overlay) {
      const video = overlay.querySelector('video');
      if (video) video.pause();
    }

    if (newIndex < 0) {
      if (!this.pagination?.hasPrev) return;
      this.filters.page = this.pagination.page - 1;
      await this.searchRecordings();
      if (this.videoModalIndex === null) return; // Modal was closed during loading
      this.videoModalIndex = this.recordings.length - 1;
    } else if (newIndex >= this.recordings.length) {
      if (!this.pagination?.hasNext) return;
      this.filters.page = this.pagination.page + 1;
      await this.searchRecordings();
      if (this.videoModalIndex === null) return; // Modal was closed during loading
      this.videoModalIndex = 0;
    } else {
      this.videoModalIndex = newIndex;
    }

    const contentContainer = document.getElementById('videoModalContent');
    if (contentContainer) {
      contentContainer.innerHTML = this.renderVideoModalContent();
      this.attachVideoModalListeners();
    }
  }

  private toggleCurrentRecordingSelection(): void {
    if (this.videoModalIndex === null) return;

    const recording = this.recordings[this.videoModalIndex];
    if (!recording) return;

    if (this.selectedIds.has(recording.id)) {
      this.selectedIds.delete(recording.id);
    } else {
      this.selectedIds.add(recording.id);
    }

    // Update badge in modal
    const badge = document.getElementById('videoSelectionBadge');
    if (badge) {
      const isSelected = this.selectedIds.has(recording.id);
      badge.textContent = isSelected ? 'Selected' : 'Not Selected';
      badge.className = `${styles.videoSelectionBadge} ${isSelected ? styles.videoSelectionBadgeActive : ''}`;
    }

    // Update grid card behind the modal
    this.updateRecordingsGrid();
    this.updateActionBar();
    this.updateVideoSelectionActions();
  }

  private async bulkUpdateValidFromModal(valid: boolean): Promise<void> {
    await this.bulkUpdateValid(valid);
    // After bulk update, recordings may have changed - adjust index if needed
    if (this.videoModalIndex !== null) {
      if (this.recordings.length === 0) {
        this.closeVideoModal();
        return;
      }
      if (this.videoModalIndex >= this.recordings.length) {
        this.videoModalIndex = this.recordings.length - 1;
      }
      const contentContainer = document.getElementById('videoModalContent');
      if (contentContainer) {
        contentContainer.innerHTML = this.renderVideoModalContent();
        this.attachVideoModalListeners();
      }
      this.updateVideoSelectionActions();
    }
  }

  private seeAllUserRecordingsFromModal(): void {
    if (this.videoModalIndex === null) return;

    const recording = this.recordings[this.videoModalIndex];
    if (!recording?.userEmail) return;

    this.closeVideoModal();

    this.filters.userEmail = recording.userEmail;
    this.filters.userEmails = '';
    const emailInput = document.getElementById('filterEmail') as HTMLInputElement;
    if (emailInput) {
      emailInput.value = recording.userEmail;
    }

    this.filters.page = 1;
    this.selectedIds.clear();
    this.searchRecordings();
  }

  private closeVideoModal(): void {
    const overlay = document.getElementById('videoModalOverlay');
    if (overlay) {
      const video = overlay.querySelector('video');
      if (video) {
        video.pause();
      }
      overlay.remove();
    }
    this.videoModalIndex = null;
    document.removeEventListener('keydown', this.handleVideoKeyDown);
  }
}
