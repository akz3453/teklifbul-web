"use strict";
/**
 * Accessibility (a11y) Helper
 * Teklifbul Rule v1.0 - Accessibility Improvements
 *
 * ARIA attributes ve keyboard navigation için utility fonksiyonlar
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.aria = exports.FocusTrap = void 0;
exports.announceToScreenReader = announceToScreenReader;
exports.setupKeyboardNavigation = setupKeyboardNavigation;
/**
 * ARIA live region oluştur ve mesaj göster
 */
function announceToScreenReader(message, priority = 'polite') {
    let liveRegion = document.getElementById('a11y-live-region');
    if (!liveRegion) {
        liveRegion = document.createElement('div');
        liveRegion.id = 'a11y-live-region';
        liveRegion.setAttribute('aria-live', priority);
        liveRegion.setAttribute('aria-atomic', 'true');
        liveRegion.className = 'sr-only'; // Screen reader only
        document.body.appendChild(liveRegion);
    }
    liveRegion.textContent = message;
    // Mesajı temizle (3 saniye sonra)
    setTimeout(() => {
        if (liveRegion)
            liveRegion.textContent = '';
    }, 3000);
}
/**
 * Focus trap - Modal içinde focus'u tut
 */
class FocusTrap {
    constructor(element) {
        this.firstFocusable = null;
        this.lastFocusable = null;
        this.previousActiveElement = null;
        this.handleKeyDown = (e) => {
            if (e.key !== 'Tab')
                return;
            this.updateFocusableElements();
            if (e.shiftKey) {
                // Shift + Tab (backwards)
                if (document.activeElement === this.firstFocusable) {
                    e.preventDefault();
                    this.lastFocusable?.focus();
                }
            }
            else {
                // Tab (forwards)
                if (document.activeElement === this.lastFocusable) {
                    e.preventDefault();
                    this.firstFocusable?.focus();
                }
            }
        };
        this.element = element;
        this.focusableElements = this.getFocusableElements();
        this.updateFocusableElements();
    }
    getFocusableElements() {
        const selector = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
        return Array.from(this.element.querySelectorAll(selector));
    }
    updateFocusableElements() {
        this.focusableElements = this.getFocusableElements();
        this.firstFocusable = this.focusableElements[0] || null;
        this.lastFocusable = this.focusableElements[this.focusableElements.length - 1] || null;
    }
    activate() {
        this.previousActiveElement = document.activeElement;
        // İlk focusable element'e focus et
        if (this.firstFocusable) {
            this.firstFocusable.focus();
        }
        // Tab tuşu için event listener
        document.addEventListener('keydown', this.handleKeyDown);
    }
    deactivate() {
        document.removeEventListener('keydown', this.handleKeyDown);
        // Önceki focus'a geri dön
        if (this.previousActiveElement instanceof HTMLElement) {
            this.previousActiveElement.focus();
        }
    }
}
exports.FocusTrap = FocusTrap;
/**
 * Keyboard navigation helper
 */
function setupKeyboardNavigation(container, options) {
    const handleKeyDown = (e) => {
        const target = e.target;
        switch (e.key) {
            case 'Enter':
                if (options.onEnter) {
                    e.preventDefault();
                    options.onEnter(target);
                }
                break;
            case 'Escape':
                if (options.onEscape) {
                    e.preventDefault();
                    options.onEscape();
                }
                break;
            case 'ArrowUp':
                if (options.onArrowUp) {
                    e.preventDefault();
                    options.onArrowUp(target);
                }
                break;
            case 'ArrowDown':
                if (options.onArrowDown) {
                    e.preventDefault();
                    options.onArrowDown(target);
                }
                break;
        }
    };
    container.addEventListener('keydown', handleKeyDown);
    // Cleanup function
    return () => {
        container.removeEventListener('keydown', handleKeyDown);
    };
}
/**
 * ARIA attributes helper
 */
exports.aria = {
    setExpanded: (element, expanded) => {
        element.setAttribute('aria-expanded', String(expanded));
    },
    setHidden: (element, hidden) => {
        element.setAttribute('aria-hidden', String(hidden));
    },
    setLabel: (element, label) => {
        element.setAttribute('aria-label', label);
    },
    setDescribedBy: (element, id) => {
        element.setAttribute('aria-describedby', id);
    },
    setLabelledBy: (element, id) => {
        element.setAttribute('aria-labelledby', id);
    },
    setPressed: (element, pressed) => {
        element.setAttribute('aria-pressed', String(pressed));
    },
    setDisabled: (element, disabled) => {
        element.setAttribute('aria-disabled', String(disabled));
        if (disabled) {
            element.setAttribute('tabindex', '-1');
        }
        else {
            element.removeAttribute('tabindex');
        }
    }
};
/**
 * Kullanım Örnekleri:
 *
 * ```typescript
 * import { announceToScreenReader, FocusTrap, setupKeyboardNavigation, aria } from './a11y-helper.js';
 *
 * // Screen reader announcement
 * announceToScreenReader('Talep başarıyla oluşturuldu', 'polite');
 *
 * // Modal focus trap
 * const modal = document.getElementById('myModal');
 * const focusTrap = new FocusTrap(modal);
 * focusTrap.activate();
 * // Modal kapanınca
 * focusTrap.deactivate();
 *
 * // Keyboard navigation
 * const cleanup = setupKeyboardNavigation(listContainer, {
 *   onEnter: (el) => selectItem(el),
 *   onEscape: () => closeList(),
 *   onArrowDown: (el) => focusNext(el)
 * });
 *
 * // ARIA attributes
 * aria.setExpanded(button, true);
 * aria.setLabel(button, 'Menüyü aç');
 * ```
 */
