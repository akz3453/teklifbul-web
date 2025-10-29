/**
 * Tabs UI Module
 * Handles tab switching and active state management
 */

/**
 * Tab Manager Class
 */
export class TabManager {
  constructor(containerSelector) {
    this.container = document.querySelector(containerSelector);
    this.tabs = [];
    this.activeTab = null;
    this.init();
  }

  /**
   * Initialize the tab manager
   */
  init() {
    if (!this.container) {
      console.warn('Tab container not found:', this.containerSelector);
      return;
    }

    // Find all tab buttons
    this.tabs = Array.from(this.container.querySelectorAll('[role="tab"]'));
    
    if (this.tabs.length === 0) {
      console.warn('No tabs found in container');
      return;
    }

    // Set up event listeners
    this.tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchTab(tab);
      });
    });

    // Set initial active tab
    const activeTab = this.container.querySelector('.tab.active, [aria-selected="true"]');
    if (activeTab) {
      this.setActiveTab(activeTab);
    } else if (this.tabs.length > 0) {
      this.setActiveTab(this.tabs[0]);
    }
  }

  /**
   * Switch to a specific tab
   * @param {HTMLElement} tabElement - Tab element to switch to
   */
  switchTab(tabElement) {
    if (!this.tabs.includes(tabElement)) {
      console.warn('Tab element not found in tabs array');
      return;
    }

    this.setActiveTab(tabElement);
    
    // Dispatch custom event
    const event = new CustomEvent('tabChanged', {
      detail: {
        tab: tabElement,
        tabId: tabElement.id,
        tabName: tabElement.textContent.trim()
      }
    });
    this.container.dispatchEvent(event);
  }

  /**
   * Set active tab
   * @param {HTMLElement} tabElement - Tab element to make active
   */
  setActiveTab(tabElement) {
    // Remove active class from all tabs
    this.tabs.forEach(tab => {
      tab.classList.remove('active');
      tab.setAttribute('aria-selected', 'false');
    });

    // Add active class to selected tab
    tabElement.classList.add('active');
    tabElement.setAttribute('aria-selected', 'true');
    
    this.activeTab = tabElement;

    // Show/hide corresponding content
    this.updateContent(tabElement);
  }

  /**
   * Update content visibility based on active tab
   * @param {HTMLElement} tabElement - Active tab element
   */
  updateContent(tabElement) {
    const tabId = tabElement.id;
    const controlsId = tabElement.getAttribute('aria-controls');
    
    if (controlsId) {
      const contentElement = document.getElementById(controlsId);
      if (contentElement) {
        // Hide all tab content
        const allContent = document.querySelectorAll('[role="tabpanel"]');
        allContent.forEach(content => {
          content.classList.add('hidden');
          content.setAttribute('aria-hidden', 'true');
        });

        // Show active content
        contentElement.classList.remove('hidden');
        contentElement.setAttribute('aria-hidden', 'false');
      }
    }
  }

  /**
   * Get active tab
   * @returns {HTMLElement|null} Active tab element
   */
  getActiveTab() {
    return this.activeTab;
  }

  /**
   * Get tab by ID
   * @param {string} tabId - Tab ID
   * @returns {HTMLElement|null} Tab element
   */
  getTabById(tabId) {
    return this.tabs.find(tab => tab.id === tabId) || null;
  }

  /**
   * Switch to tab by ID
   * @param {string} tabId - Tab ID
   */
  switchToTab(tabId) {
    const tab = this.getTabById(tabId);
    if (tab) {
      this.switchTab(tab);
    } else {
      console.warn('Tab not found:', tabId);
    }
  }

  /**
   * Add new tab
   * @param {Object} tabConfig - Tab configuration
   * @param {string} tabConfig.id - Tab ID
   * @param {string} tabConfig.label - Tab label
   * @param {string} tabConfig.contentId - Content element ID
   * @param {boolean} tabConfig.active - Whether to make this tab active
   */
  addTab(tabConfig) {
    const { id, label, contentId, active = false } = tabConfig;

    // Create tab button
    const tabButton = document.createElement('button');
    tabButton.id = id;
    tabButton.className = 'tab';
    tabButton.textContent = label;
    tabButton.setAttribute('role', 'tab');
    tabButton.setAttribute('aria-controls', contentId);
    tabButton.setAttribute('aria-selected', 'false');

    // Add click event listener
    tabButton.addEventListener('click', (e) => {
      e.preventDefault();
      this.switchTab(tabButton);
    });

    // Add to container
    this.container.appendChild(tabButton);
    this.tabs.push(tabButton);

    // Make active if specified
    if (active) {
      this.setActiveTab(tabButton);
    }
  }

  /**
   * Remove tab
   * @param {string} tabId - Tab ID to remove
   */
  removeTab(tabId) {
    const tab = this.getTabById(tabId);
    if (tab) {
      // Remove from DOM
      tab.remove();
      
      // Remove from tabs array
      this.tabs = this.tabs.filter(t => t !== tab);
      
      // If this was the active tab, switch to another tab
      if (this.activeTab === tab) {
        if (this.tabs.length > 0) {
          this.setActiveTab(this.tabs[0]);
        } else {
          this.activeTab = null;
        }
      }
    }
  }
}

/**
 * Simple tab switching function for basic use cases
 * @param {string} tabId - Tab ID to switch to
 * @param {string} containerSelector - Container selector
 */
export function switchTab(tabId, containerSelector = '.tabs') {
  const container = document.querySelector(containerSelector);
  if (!container) {
    console.warn('Tab container not found:', containerSelector);
    return;
  }

  const tab = container.querySelector(`#${tabId}`);
  if (!tab) {
    console.warn('Tab not found:', tabId);
    return;
  }

  // Remove active class from all tabs
  const allTabs = container.querySelectorAll('.tab');
  allTabs.forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });

  // Add active class to selected tab
  tab.classList.add('active');
  tab.setAttribute('aria-selected', 'true');

  // Show/hide content
  const controlsId = tab.getAttribute('aria-controls');
  if (controlsId) {
    const contentElement = document.getElementById(controlsId);
    if (contentElement) {
      // Hide all tab content
      const allContent = document.querySelectorAll('[role="tabpanel"]');
      allContent.forEach(content => {
        content.classList.add('hidden');
        content.setAttribute('aria-hidden', 'true');
      });

      // Show active content
      contentElement.classList.remove('hidden');
      contentElement.setAttribute('aria-hidden', 'false');
    }
  }
}

/**
 * Initialize tabs for a specific container
 * @param {string} containerSelector - Container selector
 * @returns {TabManager} Tab manager instance
 */
export function initTabs(containerSelector) {
  return new TabManager(containerSelector);
}
