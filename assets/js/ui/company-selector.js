/**
 * Company Selector UI Component
 * Handles company selection and switching functionality
 */

import { db, auth } from '../firebase.js';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

/**
 * Company Selector Class
 */
export class CompanySelector {
  constructor(containerSelector, options = {}) {
    this.container = document.querySelector(containerSelector);
    this.options = {
      showLabel: true,
      showUserInfo: true,
      onCompanyChange: null,
      ...options
    };
    this.companies = [];
    this.currentCompany = null;
    this.user = null;
    this.init();
  }

  /**
   * Initialize the company selector
   */
  async init() {
    if (!this.container) {
      console.warn('Company selector container not found:', this.containerSelector);
      return;
    }

    this.user = auth.currentUser;
    if (!this.user) {
      console.warn('User not authenticated');
      return;
    }

    await this.loadCompanies();
    this.render();
    this.bindEvents();
  }

  /**
   * Load user's companies
   */
  async loadCompanies() {
    try {
      // Get user's profile to find company memberships
      const userDoc = await getDoc(doc(db, 'users', this.user.uid));
      const userData = userDoc.data();
      
      if (!userData) {
        console.warn('User data not found');
        return;
      }

      // Get user's company memberships
      const membershipsQuery = query(
        collection(db, 'companies'),
        where('memberships', 'array-contains', this.user.uid)
      );
      
      const membershipsSnap = await getDocs(membershipsQuery);
      const memberCompanies = membershipsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Get companies owned by user
      const ownedQuery = query(
        collection(db, 'companies'),
        where('ownerId', '==', this.user.uid)
      );
      
      const ownedSnap = await getDocs(ownedQuery);
      const ownedCompanies = ownedSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Combine and deduplicate companies
      const allCompanies = [...memberCompanies, ...ownedCompanies];
      this.companies = allCompanies.filter((company, index, self) => 
        index === self.findIndex(c => c.id === company.id)
      );

      // Set current company (from user profile or first company)
      this.currentCompany = userData.companyId ? 
        this.companies.find(c => c.id === userData.companyId) : 
        this.companies[0] || null;

    } catch (error) {
      console.error('Error loading companies:', error);
      this.companies = [];
    }
  }

  /**
   * Render the company selector
   */
  render() {
    if (this.companies.length === 0) {
      this.container.innerHTML = `
        <div class="company-selector-empty">
          <span class="company-label">Şirket:</span>
          <span class="company-name">Şirket bulunamadı</span>
        </div>
      `;
      return;
    }

    const currentCompanyName = this.currentCompany?.name || 'Şirket Seçin';
    const currentCompanyId = this.currentCompany?.id || '';

    this.container.innerHTML = `
      <div class="company-selector">
        ${this.options.showLabel ? '<span class="company-label">Şirket:</span>' : ''}
        <div class="company-dropdown">
          <button class="company-button" type="button" aria-haspopup="true" aria-expanded="false">
            <span class="company-name">${currentCompanyName}</span>
            <span class="company-arrow">▼</span>
          </button>
          <div class="company-menu" role="menu">
            ${this.companies.map(company => `
              <div class="company-option ${company.id === currentCompanyId ? 'active' : ''}" 
                   data-company-id="${company.id}" 
                   role="menuitem">
                <span class="company-option-name">${company.name}</span>
                <span class="company-option-role">${company.ownerId === this.user.uid ? 'Sahip' : 'Üye'}</span>
              </div>
            `).join('')}
          </div>
        </div>
        ${this.options.showUserInfo ? `
          <div class="user-info">
            <span class="user-name">${this.user.displayName || this.user.email}</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    const button = this.container.querySelector('.company-button');
    const menu = this.container.querySelector('.company-menu');
    const options = this.container.querySelectorAll('.company-option');

    if (!button || !menu) return;

    // Toggle dropdown
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', !isExpanded);
      menu.classList.toggle('show', !isExpanded);
    });

    // Handle option selection
    options.forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const companyId = option.dataset.companyId;
        this.selectCompany(companyId);
        this.closeDropdown();
      });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) {
        this.closeDropdown();
      }
    });

    // Handle keyboard navigation
    button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        button.click();
      } else if (e.key === 'Escape') {
        this.closeDropdown();
      }
    });
  }

  /**
   * Select a company
   * @param {string} companyId - Company ID
   */
  async selectCompany(companyId) {
    const company = this.companies.find(c => c.id === companyId);
    if (!company) {
      console.warn('Company not found:', companyId);
      return;
    }

    this.currentCompany = company;
    
    // Update UI
    const companyName = this.container.querySelector('.company-name');
    if (companyName) {
      companyName.textContent = company.name;
    }

    // Update active option
    const options = this.container.querySelectorAll('.company-option');
    options.forEach(option => {
      option.classList.toggle('active', option.dataset.companyId === companyId);
    });

    // Call change handler
    if (this.options.onCompanyChange) {
      this.options.onCompanyChange(company);
    }

    // Dispatch custom event
    const event = new CustomEvent('companyChanged', {
      detail: { company, companyId }
    });
    this.container.dispatchEvent(event);
  }

  /**
   * Close the dropdown
   */
  closeDropdown() {
    const button = this.container.querySelector('.company-button');
    const menu = this.container.querySelector('.company-menu');
    
    if (button && menu) {
      button.setAttribute('aria-expanded', 'false');
      menu.classList.remove('show');
    }
  }

  /**
   * Get current company
   * @returns {Object|null} Current company object
   */
  getCurrentCompany() {
    return this.currentCompany;
  }

  /**
   * Get all companies
   * @returns {Array} Array of company objects
   */
  getCompanies() {
    return this.companies;
  }

  /**
   * Refresh companies data
   */
  async refresh() {
    await this.loadCompanies();
    this.render();
    this.bindEvents();
  }
}

/**
 * Simple company selector for basic use cases
 * @param {string} containerSelector - Container selector
 * @param {Object} options - Options object
 * @returns {CompanySelector} Company selector instance
 */
export function initCompanySelector(containerSelector, options = {}) {
  return new CompanySelector(containerSelector, options);
}

/**
 * Get company name by ID
 * @param {string} companyId - Company ID
 * @returns {Promise<string>} Company name
 */
export async function getCompanyName(companyId) {
  try {
    const docRef = doc(db, 'companies', companyId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data().name || 'Bilinmeyen Şirket';
    }
    return 'Şirket Bulunamadı';
  } catch (error) {
    console.error('Error getting company name:', error);
    return 'Hata';
  }
}
