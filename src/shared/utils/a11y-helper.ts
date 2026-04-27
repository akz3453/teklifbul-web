/**
 * Accessibility (a11y) Helper
 * Teklifbul Rule v1.0 - Accessibility Improvements
 * 
 * ARIA attributes ve keyboard navigation için utility fonksiyonlar
 */

/**
 * ARIA live region oluştur ve mesaj göster
 */
export function announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
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
        if (liveRegion) liveRegion.textContent = '';
    }, 3000);
}

/**
 * Focus trap - Modal içinde focus'u tut
 */
export class FocusTrap {
    private element: HTMLElement;
    private focusableElements: HTMLElement[];
    private firstFocusable: HTMLElement | null = null;
    private lastFocusable: HTMLElement | null = null;
    private previousActiveElement: Element | null = null;

    constructor(element: HTMLElement) {
        this.element = element;
        this.focusableElements = this.getFocusableElements();
        this.updateFocusableElements();
    }

    private getFocusableElements(): HTMLElement[] {
        const selector = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
        return Array.from(this.element.querySelectorAll(selector)) as HTMLElement[];
    }

    private updateFocusableElements(): void {
        this.focusableElements = this.getFocusableElements();
        this.firstFocusable = this.focusableElements[0] || null;
        this.lastFocusable = this.focusableElements[this.focusableElements.length - 1] || null;
    }

    activate(): void {
        this.previousActiveElement = document.activeElement;

        // İlk focusable element'e focus et
        if (this.firstFocusable) {
            this.firstFocusable.focus();
        }

        // Tab tuşu için event listener
        document.addEventListener('keydown', this.handleKeyDown);
    }

    deactivate(): void {
        document.removeEventListener('keydown', this.handleKeyDown);

        // Önceki focus'a geri dön
        if (this.previousActiveElement instanceof HTMLElement) {
            this.previousActiveElement.focus();
        }
    }

    private handleKeyDown = (e: KeyboardEvent): void => {
        if (e.key !== 'Tab') return;

        this.updateFocusableElements();

        if (e.shiftKey) {
            // Shift + Tab (backwards)
            if (document.activeElement === this.firstFocusable) {
                e.preventDefault();
                this.lastFocusable?.focus();
            }
        } else {
            // Tab (forwards)
            if (document.activeElement === this.lastFocusable) {
                e.preventDefault();
                this.firstFocusable?.focus();
            }
        }
    };
}

/**
 * Keyboard navigation helper
 */
export function setupKeyboardNavigation(
    container: HTMLElement,
    options: {
        onEnter?: (element: HTMLElement) => void;
        onEscape?: () => void;
        onArrowUp?: (element: HTMLElement) => void;
        onArrowDown?: (element: HTMLElement) => void;
    }
): () => void {
    const handleKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;

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
export const aria = {
    setExpanded: (element: HTMLElement, expanded: boolean) => {
        element.setAttribute('aria-expanded', String(expanded));
    },

    setHidden: (element: HTMLElement, hidden: boolean) => {
        element.setAttribute('aria-hidden', String(hidden));
    },

    setLabel: (element: HTMLElement, label: string) => {
        element.setAttribute('aria-label', label);
    },

    setDescribedBy: (element: HTMLElement, id: string) => {
        element.setAttribute('aria-describedby', id);
    },

    setLabelledBy: (element: HTMLElement, id: string) => {
        element.setAttribute('aria-labelledby', id);
    },

    setPressed: (element: HTMLElement, pressed: boolean) => {
        element.setAttribute('aria-pressed', String(pressed));
    },

    setDisabled: (element: HTMLElement, disabled: boolean) => {
        element.setAttribute('aria-disabled', String(disabled));
        if (disabled) {
            element.setAttribute('tabindex', '-1');
        } else {
            element.removeAttribute('tabindex');
        }
    }
};

/**
 * Kullanım Örnekleri:
 * 
 * ```typescript
 * import { announceToScreenReader, FocusTrap, setupKeyboardNavigation, aria } from './a11y-helper';
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
