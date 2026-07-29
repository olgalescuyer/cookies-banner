'use strict';

class ConsentManager {
  constructor(config) {
    this._validateConfig(config);
    this.config = config;

    this.config.eventName = this.config.eventName || 'cm_consent_update';
    this.config.debug = this.config.debug === true;

    this.wrapper = null;
    this.prompt = null;
    this.preferences = null;
    this.icon = null;
    this.backdrop = null;
    this.localStorageAvailable = this._checkLocalStorageAvailable();
    this._needsReload = false;
    this._scrollY = 0;

    this.createWrapper();

    if (this.shouldShowBackdrop()) {
      this.createBackdrop();
    }

    this.createCookieIcon();
    this.createModal();

    if (this.shouldShowPrompt()) {
      this.createBanner();
      this.showBackdrop();
    } else {
      this.showCookieIcon();
    }

    this.setupEventListeners();
    this.runConsentCallbacksOnLoad();
  }

  _validateConfig(config) {
    if (!config) {
      throw new Error('Consent Manager: config is required');
    }
    if (!config.consentTypes || !Array.isArray(config.consentTypes)) {
      throw new Error('Consent Manager: config.consentTypes must be an array');
    }
    if (config.consentTypes.length === 0) {
      throw new Error('Consent Manager: config.consentTypes cannot be empty');
    }
  }

  _checkLocalStorageAvailable() {
    try {
      const testKey = '__cm_test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      console.warn(
        'Consent Manager: localStorage is not available. Consent choices will not persist.',
        e,
      );
      return false;
    }
  }

  _getLocalStorageItem(key) {
    if (!this.localStorageAvailable) return null;
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('Consent Manager: Error reading from localStorage', e);
      return null;
    }
  }

  _setLocalStorageItem(key, value) {
    if (!this.localStorageAvailable) return false;
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      console.warn('Consent Manager: Error writing to localStorage', e);
      return false;
    }
  }

  _removeLocalStorageItem(key) {
    if (!this.localStorageAvailable) return false;
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.warn('Consent Manager: Error removing from localStorage', e);
      return false;
    }
  }

  destroy() {
    if (this.wrapper && this.wrapper.parentNode) {
      this.wrapper.parentNode.removeChild(this.wrapper);
    }
    this.allowBodyScroll();
    this.wrapper = null;
    this.prompt = null;
    this.preferences = null;
    this.icon = null;
    this.backdrop = null;
  }

  clearAllConsents() {
    if (!this.localStorageAvailable) return;
    const keysToRemove = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith('cmb_') ||
            key.startsWith('cmc_') ||
            key.startsWith('cm.'))
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => this._removeLocalStorageItem(key));
    } catch (e) {
      // ignore
    }
  }

  // ----------------------------------------------------------------
  // localStorage key builders
  // ----------------------------------------------------------------

  _buildConsentKey(typeId) {
    const ns = this.config.namespace ? `${this.config.namespace}.` : '';
    return `cm.${ns}consent.${typeId}`;
  }

  _buildHasConsentedKey() {
    const ns = this.config.namespace ? `${this.config.namespace}.` : '';
    return `cm.${ns}hasConsented`;
  }

  getConsentChoice(typeId) {
    const key = this._buildConsentKey(typeId);
    const value = this._getLocalStorageItem(key);
    return value === null ? null : value === 'true';
  }

  setConsentChoice(typeId, accepted) {
    const key = this._buildConsentKey(typeId);
    this._setLocalStorageItem(key, accepted.toString());
  }

  getHasConsented() {
    const key = this._buildHasConsentedKey();
    const value = this._getLocalStorageItem(key);
    return value !== null;
  }

  setHasConsented() {
    const key = this._buildHasConsentedKey();
    this._setLocalStorageItem(key, '1');
  }

  // ----------------------------------------------------------------
  // Script Injection
  // ----------------------------------------------------------------

  _injectScript(scriptConfig, consentId) {
    const { url, load, type, crossorigin, integrity } = scriptConfig;
    if (!url) {
      console.warn('Consent Manager: Script URL is required', scriptConfig);
      return;
    }
    const existingScript = document.querySelector(`script[src="${url}"]`);
    if (existingScript) return;

    const script = document.createElement('script');
    script.src = url;
    script.dataset.consentId = consentId;
    if (load === 'async') script.async = true;
    if (load === 'defer') script.defer = true;
    if (type) script.type = type;
    if (crossorigin) script.crossOrigin = crossorigin;
    if (integrity) script.integrity = integrity;
    document.head.appendChild(script);
  }

  _injectConsentScripts(consentType) {
    if (!consentType.scripts || !Array.isArray(consentType.scripts)) return;
    consentType.scripts.forEach((scriptConfig) => {
      this._injectScript(scriptConfig, consentType.id);
    });
  }

  _wasConsentRevoked(consentId, newState) {
    const previousState = this.getConsentChoice(consentId);
    return previousState === true && newState === false;
  }

  // ----------------------------------------------------------------
  // Wrapper
  // ----------------------------------------------------------------

  createWrapper() {
    this.wrapper = document.createElement('div');
    this.wrapper.id = 'cm-wrapper';
    document.body.insertBefore(this.wrapper, document.body.firstChild);
  }

  createWrapperChild(htmlContent, id) {
    const child = document.createElement('div');
    child.id = id;
    child.innerHTML = htmlContent;
    if (!this.wrapper || !document.body.contains(this.wrapper)) {
      this.createWrapper();
    }
    this.wrapper.appendChild(child);
    return child;
  }

  // ----------------------------------------------------------------
  // Backdrop
  // ----------------------------------------------------------------

  createBackdrop() {
    this.backdrop = this.createWrapperChild(null, 'cm-backdrop');
    this.backdrop.addEventListener('click', () => {
      this.nudgePrompt();
    });
  }

  showBackdrop() {
    if (this.backdrop) this.backdrop.style.display = 'block';
    if (typeof this.config.onBackdropOpen === 'function')
      this.config.onBackdropOpen();
  }

  hideBackdrop() {
    if (this.backdrop) this.backdrop.style.display = 'none';
    if (typeof this.config.onBackdropClose === 'function')
      this.config.onBackdropClose();
  }

  shouldShowBackdrop() {
    return this.config?.backdrop?.show || false;
  }

  nudgePrompt() {
    if (!this.prompt) return;
    this.prompt.classList.remove('cm-nudge');
    void this.prompt.offsetWidth;
    this.prompt.classList.add('cm-nudge');
    this.prompt.addEventListener(
      'animationend',
      () => {
        if (this.prompt) this.prompt.classList.remove('cm-nudge');
      },
      { once: true },
    );
  }

  // ----------------------------------------------------------------
  // Checkbox State
  // ----------------------------------------------------------------

  updateCheckboxState(saveToStorage = false) {
    const preferencesSection = this.preferences.querySelector('#cm-form');
    const checkboxes = preferencesSection.querySelectorAll(
      'input[type="checkbox"]',
    );

    checkboxes.forEach((checkbox) => {
      const [, consentId] = checkbox.id.split('consent-');
      const consentType = this.config.consentTypes.find(
        (type) => type.id === consentId,
      );
      if (!consentType) return;

      if (saveToStorage) {
        const currentState = checkbox.checked;
        if (consentType.required) {
          this.setConsentChoice(consentId, true);
        } else {
          const previousValue = this.getConsentChoice(consentId);
          const wasRevoked = this._wasConsentRevoked(consentId, currentState);
          const hadScripts = consentType.scripts?.length > 0;
          this.setConsentChoice(consentId, currentState);
          if (currentState !== previousValue) {
            this.triggerConsentIntegration(consentType, currentState);
            if (currentState && typeof consentType.onAccept === 'function')
              consentType.onAccept();
            else if (
              !currentState &&
              typeof consentType.onReject === 'function'
            )
              consentType.onReject();
          }
          if (wasRevoked && hadScripts) this._needsReload = true;
        }
      } else {
        if (consentType.required) {
          checkbox.checked = true;
          checkbox.disabled = true;
        } else {
          const storedValue = this.getConsentChoice(consentId);
          checkbox.checked =
            storedValue !== null ? storedValue : !!consentType.defaultValue;
        }
      }
    });
  }

  // ----------------------------------------------------------------
  // Consent Integration (gtag)
  // ----------------------------------------------------------------

  triggerConsentIntegration(consentType, accepted) {
    if (!consentType.gtag) return;
    const gtagParams = Array.isArray(consentType.gtag)
      ? consentType.gtag
      : [consentType.gtag];
    if (typeof gtag === 'function') {
      const consentState = accepted ? 'granted' : 'denied';
      const consentUpdate = {};
      gtagParams.forEach((param) => {
        consentUpdate[param] = consentState;
      });
      gtag('consent', 'update', consentUpdate);
    }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: this.config.eventName });
  }

  batchUpdateConsents(consentStates) {
    const changes = [];
    const gtagConsentUpdate = {};
    let hasChanges = false;
    let needsReload = false;

    this.config.consentTypes.forEach((type) => {
      const newState = consentStates[type.id];
      const previousState = this.getConsentChoice(type.id);
      if (newState !== previousState) {
        hasChanges = true;
        changes.push({ type, newState, previousState });
        const wasRevoked = previousState === true && newState === false;
        const hadScripts = type.scripts?.length > 0;
        if (wasRevoked && hadScripts) needsReload = true;
        if (type.gtag) {
          const gtagParams = Array.isArray(type.gtag) ? type.gtag : [type.gtag];
          const consentState = newState ? 'granted' : 'denied';
          gtagParams.forEach((param) => {
            gtagConsentUpdate[param] = consentState;
          });
        }
      }
    });

    if (!hasChanges) return false;

    changes.forEach(({ type, newState }) => {
      this.setConsentChoice(type.id, newState);
    });

    if (
      Object.keys(gtagConsentUpdate).length > 0 &&
      typeof gtag === 'function'
    ) {
      gtag('consent', 'update', gtagConsentUpdate);
      if (this.config.debug)
        console.log(
          '✓ gtag consent updated (from user action):',
          gtagConsentUpdate,
        );
    }

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: this.config.eventName });
    if (this.config.debug)
      console.log(
        '▶ Event Sent: ' + this.config.eventName + ' (from user action)',
      );

    changes.forEach(({ type, newState }) => {
      if (newState) {
        this._injectConsentScripts(type);
        if (typeof type.onAccept === 'function') type.onAccept();
      } else {
        if (typeof type.onReject === 'function') type.onReject();
      }
    });

    if (needsReload) {
      setTimeout(() => {
        window.location.reload();
      }, 100);
    }

    return true;
  }

  // ----------------------------------------------------------------
  // Consent Handling
  // ----------------------------------------------------------------

  handleConsentChoice(accepted) {
    this.setHasConsented();
    this.removeBanner();
    this.hideBackdrop();
    this.toggleModal(false);
    this.showCookieIcon();

    const consentStates = {};
    this.config.consentTypes.forEach((type) => {
      consentStates[type.id] = type.required ? true : accepted;
    });

    this.batchUpdateConsents(consentStates);

    if (accepted && typeof this.config.onAcceptAll === 'function')
      this.config.onAcceptAll();
    else if (!accepted && typeof this.config.onRejectAll === 'function')
      this.config.onRejectAll();

    this.updateCheckboxState();
  }

  getAcceptedConsents() {
    return (this.config.consentTypes || []).reduce((acc, consentType) => {
      acc[consentType.id] = this.getConsentChoice(consentType.id);
      return acc;
    }, {});
  }

  getRejectedConsents() {
    return (this.config.consentTypes || []).reduce((acc, consentType) => {
      const choice = this.getConsentChoice(consentType.id);
      acc[consentType.id] = choice === false;
      return acc;
    }, {});
  }

  runConsentCallbacksOnLoad() {
    if (!this.config.consentTypes) return;

    const gtagConsentUpdate = {};
    let hasGtagUpdates = false;
    let isFirstConsentLoad = false;

    const acceptedConsents = this.getAcceptedConsents();
    const rejectedConsents = this.getRejectedConsents();

    this.config.consentTypes.forEach((type) => {
      if (type.required) {
        const currentValue = this.getConsentChoice(type.id);
        if (currentValue === null) {
          this.setConsentChoice(type.id, true);
          isFirstConsentLoad = true;
        }
        this._injectConsentScripts(type);
        if (type.gtag) {
          hasGtagUpdates = true;
          const gtagParams = Array.isArray(type.gtag) ? type.gtag : [type.gtag];
          gtagParams.forEach((param) => {
            gtagConsentUpdate[param] = 'granted';
          });
        }
        if (typeof type.onAccept === 'function') type.onAccept();
        return;
      }

      if (acceptedConsents[type.id]) {
        this._injectConsentScripts(type);
        if (type.gtag) {
          hasGtagUpdates = true;
          const gtagParams = Array.isArray(type.gtag) ? type.gtag : [type.gtag];
          gtagParams.forEach((param) => {
            gtagConsentUpdate[param] = 'granted';
          });
        }
        if (typeof type.onAccept === 'function') type.onAccept();
      } else if (rejectedConsents[type.id]) {
        if (type.gtag) {
          hasGtagUpdates = true;
          const gtagParams = Array.isArray(type.gtag) ? type.gtag : [type.gtag];
          gtagParams.forEach((param) => {
            gtagConsentUpdate[param] = 'denied';
          });
        }
        if (typeof type.onReject === 'function') type.onReject();
      }
    });

    if (hasGtagUpdates && typeof gtag === 'function') {
      gtag('consent', 'update', gtagConsentUpdate);
      if (this.config.debug)
        console.log(
          '✓ gtag consent updated (on page load):',
          gtagConsentUpdate,
        );
    }

    const hasGrantedConsents = Object.values(gtagConsentUpdate).some(
      (value) => value === 'granted',
    );
    if (hasGtagUpdates && hasGrantedConsents) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: this.config.eventName });
      if (this.config.debug) {
        const eventContext = isFirstConsentLoad
          ? 'from first page load'
          : 'from return visit';
        console.log(
          '▶ Event Sent: ' + this.config.eventName + ' (' + eventContext + ')',
        );
      }
    }
  }

  // ----------------------------------------------------------------
  // Banner
  // ----------------------------------------------------------------

  getBannerContent() {
    const bannerDescription =
      this.config.text?.prompt?.description ||
      '<p>We use cookies on our site to enhance your user experience, provide personalized content, and analyze our traffic.</p>';

    const acceptAllButtonText =
      this.config.text?.prompt?.acceptAllButtonText || 'Accept all';
    const acceptAllButtonLabel =
      this.config.text?.prompt?.acceptAllButtonAccessibleLabel;
    const acceptAllButton = `<button class="cm-accept-all cm-button cm-button-primary"${
      acceptAllButtonLabel && acceptAllButtonLabel !== acceptAllButtonText
        ? ` aria-label="${acceptAllButtonLabel}"`
        : ''
    }>${acceptAllButtonText}</button>`;

    const rejectNonEssentialButtonText =
      this.config.text?.prompt?.rejectNonEssentialButtonText ||
      'Reject non-essential';
    const rejectNonEssentialButtonLabel =
      this.config.text?.prompt?.rejectNonEssentialButtonAccessibleLabel;
    const rejectNonEssentialButton = `<button class="cm-reject-all cm-button cm-button-primary"${
      rejectNonEssentialButtonLabel &&
      rejectNonEssentialButtonLabel !== rejectNonEssentialButtonText
        ? ` aria-label="${rejectNonEssentialButtonLabel}"`
        : ''
    }>${rejectNonEssentialButtonText}</button>`;

    const preferencesButtonText =
      this.config.text?.prompt?.preferencesButtonText || 'Preferences';
    const preferencesButtonLabel =
      this.config.text?.prompt?.preferencesButtonAccessibleLabel;
    const preferencesButton = `<button class="cm-preferences-button"${
      preferencesButtonLabel && preferencesButtonLabel !== preferencesButtonText
        ? ` aria-label="${preferencesButtonLabel}"`
        : ''
    }><span>${preferencesButtonText}</span></button>`;

    return `
      ${bannerDescription}
      <div class="cm-actions">
        ${acceptAllButton}
        ${rejectNonEssentialButton}
        <div class="cm-actions-row">
          ${preferencesButton}
        </div>
      </div>
    `;
  }

  hasConsented() {
    return this.getHasConsented();
  }

  createBanner() {
    this.prompt = this.createWrapperChild(this.getBannerContent(), 'cm-banner');

    if (this.prompt && this.config.prompt?.position) {
      const positionMap = {
        center: 'cm-pos-center',
        bottomLeft: 'cm-pos-bottom-left',
        bottomCenter: 'cm-pos-bottom-center',
        bottomRight: 'cm-pos-bottom-right',
      };
      const mappedPosition =
        positionMap[this.config.prompt.position] || this.config.prompt.position;
      this.prompt.classList.add(mappedPosition);
    }

    this.prompt.addEventListener(
      'animationend',
      () => {
        if (this.prompt) this.prompt.classList.add('cm-loaded');
      },
      { once: true },
    );

    if (this.prompt && typeof this.config.onPromptOpen === 'function')
      this.config.onPromptOpen();
  }

  removeBanner() {
    if (this.prompt && this.prompt.parentNode) {
      this.prompt.parentNode.removeChild(this.prompt);
      this.prompt = null;
      if (typeof this.config.onPromptClose === 'function')
        this.config.onPromptClose();
    }
  }

  shouldShowPrompt() {
    if (this.config.autoShow === false) return false;
    return !this.getHasConsented();
  }

  // ----------------------------------------------------------------
  // Modal
  // ----------------------------------------------------------------

  getModalContent() {
    const preferencesTitle =
      this.config.text?.preferences?.title ||
      'Customize your cookie preferences';
    const preferencesDescription =
      this.config.text?.preferences?.description ||
      '<p>We respect your right to privacy. You can choose not to allow some types of cookies. Your cookie preferences will apply across our website.</p>';

    const preferencesButtonLabel =
      this.config.text?.prompt?.preferencesButtonAccessibleLabel;
    const closeModalButton = `<button class="cm-modal-close"${preferencesButtonLabel ? ` aria-label="${preferencesButtonLabel}"` : ''}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M19.4081 3.41559C20.189 2.6347 20.189 1.36655 19.4081 0.585663C18.6272 -0.195221 17.3591 -0.195221 16.5782 0.585663L10 7.17008L3.41559 0.59191C2.6347 -0.188974 1.36655 -0.188974 0.585663 0.59191C-0.195221 1.37279 -0.195221 2.64095 0.585663 3.42183L7.17008 10L0.59191 16.5844C-0.188974 17.3653 -0.188974 18.6335 0.59191 19.4143C1.37279 20.1952 2.64095 20.1952 3.42183 19.4143L10 12.8299L16.5844 19.4081C17.3653 20.189 18.6335 20.189 19.4143 19.4081C20.1952 18.6272 20.1952 17.3591 19.4143 16.5782L12.8299 10L19.4081 3.41559Z"/>
      </svg>
    </button>`;

    const consentTypes = this.config.consentTypes || [];
    const acceptedConsentMap = this.getAcceptedConsents();

    const saveButtonText =
      this.config.text?.preferences?.saveButtonText || 'Save and close';
    const saveButtonLabel =
      this.config.text?.preferences?.saveButtonAccessibleLabel;
    const saveButton = `<button class="cm-modal-save cm-button cm-button-primary"${
      saveButtonLabel && saveButtonLabel !== saveButtonText
        ? ` aria-label="${saveButtonLabel}"`
        : ''
    }>${saveButtonText}</button>`;

    const rejectNonEssentialButtonText =
      this.config.text?.prompt?.rejectNonEssentialButtonText ||
      'Reject non-essential';
    const rejectNonEssentialButtonLabel =
      this.config.text?.prompt?.rejectNonEssentialButtonAccessibleLabel;
    const rejectNonEssentialButton = `<button class="cm-modal-reject-all cm-button cm-button-primary"${
      rejectNonEssentialButtonLabel &&
      rejectNonEssentialButtonLabel !== rejectNonEssentialButtonText
        ? ` aria-label="${rejectNonEssentialButtonLabel}"`
        : ''
    }>${rejectNonEssentialButtonText}</button>`;

    return `
      <header>
        <h1>${preferencesTitle}</h1>
        ${closeModalButton}
      </header>
      ${preferencesDescription}
      <section id="cm-form">
        ${consentTypes
          .map((type) => {
            const accepted = acceptedConsentMap[type.id];
            let isChecked = false;
            if (accepted) isChecked = true;
            if (!accepted && !this.hasConsented())
              isChecked = type.defaultValue;

            return `
            <fieldset>
              <legend>${type.label}</legend>
              <div class="cm-consent-row">
                <div class="cm-consent-description">${type.description}</div>
                <label class="cm-toggle" for="consent-${type.id}">
                  <input type="checkbox" id="consent-${type.id}" ${
                    type.required
                      ? 'checked disabled'
                      : isChecked
                        ? 'checked'
                        : ''
                  } />
                  <span class="cm-toggle-track" aria-hidden="true"></span>
                  <span class="cm-toggle-thumb" aria-hidden="true"></span>
                  <span class="cm-toggle-off" aria-hidden="true">Off</span>
                  <span class="cm-toggle-on" aria-hidden="true">On</span>
                </label>
              </div>
            </fieldset>
          `;
          })
          .join('')}
      </section>
      <footer>
        ${saveButton}
        ${rejectNonEssentialButton}
        ${this.config.policyUrl ? `<a class="cm-policy-link" href="${this.config.policyUrl}" target="_blank" rel="noreferrer">${this.config.text?.preferences?.policyLinkText || 'Privacy policy'}</a>` : ''}        
      </footer>
    `;
  }

  createModal() {
    this.preferences = this.createWrapperChild(
      this.getModalContent(),
      'cm-modal',
    );
  }

  toggleModal(show) {
    if (!this.preferences) return;
    this.preferences.style.display = show ? 'flex' : 'none';

    if (show) {
      this.showBackdrop();
      this.hideCookieIcon();
      this.removeBanner();
      this.preventBodyScroll();
      const modalCloseButton =
        this.preferences.querySelector('.cm-modal-close');
      modalCloseButton.focus();
      if (typeof this.config.onPreferencesOpen === 'function')
        this.config.onPreferencesOpen();
      this.updateCheckboxState(false);
    } else {
      this.hideBackdrop();
      this.showCookieIcon();
      this.allowBodyScroll();
      if (typeof this.config.onPreferencesClose === 'function')
        this.config.onPreferencesClose();
    }
  }

  // ----------------------------------------------------------------
  // Cookie Icon
  // ----------------------------------------------------------------

  getCookieIconContent() {
    return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="none"/><path d="M208,40H48A16,16,0,0,0,32,56v56c0,52.72,25.52,84.67,46.93,102.19,23.06,18.86,46,25.26,47,25.53a8,8,0,0,0,4.2,0c1-.27,23.91-6.67,47-25.53C198.48,196.67,224,164.72,224,112V56A16,16,0,0,0,208,40Zm-34.32,69.66-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z"/></svg>
    `;
  }

  createCookieIcon() {
    this.icon = document.createElement('button');
    this.icon.id = 'cm-icon';
    this.icon.title = 'Manage your consent preferences for this site';
    this.icon.innerHTML = this.getCookieIconContent();

    if (this.config.text?.prompt?.preferencesButtonAccessibleLabel) {
      this.icon.ariaLabel =
        this.config.text?.prompt?.preferencesButtonAccessibleLabel;
    }

    if (!this.wrapper || !document.body.contains(this.wrapper))
      this.createWrapper();
    this.wrapper.appendChild(this.icon);

    if (this.icon && this.config.icon?.position) {
      const positionMap = {
        bottomRight: 'cm-pos-bottom-right',
        bottomLeft: 'cm-pos-bottom-left',
      };
      const mappedPosition =
        positionMap[this.config.icon.position] || this.config.icon.position;
      this.icon.classList.add(mappedPosition);
    }

    if (this.icon && this.config.icon?.colorScheme) {
      this.icon.classList.add(this.config.icon.colorScheme);
    }
  }

  showCookieIcon() {
    if (this.icon) this.icon.style.display = 'flex';
  }

  hideCookieIcon() {
    if (this.icon) this.icon.style.display = 'none';
  }

  handleDefaultConsent() {
    this.config.consentTypes.forEach((type) => {
      let accepted = true;
      if (type.required || type.defaultValue) {
        this.setConsentChoice(type.id, true);
      } else {
        accepted = false;
        this.setConsentChoice(type.id, false);
      }
      if (accepted) {
        if (typeof type.onAccept === 'function') type.onAccept();
      } else {
        if (typeof type.onReject === 'function') type.onReject();
      }
      this.setHasConsented();
      this.updateCheckboxState();
    });
  }

  // ----------------------------------------------------------------
  // Focus & Events
  // ----------------------------------------------------------------

  getFocusableElements(element) {
    return element.querySelectorAll(
      'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
  }

  setupEventListeners() {
    if (this.prompt) {
      const acceptButton = this.prompt.querySelector('.cm-accept-all');
      const rejectButton = this.prompt.querySelector('.cm-reject-all');
      const preferencesButton = this.prompt.querySelector(
        '.cm-preferences-button',
      );

      acceptButton?.addEventListener('click', () =>
        this.handleConsentChoice(true),
      );
      rejectButton?.addEventListener('click', () =>
        this.handleConsentChoice(false),
      );
      preferencesButton?.addEventListener('click', () => {
        this.showBackdrop();
        this.toggleModal(true);
      });

      const focusableElements = this.getFocusableElements(this.prompt);
      const firstFocusableEl = focusableElements[0];
      const lastFocusableEl = focusableElements[focusableElements.length - 1];

      this.prompt.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          if (e.shiftKey) {
            if (document.activeElement === firstFocusableEl) {
              lastFocusableEl.focus();
              e.preventDefault();
            }
          } else {
            if (document.activeElement === lastFocusableEl) {
              firstFocusableEl.focus();
              e.preventDefault();
            }
          }
        }
      });

      if (this.config.mode !== 'wizard') acceptButton?.focus();
    }

    if (this.preferences) {
      const closeButton = this.preferences.querySelector('.cm-modal-close');
      const saveButton = this.preferences.querySelector('.cm-modal-save');
      const rejectAllButton = this.preferences.querySelector(
        '.cm-modal-reject-all',
      );

      closeButton?.addEventListener('click', () => {
        this.toggleModal(false);
        this.hideBackdrop();
      });

      saveButton?.addEventListener('click', () => {
        this.setHasConsented();
        const preferencesSection = this.preferences.querySelector('#cm-form');
        const checkboxes = preferencesSection.querySelectorAll(
          'input[type="checkbox"]',
        );
        const consentStates = {};
        checkboxes.forEach((checkbox) => {
          const [, consentId] = checkbox.id.split('consent-');
          consentStates[consentId] = checkbox.checked;
        });
        this.batchUpdateConsents(consentStates);
        this.toggleModal(false);
        this.hideBackdrop();
        this.removeBanner();
        this.showCookieIcon();
      });

      rejectAllButton?.addEventListener('click', () => {
        this.setHasConsented();
        const preferencesSection = this.preferences.querySelector('#cm-form');
        const checkboxes = preferencesSection.querySelectorAll(
          'input[type="checkbox"]',
        );
        checkboxes.forEach((checkbox) => {
          const [, consentId] = checkbox.id.split('consent-');
          const consentType = this.config.consentTypes.find(
            (type) => type.id === consentId,
          );
          if (consentType && !consentType.required) checkbox.checked = false;
        });
        const consentStates = {};
        this.config.consentTypes.forEach((type) => {
          consentStates[type.id] = type.required ? true : false;
        });
        this.batchUpdateConsents(consentStates);
        this.toggleModal(false);
        this.hideBackdrop();
        this.removeBanner();
        this.showCookieIcon();
      });

      const focusableElements = this.getFocusableElements(this.preferences);
      const firstFocusableEl = focusableElements[0];
      const lastFocusableEl = focusableElements[focusableElements.length - 1];

      this.preferences.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          if (e.shiftKey) {
            if (document.activeElement === firstFocusableEl) {
              lastFocusableEl.focus();
              e.preventDefault();
            }
          } else {
            if (document.activeElement === lastFocusableEl) {
              firstFocusableEl.focus();
              e.preventDefault();
            }
          }
        }
        if (e.key === 'Escape') this.toggleModal(false);
      });

      closeButton?.focus();
    }

    if (this.icon) {
      this.icon.addEventListener('click', () => {
        if (!this.preferences) {
          this.createModal();
          this.toggleModal(true);
          this.hideCookieIcon();
        } else if (
          this.preferences.style.display === 'none' ||
          this.preferences.style.display === ''
        ) {
          this.toggleModal(true);
          this.hideCookieIcon();
        } else {
          this.toggleModal(false);
        }
      });
    }
  }

  preventBodyScroll() {
    this._scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${this._scrollY}px`;
    document.body.style.width = '100%';
  }

  allowBodyScroll() {
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo(0, this._scrollY || 0);
  }
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------
(function () {
  window.consentManager = {};

  let instance;

  function init(config = {}) {
    const create = () => {
      if (instance) {
        instance.destroy();
        instance = null;
      }
      instance = new ConsentManager(config);
    };
    if (document.body) {
      create();
    } else {
      document.addEventListener('DOMContentLoaded', create, { once: true });
    }
  }

  function update(newConfig = {}) {
    if (!instance) {
      console.error(
        'Consent Manager: Cannot update - no instance initialized. Call init() first.',
      );
      return;
    }
    function deepMerge(target, source) {
      const output = { ...target };
      for (const key in source) {
        if (
          source[key] &&
          typeof source[key] === 'object' &&
          !Array.isArray(source[key])
        ) {
          output[key] = deepMerge(target[key] || {}, source[key]);
        } else {
          output[key] = source[key];
        }
      }
      return output;
    }
    const mergedConfig = deepMerge(instance.config, newConfig);
    init(mergedConfig);
  }

  function resetConsent() {
    if (!instance) {
      console.error('Consent Manager: Cannot reset - no instance initialized.');
      return;
    }
    instance.clearAllConsents();
    init(instance.config);
  }

  function getInstance() {
    return instance;
  }

  window.consentManager.init = init;
  window.consentManager.update = update;
  window.consentManager.getInstance = getInstance;
  window.consentManager.resetConsent = resetConsent;
})();
