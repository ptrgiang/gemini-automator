// ==UserScript==
// @name         Gemini Automator
// @namespace    https://github.com/ptrgiang/gemini-automator
// @version      1.3.6
// @description  Batch image generation automation with automatic watermark removal for Gemini AI
// @author       Truong Giang
// @icon         https://www.google.com/s2/favicons?domain=gemini.google.com
// @updateURL    https://raw.githubusercontent.com/ptrgiang/gemini-automator/main/gemini-automator.user.js
// @downloadURL  https://raw.githubusercontent.com/ptrgiang/gemini-automator/main/gemini-automator.user.js
// @require      https://raw.githubusercontent.com/ptrgiang/gemini-automator/main/watermark-data.js
// @match        https://gemini.google.com/*
// @connect      googleusercontent.com
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

(() => {
  'use strict';

  // ============================================
  // WATERMARK REMOVAL ENGINE
  // ============================================

  // Watermark data loaded from external file via @require
  // Access via window.WATERMARK_DATA.BG_48_BASE64 and window.WATERMARK_DATA.BG_96_BASE64

  // Watermark removal constants
  const ALPHA_THRESHOLD = 0.002;
  const MAX_ALPHA = 0.99;
  const LOGO_VALUE = 255;

  /**
   * Calculate alpha map from background capture image
   */
  function calculateAlphaMap(bgCaptureImageData) {
    const { width, height, data } = bgCaptureImageData;
    const alphaMap = new Float32Array(width * height);
    for (let i = 0; i < alphaMap.length; i++) {
      const idx = i * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const maxChannel = Math.max(r, g, b);
      alphaMap[i] = maxChannel / 255;
    }
    return alphaMap;
  }

  /**
   * Remove watermark using alpha map
   */
  function removeWatermark(imageData, alphaMap, position) {
    const { x, y, width, height } = position;
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const imgIdx = ((y + row) * imageData.width + (x + col)) * 4;
        const alphaIdx = row * width + col;
        let alpha = alphaMap[alphaIdx];
        if (alpha < ALPHA_THRESHOLD) continue;
        alpha = Math.min(alpha, MAX_ALPHA);
        const oneMinusAlpha = 1 - alpha;
        for (let c = 0; c < 3; c++) {
          const watermarked = imageData.data[imgIdx + c];
          const original = (watermarked - alpha * LOGO_VALUE) / oneMinusAlpha;
          imageData.data[imgIdx + c] = Math.max(0, Math.min(255, Math.round(original)));
        }
      }
    }
  }

  /**
   * Detect watermark configuration based on image size
   */
  function detectWatermarkConfig(imageWidth, imageHeight) {
    if (imageWidth > 1024 && imageHeight > 1024) {
      return { logoSize: 96, marginRight: 64, marginBottom: 64 };
    }
    return { logoSize: 48, marginRight: 32, marginBottom: 32 };
  }

  /**
   * Calculate watermark position
   */
  function calculateWatermarkPosition(imageWidth, imageHeight, config) {
    const { logoSize, marginRight, marginBottom } = config;
    return {
      x: imageWidth - marginRight - logoSize,
      y: imageHeight - marginBottom - logoSize,
      width: logoSize,
      height: logoSize
    };
  }

  /**
   * Watermark Engine
   */
  class WatermarkEngine {
    constructor(bgCaptures) {
      this.bgCaptures = bgCaptures;
      this.alphaMaps = {};
    }

    static async create() {
      if (!window.WATERMARK_DATA?.BG_48_BASE64 || !window.WATERMARK_DATA?.BG_96_BASE64) {
        console.warn('[Gemini Automator] Watermark removal disabled: BG_48_BASE64 and BG_96_BASE64 not set in watermark-data.js');
        return null;
      }

      const bg48 = new Image();
      const bg96 = new Image();
      await Promise.all([
        new Promise((resolve, reject) => {
          bg48.onload = resolve;
          bg48.onerror = reject;
          bg48.src = window.WATERMARK_DATA.BG_48_BASE64;
        }),
        new Promise((resolve, reject) => {
          bg96.onload = resolve;
          bg96.onerror = reject;
          bg96.src = window.WATERMARK_DATA.BG_96_BASE64;
        })
      ]);
      return new WatermarkEngine({ bg48, bg96 });
    }

    async getAlphaMap(size) {
      if (this.alphaMaps[size]) return this.alphaMaps[size];
      const bgImage = size === 48 ? this.bgCaptures.bg48 : this.bgCaptures.bg96;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bgImage, 0, 0);
      const imageData = ctx.getImageData(0, 0, size, size);
      const alphaMap = calculateAlphaMap(imageData);
      this.alphaMaps[size] = alphaMap;
      return alphaMap;
    }

    async removeWatermarkFromImage(image) {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const config = detectWatermarkConfig(canvas.width, canvas.height);
      const position = calculateWatermarkPosition(canvas.width, canvas.height, config);
      const alphaMap = await this.getAlphaMap(config.logoSize);
      removeWatermark(imageData, alphaMap, position);
      ctx.putImageData(imageData, 0, 0);
      return canvas;
    }
  }

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  const canvasToBlob = (canvas, type = 'image/png') =>
    new Promise(resolve => canvas.toBlob(resolve, type));

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const fetchBlob = (url) => new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      responseType: 'blob',
      onload: (response) => resolve(response.response),
      onerror: reject
    });
  });

  const replaceWithNormalSize = (src) => src.replace(/=s\d+(?=[-?#]|$)/, '=s0');

  // ============================================
  // GEMINI AUTOMATION
  // ============================================

  const SELECTORS = {
    promptTextarea: 'rich-textarea .ql-editor[contenteditable="true"]',
    generateBtn: 'mat-icon[fonticon="send"]',
    stopBtn: 'mat-icon[fonticon="stop"]'
  };

  /**
   * Find tools button
   */
  function findToolsButton() {
    const strategies = [
      () => document.querySelector('toolbox-drawer button'),
      () => Array.from(document.querySelectorAll('button mat-icon')).find(icon =>
        icon.getAttribute('fonticon')?.includes('apps') ||
        icon.getAttribute('fonticon')?.includes('tool')
      )?.closest('button'),
      () => document.querySelector('input-area-v2 .leading-actions-wrapper button')
    ];
    for (const strategy of strategies) {
      const btn = strategy();
      if (btn) return btn;
    }
    return null;
  }

  /**
   * Find model picker button
   */
  function findModelPickerButton() {
    const strategies = [
      () => document.querySelector('bard-mode-switcher button'),
      () => document.querySelector('.trailing-actions-wrapper .model-picker-container button'),
      () => Array.from(document.querySelectorAll('input-area-v2 button mat-icon')).find(icon =>
        icon.getAttribute('fonticon')?.includes('arrow_drop') ||
        icon.getAttribute('fonticon')?.includes('expand')
      )?.closest('button')
    ];
    for (const strategy of strategies) {
      const btn = strategy();
      if (btn) return btn;
    }
    return null;
  }

  /**
   * Find button in dropdown by text
   */
  function findButtonInDropdown(searchText, fallbackIndex = null) {
    const dropdowns = document.querySelectorAll('[role="menu"], [role="listbox"], .mat-menu-panel');
    for (const dropdown of dropdowns) {
      if (dropdown.offsetParent === null) continue;
      const buttons = dropdown.querySelectorAll('button');
      for (const button of buttons) {
        const buttonText = button.textContent?.trim().toLowerCase();
        const searchLower = searchText.toLowerCase();
        const wordBoundaryRegex = new RegExp(`\\b${searchLower}\\b`, 'i');
        if (wordBoundaryRegex.test(buttonText)) {
          return button;
        }
      }
      if (fallbackIndex !== null && buttons[fallbackIndex]) {
        return buttons[fallbackIndex];
      }
    }
    return null;
  }

  /**
   * Setup Gemini (select tool and model)
   */
  async function setupGemini() {
    console.log('[Gemini Automator] Setting up Gemini...');

    // Select "Create image" tool
    const toolsBtn = findToolsButton();
    if (!toolsBtn) throw new Error('Tools button not found');
    toolsBtn.click();
    await sleep(800);

    const createImageOption = findButtonInDropdown('create images', 2) ||
                             findButtonInDropdown('tạo hình ảnh', 2);
    if (!createImageOption) throw new Error('Create Images option not found');

    const isToolSelected = createImageOption.getAttribute('aria-checked') === 'true' ||
                          createImageOption.classList.contains('is-selected');
    if (isToolSelected) {
      toolsBtn.click();
      await sleep(300);
    } else {
      createImageOption.click();
      await sleep(800);
    }

    // Select Pro model
    const modelPickerBtn = findModelPickerButton();
    if (!modelPickerBtn) throw new Error('Model picker not found');
    modelPickerBtn.click();
    await sleep(800);

    const proModelOption = findButtonInDropdown('pro', 2);
    if (!proModelOption) throw new Error('Pro model not found');

    const isModelSelected = proModelOption.getAttribute('aria-checked') === 'true' ||
                           proModelOption.classList.contains('is-selected');
    if (isModelSelected) {
      modelPickerBtn.click();
      await sleep(300);
    } else {
      proModelOption.click();
      await sleep(800);
    }

    console.log('[Gemini Automator] Setup complete');
  }

  /**
   * Fill prompt
   */
  async function fillPrompt(prompt) {
    const textarea = document.querySelector(SELECTORS.promptTextarea);
    if (!textarea) throw new Error('Prompt textarea not found');

    // Clear existing content safely (Trusted Types compliant)
    while (textarea.firstChild) {
      textarea.removeChild(textarea.firstChild);
    }

    textarea.focus();

    // Create paragraph element with text node (Trusted Types compliant)
    const p = document.createElement('p');
    const textNode = document.createTextNode(prompt);
    p.appendChild(textNode);
    textarea.appendChild(p);

    // Trigger events
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    textarea.classList.remove('ql-blank');

    await sleep(500);
  }

  /**
   * Click generate button
   */
  async function clickGenerate() {
    let attempts = 0;
    let sendBtn = null;

    while (attempts < 20) {
      sendBtn = document.querySelector(SELECTORS.generateBtn);
      if (sendBtn && sendBtn.offsetParent !== null) break;
      await sleep(200);
      attempts++;
    }

    if (!sendBtn) throw new Error('Generate button not found');

    const btnElement = sendBtn.closest('button') || sendBtn.parentElement;
    if (btnElement && btnElement.tagName === 'BUTTON') {
      btnElement.click();
    } else {
      sendBtn.click();
    }
    await sleep(1000);
  }

  /**
   * Wait for generation completion
   */
  async function waitForCompletion() {
    const maxWaitTime = 180000; // 3 minutes
    await sleep(3000);

    return new Promise((resolve) => {
      const startTime = Date.now();
      const initialStopBtn = document.querySelector(SELECTORS.stopBtn);

      if (!initialStopBtn || initialStopBtn.offsetParent === null) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        observer.disconnect();
        resolve();
      }, maxWaitTime);

      const observer = new MutationObserver(() => {
        const stopBtn = document.querySelector(SELECTORS.stopBtn);
        if (!stopBtn || stopBtn.offsetParent === null) {
          clearTimeout(timeout);
          observer.disconnect();
          setTimeout(resolve, 2000);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    });
  }

  // ============================================
  // WATERMARK REMOVAL
  // ============================================

  let engine = null;
  const processingQueue = new Set();

  const isValidGeminiImage = (img) =>
    img.closest('generated-image,.generated-image-container') !== null;

  const findGeminiImages = () =>
    [...document.querySelectorAll('img[src*="googleusercontent.com"]')]
      .filter(isValidGeminiImage);

  async function processImage(imgElement) {
    // Skip if watermark removal is disabled
    if (!state.removeWatermark) return;
    if (!engine || processingQueue.has(imgElement)) return;
    if (imgElement.dataset.watermarkProcessed === 'true') return;

    processingQueue.add(imgElement);
    imgElement.dataset.watermarkProcessed = 'processing';
    const originalSrc = imgElement.src;

    try {
      // Store original src for later reprocessing if needed
      imgElement.dataset.originalSrc = originalSrc;
      imgElement.src = '';
      const normalSizeBlob = await fetchBlob(replaceWithNormalSize(originalSrc));
      const normalSizeBlobUrl = URL.createObjectURL(normalSizeBlob);
      const normalSizeImg = await loadImage(normalSizeBlobUrl);
      const processedCanvas = await engine.removeWatermarkFromImage(normalSizeImg);
      const processedBlob = await canvasToBlob(processedCanvas);
      URL.revokeObjectURL(normalSizeBlobUrl);

      const processedBlobUrl = URL.createObjectURL(processedBlob);
      imgElement.src = processedBlobUrl;
      imgElement.dataset.watermarkProcessed = 'true';
      imgElement.dataset.processedBlobUrl = processedBlobUrl;

      // Update any download buttons/links
      updateDownloadLinks(imgElement, processedBlob, processedBlobUrl);

      console.log('[Gemini Automator] Watermark removed');
    } catch (error) {
      console.warn('[Gemini Automator] Failed to remove watermark:', error);
      imgElement.dataset.watermarkProcessed = 'failed';
      imgElement.src = originalSrc;
    } finally {
      processingQueue.delete(imgElement);
    }
  }

  /**
   * Update download buttons/links to use processed image
   */
  function updateDownloadLinks(imgElement, processedBlob, blobUrl) {
    // Find parent container
    let container = imgElement.closest('[data-test-id], .image-container, [class*="image"]');
    if (!container) container = imgElement.parentElement;
    if (!container) return;

    // Find download buttons/links (multiple strategies)
    const downloadElements = [
      ...container.querySelectorAll('a[download]'),
      ...container.querySelectorAll('button[aria-label*="Download"], button[aria-label*="download"]'),
      ...container.querySelectorAll('[role="button"]'),
      ...container.querySelectorAll('mat-icon[fonticon*="download"]')
    ].filter(el => {
      const text = el.textContent?.toLowerCase() || '';
      const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
      const icon = el.querySelector('mat-icon')?.getAttribute('fonticon')?.toLowerCase() || '';
      return text.includes('download') || ariaLabel.includes('download') || icon.includes('download');
    });

    downloadElements.forEach(el => {
      // Store original handler if exists
      if (!el.dataset.originalClick) {
        el.dataset.originalClick = 'true';

        // Override click to download processed image
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          // Create download link
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = `gemini-image-${Date.now()}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          console.log('[Gemini Automator] Downloaded cleaned image');
        }, true);
      }
    });

    // Also intercept right-click "Save image as"
    imgElement.addEventListener('contextmenu', (e) => {
      // The browser will use imgElement.src which we've already updated
      console.log('[Gemini Automator] Right-click save will use cleaned image');
    });
  }

  const processAllImages = () => {
    // Skip if watermark removal is disabled
    if (!state.removeWatermark) return;
    const images = findGeminiImages();
    if (images.length === 0) return;
    console.log(`[Gemini Automator] Found ${images.length} images to process`);
    images.forEach(processImage);
  };

  // ============================================
  // FETCH INTERCEPTION FOR DOWNLOADS
  // ============================================

  /**
   * Process image blob (for fetch interception)
   */
  async function processImageBlob(blob) {
    const blobUrl = URL.createObjectURL(blob);
    const img = await loadImage(blobUrl);
    const canvas = await engine.removeWatermarkFromImage(img);
    URL.revokeObjectURL(blobUrl);
    return canvasToBlob(canvas);
  }

  /**
   * Pattern matches Gemini image URLs including downloads
   * Excludes =s0-d? but includes =s0-d-I?alr=yes and other variants
   */
  const GEMINI_URL_PATTERN = /^https:\/\/lh3\.googleusercontent\.com\/rd-gg(?:-dl)?\/.+=s(?!0-d\?).*/;

  /**
   * Intercept fetch to process downloads
   */
  const { fetch: origFetch } = unsafeWindow;
  unsafeWindow.fetch = async (...args) => {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;

    if (GEMINI_URL_PATTERN.test(url)) {
      console.log('[Gemini Automator] Intercepting:', url);

      // Replace size parameter to get full resolution
      const origUrl = replaceWithNormalSize(url);
      if (typeof args[0] === 'string') {
        args[0] = origUrl;
      } else if (args[0]?.url) {
        args[0].url = origUrl;
      }

      // Fetch original image
      const response = await origFetch(...args);

      // If watermark removal is disabled or engine not ready, return original
      if (!state.removeWatermark || !engine || !response.ok) {
        return response;
      }

      try {
        // Process the image blob
        const processedBlob = await processImageBlob(await response.blob());

        return new Response(processedBlob, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } catch (error) {
        console.warn('[Gemini Automator] Processing failed:', error);
        return response;
      }
    }

    return origFetch(...args);
  };

  // ============================================
  // UI PANEL
  // ============================================

  GM_addStyle(`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    @keyframes shimmer {
      0% { background-position: -1000px 0; }
      100% { background-position: 1000px 0; }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    #gemini-automator-panel {
      position: fixed;
      background: linear-gradient(135deg, rgba(15, 15, 15, 0.98) 0%, rgba(20, 20, 20, 0.98) 100%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      color: #f5f5f5;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      z-index: 999999;
      padding: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      backdrop-filter: blur(24px) saturate(180%);
      box-shadow:
        0 0 0 1px rgba(0, 0, 0, 0.05),
        0 20px 50px rgba(0, 0, 0, 0.6),
        0 10px 20px rgba(0, 0, 0, 0.4);
      min-width: 360px;
      min-height: 440px;
      max-width: 600px;
      max-height: calc(100vh - 40px);
      resize: both;
      animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    #gemini-automator-panel h2 {
      margin: 0;
      padding: 20px 24px;
      font-size: 14px;
      font-weight: 600;
      color: #ffffff;
      letter-spacing: -0.02em;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      background: linear-gradient(135deg, rgba(25, 25, 25, 0.6) 0%, rgba(20, 20, 20, 0.6) 100%);
      cursor: move;
      user-select: none;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      position: relative;
      overflow: hidden;
    }

    #gemini-automator-panel h2::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg,
        transparent 0%,
        rgba(66, 133, 244, 0.1) 50%,
        transparent 100%);
      opacity: 0;
      transition: opacity 0.3s;
    }

    #gemini-automator-panel h2:hover::before {
      opacity: 1;
    }

    #gemini-automator-panel .resize-handle {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 24px;
      height: 24px;
      cursor: nwse-resize;
      background: linear-gradient(135deg, transparent 50%, rgba(255, 255, 255, 0.08) 50%);
      border-bottom-right-radius: 16px;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    #gemini-automator-panel .resize-handle:hover {
      background: linear-gradient(135deg, transparent 50%, rgba(255, 255, 255, 0.15) 50%);
    }

    #gemini-automator-panel > div:first-of-type {
      padding: 20px 24px;
      overflow-y: auto;
      overflow-x: hidden;
      flex: 1;
      min-height: 0;
      background: linear-gradient(135deg, rgba(25, 25, 25, 0.6) 0%, rgba(20, 20, 20, 0.6) 100%);
    }

    #gemini-automator-panel label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 8px;
      letter-spacing: -0.01em;
      line-height: 1.4;
    }

    #gemini-automator-panel textarea {
      width: 100%;
      min-height: 100px;
      max-height: 220px;
      background: rgba(255, 255, 255, 0.03);
      border: 1.5px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      color: #ffffff;
      padding: 14px 16px;
      font-family: 'JetBrains Mono', 'Consolas', monospace;
      font-size: 13px;
      resize: vertical;
      line-height: 1.6;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      box-sizing: border-box;
    }

    #gemini-automator-panel textarea:hover {
      border-color: rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.04);
    }

    #gemini-automator-panel textarea:focus {
      outline: none;
      border-color: rgba(66, 133, 244, 0.6);
      background: rgba(255, 255, 255, 0.05);
      box-shadow:
        0 0 0 3px rgba(66, 133, 244, 0.12),
        0 4px 12px rgba(0, 0, 0, 0.3);
    }

    #gemini-automator-panel textarea::placeholder {
      color: rgba(255, 255, 255, 0.3);
    }

    #gemini-automator-panel input[type="number"] {
      width: 70px;
      min-width: 60px;
      background: rgba(255, 255, 255, 0.04);
      border: 1.5px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      color: #ffffff;
      padding: 10px 12px;
      text-align: center;
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      box-sizing: border-box;
    }

    #gemini-automator-panel input[type="number"]:hover {
      border-color: rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.06);
    }

    #gemini-automator-panel input[type="number"]:focus {
      outline: none;
      border-color: rgba(66, 133, 244, 0.6);
      background: rgba(255, 255, 255, 0.06);
      box-shadow: 0 0 0 3px rgba(66, 133, 244, 0.12);
    }

    #gemini-automator-panel input[type="checkbox"] {
      width: 44px;
      height: 24px;
      appearance: none;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      position: relative;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      border: 1.5px solid rgba(255, 255, 255, 0.08);
    }

    #gemini-automator-panel input[type="checkbox"]:hover {
      background: rgba(255, 255, 255, 0.12);
    }

    #gemini-automator-panel input[type="checkbox"]:checked {
      background: linear-gradient(135deg, #4285f4 0%, #5294ff 100%);
      border-color: rgba(66, 133, 244, 0.4);
      box-shadow: 0 0 0 4px rgba(66, 133, 244, 0.12);
    }

    #gemini-automator-panel input[type="checkbox"]::before {
      content: '';
      position: absolute;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #ffffff;
      top: 2px;
      left: 2px;
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    #gemini-automator-panel input[type="checkbox"]:checked::before {
      left: 22px;
    }

    #gemini-automator-panel button {
      background: linear-gradient(135deg, #4285f4 0%, #5294ff 100%);
      border: none;
      border-radius: 10px;
      color: #ffffff;
      padding: 12px 18px;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
      font-family: 'Inter', sans-serif;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
      letter-spacing: -0.02em;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
      box-shadow:
        0 2px 8px rgba(66, 133, 244, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    #gemini-automator-panel button::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, transparent 100%);
      opacity: 0;
      transition: opacity 0.25s;
    }

    #gemini-automator-panel button:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow:
        0 6px 20px rgba(66, 133, 244, 0.35),
        inset 0 1px 0 rgba(255, 255, 255, 0.15);
    }

    #gemini-automator-panel button:hover:not(:disabled)::before {
      opacity: 1;
    }

    #gemini-automator-panel button:active:not(:disabled) {
      transform: translateY(-1px);
      box-shadow:
        0 3px 12px rgba(66, 133, 244, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    #gemini-automator-panel button:disabled {
      background: rgba(255, 255, 255, 0.05);
      color: rgba(255, 255, 255, 0.3);
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    #gemini-automator-panel button#ga-setup {
      background: rgba(255, 255, 255, 0.04);
      border: 1.5px solid rgba(255, 255, 255, 0.1);
      color: #ffffff;
      box-shadow: none;
    }

    #gemini-automator-panel button#ga-setup:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.15);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    #gemini-automator-panel button#ga-pause {
      background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);
      box-shadow:
        0 2px 8px rgba(245, 158, 11, 0.25),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    #gemini-automator-panel button#ga-pause:hover:not(:disabled) {
      box-shadow:
        0 6px 20px rgba(245, 158, 11, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.15);
    }

    #gemini-automator-panel button#ga-stop {
      background: linear-gradient(135deg, #ef4444 0%, #f87171 100%);
      box-shadow:
        0 2px 8px rgba(239, 68, 68, 0.25),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    #gemini-automator-panel button#ga-stop:hover:not(:disabled) {
      box-shadow:
        0 6px 20px rgba(239, 68, 68, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.15);
    }

    #gemini-automator-panel .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: 14px 0;
      padding: 14px 16px;
      background: rgba(255, 255, 255, 0.03);
      border: 1.5px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      gap: 16px;
      flex-wrap: wrap;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    #gemini-automator-panel .setting-row:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.1);
    }

    #gemini-automator-panel .setting-row label {
      margin: 0;
      color: #ffffff;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: -0.01em;
      flex: 1;
      min-width: 120px;
    }

    #gemini-automator-panel > div:first-of-type > div:first-child {
      margin-bottom: 18px;
    }

    #gemini-automator-panel .status {
      padding: 16px 18px;
      background: rgba(66, 133, 244, 0.08);
      border: 1.5px solid rgba(66, 133, 244, 0.2);
      border-radius: 10px;
      margin-top: 16px;
      font-family: 'JetBrains Mono', monospace;
      word-break: break-word;
      position: relative;
      overflow: hidden;
    }

    #gemini-automator-panel .status::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 3px;
      height: 100%;
      background: linear-gradient(180deg, #4285f4 0%, #5294ff 100%);
    }

    #gemini-automator-panel .progress {
      font-weight: 600;
      color: #ffffff;
      margin-bottom: 8px;
      font-size: 14px;
      letter-spacing: -0.01em;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    #gemini-automator-panel .progress::before {
      content: '';
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #4285f4;
      box-shadow: 0 0 12px rgba(66, 133, 244, 0.8);
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    #gemini-automator-panel .status > div:last-child {
      color: rgba(255, 255, 255, 0.7);
      font-size: 12px;
      line-height: 1.5;
      word-wrap: break-word;
    }

    .toggle-panel {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: linear-gradient(135deg, #4285f4 0%, #5294ff 100%);
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-radius: 50%;
      width: 58px;
      height: 58px;
      cursor: pointer;
      z-index: 999999;
      color: white;
      font-size: 26px;
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow:
        0 8px 24px rgba(66, 133, 244, 0.4),
        0 4px 12px rgba(0, 0, 0, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
      animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .toggle-panel::before {
      content: '';
      position: absolute;
      inset: -2px;
      border-radius: 50%;
      padding: 2px;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.3), transparent);
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      opacity: 0;
      transition: opacity 0.3s;
    }

    .toggle-panel:hover {
      transform: translateY(-4px) scale(1.05);
      box-shadow:
        0 12px 32px rgba(66, 133, 244, 0.5),
        0 6px 16px rgba(0, 0, 0, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.3);
    }

    .toggle-panel:hover::before {
      opacity: 1;
    }

    .toggle-panel:active {
      transform: translateY(-2px) scale(1.02);
      box-shadow:
        0 8px 20px rgba(66, 133, 244, 0.45),
        0 4px 12px rgba(0, 0, 0, 0.35);
    }

    /* Scrollbar styling */
    #gemini-automator-panel > div:first-of-type::-webkit-scrollbar {
      width: 10px;
    }

    #gemini-automator-panel > div:first-of-type::-webkit-scrollbar-track {
      background: transparent;
      margin: 4px;
    }

    #gemini-automator-panel > div:first-of-type::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.12);
      border-radius: 5px;
      border: 2px solid transparent;
      background-clip: padding-box;
      transition: background 0.25s;
    }

    #gemini-automator-panel > div:first-of-type::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.2);
      background-clip: padding-box;
    }

    #gemini-automator-panel > div:first-of-type::-webkit-scrollbar-thumb:active {
      background: rgba(255, 255, 255, 0.25);
      background-clip: padding-box;
    }
  `);

  // ============================================
  // AUTOMATION STATE
  // ============================================

  // Load watermark removal preference from localStorage
  const savedWatermarkPref = localStorage.getItem('gemini-automator-remove-watermark');
  const removeWatermarkDefault = savedWatermarkPref !== null ? savedWatermarkPref === 'true' : true;

  const state = {
    isRunning: false,
    isPaused: false,
    prompts: [],
    currentIndex: 0,
    removeWatermark: removeWatermarkDefault
  };

  /**
   * Create UI Panel
   */
  function createPanel() {
    console.log('[Gemini Automator] Creating UI panel...');

    // Create panel
    const panel = document.createElement('div');
    panel.id = 'gemini-automator-panel';

    // Check if panel was previously hidden
    const wasPanelHidden = localStorage.getItem('gemini-automator-panel-hidden') === 'true';
    panel.style.display = wasPanelHidden ? 'none' : 'flex';

    // Title
    const title = document.createElement('h2');
    title.textContent = '⚡ Gemini Automator';
    title.className = 'panel-header';
    panel.appendChild(title);

    // Resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    panel.appendChild(resizeHandle);

    // Prompts section
    const promptsDiv = document.createElement('div');

    // Label with counter
    const promptsHeader = document.createElement('div');
    promptsHeader.style.display = 'flex';
    promptsHeader.style.justifyContent = 'space-between';
    promptsHeader.style.alignItems = 'center';
    promptsHeader.style.marginBottom = '8px';

    const promptsLabel = document.createElement('label');
    promptsLabel.textContent = 'Prompts (one per line):';
    promptsLabel.style.margin = '0';

    const promptsCounter = document.createElement('span');
    promptsCounter.id = 'ga-prompts-counter';
    promptsCounter.textContent = '0 prompts';
    promptsCounter.style.fontSize = '12px';
    promptsCounter.style.fontWeight = '600';
    promptsCounter.style.color = 'rgba(66, 133, 244, 0.8)';
    promptsCounter.style.padding = '4px 10px';
    promptsCounter.style.background = 'rgba(66, 133, 244, 0.12)';
    promptsCounter.style.borderRadius = '6px';
    promptsCounter.style.fontFamily = "'JetBrains Mono', monospace";

    promptsHeader.appendChild(promptsLabel);
    promptsHeader.appendChild(promptsCounter);

    const promptsTextarea = document.createElement('textarea');
    promptsTextarea.id = 'ga-prompts';
    promptsTextarea.placeholder = 'Enter your prompts here, one per line...\n\nExample:\nA serene mountain landscape at sunset\nA futuristic cyberpunk cityscape\nAbstract geometric patterns with vibrant colors';

    // Update counter on input
    const updateCounter = () => {
      const prompts = promptsTextarea.value.split('\n').filter(p => p.trim());
      const count = prompts.length;
      promptsCounter.textContent = `${count} prompt${count !== 1 ? 's' : ''}`;
    };
    promptsTextarea.addEventListener('input', updateCounter);

    promptsDiv.appendChild(promptsHeader);
    promptsDiv.appendChild(promptsTextarea);
    panel.appendChild(promptsDiv);

    // Delay Settings (Min and Max in one row)
    const delayDiv = document.createElement('div');
    delayDiv.className = 'setting-row';
    delayDiv.style.display = 'grid';
    delayDiv.style.gridTemplateColumns = 'auto 60px auto 60px';
    delayDiv.style.gap = '10px';
    delayDiv.style.alignItems = 'center';

    const minDelayLabel = document.createElement('label');
    minDelayLabel.textContent = 'Min:';
    minDelayLabel.style.margin = '0';
    minDelayLabel.style.fontSize = '13px';
    const minDelayInput = document.createElement('input');
    minDelayInput.type = 'number';
    minDelayInput.id = 'ga-min-delay';
    minDelayInput.value = '10';
    minDelayInput.min = '5';
    minDelayInput.max = '60';

    const maxDelayLabel = document.createElement('label');
    maxDelayLabel.textContent = 'Max:';
    maxDelayLabel.style.margin = '0';
    maxDelayLabel.style.fontSize = '13px';
    const maxDelayInput = document.createElement('input');
    maxDelayInput.type = 'number';
    maxDelayInput.id = 'ga-max-delay';
    maxDelayInput.value = '20';
    maxDelayInput.min = '10';
    maxDelayInput.max = '120';

    delayDiv.appendChild(minDelayLabel);
    delayDiv.appendChild(minDelayInput);
    delayDiv.appendChild(maxDelayLabel);
    delayDiv.appendChild(maxDelayInput);
    panel.appendChild(delayDiv);

    // Remove Watermarks
    const watermarkDiv = document.createElement('div');
    watermarkDiv.className = 'setting-row';
    const watermarkLabel = document.createElement('label');
    watermarkLabel.textContent = 'Remove Watermarks:';
    const watermarkCheckbox = document.createElement('input');
    watermarkCheckbox.type = 'checkbox';
    watermarkCheckbox.id = 'ga-remove-watermark';
    watermarkCheckbox.checked = state.removeWatermark;
    watermarkDiv.appendChild(watermarkLabel);
    watermarkDiv.appendChild(watermarkCheckbox);
    panel.appendChild(watermarkDiv);

    // Buttons (2x2 grid: Setup/Start, Pause/Stop)
    const buttonsDiv = document.createElement('div');
    buttonsDiv.style.display = 'grid';
    buttonsDiv.style.gridTemplateColumns = '1fr 1fr';
    buttonsDiv.style.gap = '10px';
    buttonsDiv.style.margin = '18px 0';

    const setupBtn = document.createElement('button');
    setupBtn.id = 'ga-setup';
    setupBtn.textContent = 'Setup';
    const startBtn = document.createElement('button');
    startBtn.id = 'ga-start';
    startBtn.textContent = 'Start';
    const pauseBtn = document.createElement('button');
    pauseBtn.id = 'ga-pause';
    pauseBtn.textContent = 'Pause';
    pauseBtn.disabled = true;
    const stopBtn = document.createElement('button');
    stopBtn.id = 'ga-stop';
    stopBtn.textContent = 'Stop';
    stopBtn.disabled = true;

    buttonsDiv.appendChild(setupBtn);
    buttonsDiv.appendChild(startBtn);
    buttonsDiv.appendChild(pauseBtn);
    buttonsDiv.appendChild(stopBtn);
    panel.appendChild(buttonsDiv);

    // Status
    const statusDiv = document.createElement('div');
    statusDiv.className = 'status';
    const progressDiv = document.createElement('div');
    progressDiv.className = 'progress';
    progressDiv.id = 'ga-progress';
    progressDiv.textContent = 'Ready';
    const statusText = document.createElement('div');
    statusText.id = 'ga-status';
    statusDiv.appendChild(progressDiv);
    statusDiv.appendChild(statusText);
    panel.appendChild(statusDiv);

    // Toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'toggle-panel';
    toggleBtn.textContent = '⚡';
    toggleBtn.onclick = () => {
      const isVisible = panel.style.display === 'none';
      panel.style.display = isVisible ? 'flex' : 'none';
      localStorage.setItem('gemini-automator-panel-hidden', isVisible ? 'false' : 'true');
      console.log('[Gemini Automator] Panel', isVisible ? 'opened' : 'closed');
    };

    document.body.appendChild(toggleBtn);
    document.body.appendChild(panel);

    console.log('[Gemini Automator] UI created successfully');
    console.log('[Gemini Automator] Panel position:', {
      display: panel.style.display,
      right: panel.style.right,
      bottom: panel.style.bottom,
      width: panel.style.width
    });
    console.log('[Gemini Automator] Toggle button at bottom-right corner (⚡)');

    // Event listeners
    setupBtn.onclick = async () => {
      try {
        updateStatus('Setting up Gemini...');
        await setupGemini();
        updateStatus('Setup complete!');
      } catch (error) {
        updateStatus('Setup failed: ' + error.message);
      }
    };

    startBtn.onclick = startAutomation;
    pauseBtn.onclick = pauseAutomation;
    stopBtn.onclick = stopAutomation;

    watermarkCheckbox.onchange = (e) => {
      const newValue = e.target.checked;
      state.removeWatermark = newValue;
      localStorage.setItem('gemini-automator-remove-watermark', newValue.toString());
      console.log('[Gemini Automator] Watermark removal preference saved. Reloading page...');
      setTimeout(() => location.reload(), 500);
    };

    // Load saved panel position and size
    loadPanelState(panel);

    // Make panel draggable
    makeDraggable(panel, title);

    // Make panel resizable
    makeResizable(panel, resizeHandle);
  }

  /**
   * Load panel position and size from localStorage
   */
  function loadPanelState(panel) {
    const savedState = localStorage.getItem('gemini-automator-panel-state');
    if (savedState) {
      try {
        const state = JSON.parse(savedState);

        // Validate saved position is within viewport
        const isValidPosition = () => {
          if (state.left && state.left !== 'auto') {
            const left = parseInt(state.left);
            return left >= 0 && left < window.innerWidth - 100;
          }
          if (state.right && state.right !== 'auto') {
            const right = parseInt(state.right);
            return right >= 0 && right < window.innerWidth - 100;
          }
          return true;
        };

        if (isValidPosition()) {
          panel.style.left = state.left || 'auto';
          panel.style.top = state.top || 'auto';
          panel.style.right = state.right || '24px';
          panel.style.bottom = state.bottom || '90px';
          panel.style.width = state.width || '360px';
          panel.style.height = state.height || 'auto';
        } else {
          // Reset to default if saved position is invalid
          panel.style.left = 'auto';
          panel.style.top = 'auto';
          panel.style.right = '24px';
          panel.style.bottom = '90px';
          panel.style.width = '360px';
          panel.style.height = 'auto';
        }
      } catch (e) {
        // Use defaults if parse fails
        panel.style.left = 'auto';
        panel.style.top = 'auto';
        panel.style.right = '24px';
        panel.style.bottom = '90px';
        panel.style.width = '360px';
        panel.style.height = 'auto';
      }
    } else {
      // Default position
      panel.style.left = 'auto';
      panel.style.top = 'auto';
      panel.style.right = '24px';
      panel.style.bottom = '90px';
      panel.style.width = '360px';
      panel.style.height = 'auto';
    }
  }

  /**
   * Save panel position and size to localStorage
   */
  function savePanelState(panel) {
    const state = {
      left: panel.style.left,
      top: panel.style.top,
      right: panel.style.right,
      bottom: panel.style.bottom,
      width: panel.style.width,
      height: panel.style.height
    };
    localStorage.setItem('gemini-automator-panel-state', JSON.stringify(state));
  }

  /**
   * Make panel draggable by header
   */
  function makeDraggable(panel, handle) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    handle.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = panel.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      // Clear bottom/right positioning when dragging starts
      panel.style.bottom = 'auto';
      panel.style.right = 'auto';

      document.body.style.cursor = 'move';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      panel.style.left = (startLeft + deltaX) + 'px';
      panel.style.top = (startTop + deltaY) + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.cursor = '';
        savePanelState(panel);
      }
    });
  }

  /**
   * Make panel resizable
   */
  function makeResizable(panel, handle) {
    let isResizing = false;
    let startX, startY, startWidth, startHeight;

    handle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = panel.getBoundingClientRect();
      startWidth = rect.width;
      startHeight = rect.height;

      document.body.style.cursor = 'nwse-resize';
      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      const newWidth = Math.max(320, Math.min(600, startWidth + deltaX));
      const newHeight = Math.max(400, Math.min(window.innerHeight - 40, startHeight + deltaY));

      panel.style.width = newWidth + 'px';
      panel.style.height = newHeight + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        savePanelState(panel);
      }
    });
  }

  function updateStatus(message) {
    document.getElementById('ga-status').textContent = message;
  }

  function updateProgress() {
    const progress = document.getElementById('ga-progress');
    if (state.isRunning) {
      progress.textContent = `Progress: ${state.currentIndex}/${state.prompts.length}`;
    } else {
      progress.textContent = 'Ready';
    }
  }

  /**
   * Start automation
   */
  async function startAutomation() {
    const promptsText = document.getElementById('ga-prompts').value;
    state.prompts = promptsText.split('\n').filter(p => p.trim());

    if (state.prompts.length === 0) {
      updateStatus('Please enter some prompts');
      return;
    }

    state.isRunning = true;
    state.isPaused = false;
    state.currentIndex = 0;

    document.getElementById('ga-start').disabled = true;
    document.getElementById('ga-pause').disabled = false;
    document.getElementById('ga-stop').disabled = false;

    updateStatus('Starting automation...');
    runAutomation();
  }

  /**
   * Run automation loop
   */
  async function runAutomation() {
    while (state.isRunning && state.currentIndex < state.prompts.length) {
      if (state.isPaused) {
        await sleep(1000);
        continue;
      }

      const prompt = state.prompts[state.currentIndex];
      updateProgress();
      updateStatus(`Processing: ${prompt.substring(0, 50)}...`);

      try {
        await fillPrompt(prompt);
        await clickGenerate();
        await waitForCompletion();

        if (state.removeWatermark && engine) {
          await sleep(2000);
          processAllImages();
        }

        state.currentIndex++;
        updateProgress();

        if (state.currentIndex < state.prompts.length) {
          const minDelay = parseInt(document.getElementById('ga-min-delay').value) * 1000;
          const maxDelay = parseInt(document.getElementById('ga-max-delay').value) * 1000;
          const delay = Math.random() * (maxDelay - minDelay) + minDelay;
          updateStatus(`Waiting ${Math.round(delay/1000)}s before next prompt...`);
          await sleep(delay);
        }
      } catch (error) {
        updateStatus('Error: ' + error.message);
        await sleep(3000);
      }
    }

    if (state.isRunning) {
      updateStatus('Automation complete!');
      stopAutomation();
    }
  }

  function pauseAutomation() {
    state.isPaused = !state.isPaused;
    document.getElementById('ga-pause').textContent = state.isPaused ? 'Resume' : 'Pause';
    updateStatus(state.isPaused ? 'Paused' : 'Running...');
  }

  function stopAutomation() {
    state.isRunning = false;
    state.isPaused = false;
    document.getElementById('ga-start').disabled = false;
    document.getElementById('ga-pause').disabled = true;
    document.getElementById('ga-stop').disabled = true;
    updateStatus('Stopped');
    updateProgress();
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  (async function init() {
    console.log('[Gemini Automator] Initializing...');

    // Wait for page to be ready
    const waitForBody = () => new Promise(resolve => {
      if (document.body) {
        resolve();
      } else {
        const observer = new MutationObserver(() => {
          if (document.body) {
            observer.disconnect();
            resolve();
          }
        });
        observer.observe(document.documentElement, { childList: true });
      }
    });

    await waitForBody();
    console.log('[Gemini Automator] DOM ready');

    // Create UI panel first
    try {
      createPanel();
      console.log('[Gemini Automator] UI created - Look for ⚡ button in top-right corner!');
    } catch (error) {
      console.error('[Gemini Automator] Failed to create UI:', error);
    }

    // Initialize watermark engine
    try {
      engine = await WatermarkEngine.create();
      if (engine) {
        console.log('[Gemini Automator] Watermark removal ready');
        new MutationObserver(debounce(processAllImages, 100))
          .observe(document.body, { childList: true, subtree: true });
      } else {
        console.log('[Gemini Automator] Watermark removal disabled (BG_48/96_BASE64 not set)');
      }
    } catch (error) {
      console.warn('[Gemini Automator] Watermark removal error:', error);
    }

    console.log('[Gemini Automator] Ready! Click the ⚡ button to open the panel.');
  })();

})();
