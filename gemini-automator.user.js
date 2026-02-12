// ==UserScript==
// @name         Gemini Automator with Watermark Remover
// @namespace    https://github.com/gemini-automator
// @version      1.2.3
// @description  Batch image generation automation + automatic watermark removal for Gemini AI
// @author       Truong Giang
// @icon         https://www.google.com/s2/favicons?domain=gemini.google.com
// @updateURL    https://raw.githubusercontent.com/ptrgiang/gemini-automator/main/gemini-automator.user.js
// @downloadURL  https://raw.githubusercontent.com/ptrgiang/gemini-automator/main/gemini-automator.user.js
// @require      https://raw.githubusercontent.com/ptrgiang/gemini-automator/main/watermark-data.js
// @match        https://gemini.google.com/*
// @connect      googleusercontent.com
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
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
   * Matches: https://lh3.googleusercontent.com/rd-gg[-dl]/...=s[any size]
   */
  const GEMINI_URL_PATTERN = /^https:\/\/lh3\.googleusercontent\.com\/rd-gg(-dl)?\/.*=s\d+/;

  /**
   * Intercept fetch to process downloads
   */
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;

    // Check if this is a Gemini image URL
    if (url && GEMINI_URL_PATTERN.test(url)) {
      console.log('[Gemini Automator] Intercepting fetch:', url);

      // Replace size parameter to get full resolution
      const fullSizeUrl = replaceWithNormalSize(url);
      if (typeof args[0] === 'string') {
        args[0] = fullSizeUrl;
      } else if (args[0]?.url) {
        args[0].url = fullSizeUrl;
      }

      // Fetch original image
      const response = await originalFetch(...args);

      // If watermark removal is disabled or engine not ready, return original
      if (!state.removeWatermark || !engine || !response.ok) {
        return response;
      }

      try {
        // Process the image blob
        const originalBlob = await response.blob();
        const processedBlob = await processImageBlob(originalBlob);

        console.log('[Gemini Automator] Fetch processed successfully');

        // Return new response with processed blob
        return new Response(processedBlob, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } catch (error) {
        console.warn('[Gemini Automator] Fetch processing failed:', error);
        return response;
      }
    }

    // Not a Gemini image, pass through
    return originalFetch(...args);
  };

  // ============================================
  // UI PANEL
  // ============================================

  GM_addStyle(`
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Manrope:wght@400;500;600;700&display=swap');

    #gemini-automator-panel {
      position: fixed;
      background: #0f0f0f;
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      color: #f5f5f5;
      font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
      z-index: 999999;
      padding: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      backdrop-filter: blur(20px);
      min-width: 320px;
      min-height: 400px;
      max-width: 600px;
      max-height: calc(100vh - 40px);
      resize: both;
    }

    #gemini-automator-panel h2 {
      margin: 0;
      padding: 16px 20px;
      font-size: 11px;
      font-weight: 600;
      color: #f5f5f5;
      letter-spacing: 0.1em;
      border-bottom: 1px solid #2a2a2a;
      background: #151515;
      font-family: 'IBM Plex Mono', monospace;
      text-transform: uppercase;
      cursor: move;
      user-select: none;
      flex-shrink: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #gemini-automator-panel .resize-handle {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 20px;
      height: 20px;
      cursor: nwse-resize;
      background: linear-gradient(135deg, transparent 50%, #2a2a2a 50%);
      border-bottom-right-radius: 12px;
    }

    #gemini-automator-panel .resize-handle:hover {
      background: linear-gradient(135deg, transparent 50%, #3a3a3a 50%);
    }

    #gemini-automator-panel > div:first-of-type {
      padding: 16px;
      overflow-y: auto;
      overflow-x: hidden;
      flex: 1;
      min-height: 0;
    }

    #gemini-automator-panel label {
      display: block;
      font-size: 10px;
      font-weight: 500;
      color: #a0a0a0;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      line-height: 1.3;
    }

    #gemini-automator-panel textarea {
      width: 100%;
      min-height: 80px;
      max-height: 200px;
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      border-radius: 8px;
      color: #f5f5f5;
      padding: 12px;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 12px;
      resize: vertical;
      line-height: 1.5;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      box-sizing: border-box;
    }

    #gemini-automator-panel textarea:focus {
      outline: none;
      border-color: #4285f4;
      background: #1f1f1f;
      box-shadow: 0 0 0 3px rgba(66, 133, 244, 0.1);
    }

    #gemini-automator-panel textarea::placeholder {
      color: #555;
      opacity: 1;
    }

    #gemini-automator-panel input[type="number"] {
      width: 60px;
      min-width: 50px;
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      border-radius: 6px;
      color: #f5f5f5;
      padding: 8px 10px;
      text-align: center;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      box-sizing: border-box;
    }

    #gemini-automator-panel input[type="number"]:focus {
      outline: none;
      border-color: #4285f4;
      background: #1f1f1f;
      box-shadow: 0 0 0 3px rgba(66, 133, 244, 0.1);
    }

    #gemini-automator-panel input[type="checkbox"] {
      width: 40px;
      height: 22px;
      appearance: none;
      background: #2a2a2a;
      border-radius: 11px;
      position: relative;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      border: none;
    }

    #gemini-automator-panel input[type="checkbox"]:checked {
      background: #4285f4;
    }

    #gemini-automator-panel input[type="checkbox"]::before {
      content: '';
      position: absolute;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #f5f5f5;
      top: 2px;
      left: 2px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }

    #gemini-automator-panel input[type="checkbox"]:checked::before {
      left: 20px;
    }

    #gemini-automator-panel button {
      background: #4285f4;
      border: none;
      border-radius: 6px;
      color: #ffffff;
      padding: 10px 14px;
      cursor: pointer;
      font-weight: 600;
      font-size: 12px;
      font-family: 'Manrope', sans-serif;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
      letter-spacing: -0.01em;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
    }

    #gemini-automator-panel button:hover:not(:disabled) {
      background: #5294f5;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(66, 133, 244, 0.3);
    }

    #gemini-automator-panel button:active:not(:disabled) {
      transform: translateY(0);
      box-shadow: 0 2px 4px rgba(66, 133, 244, 0.2);
    }

    #gemini-automator-panel button:disabled {
      background: #2a2a2a;
      color: #666;
      cursor: not-allowed;
      transform: none;
    }

    #gemini-automator-panel button#ga-setup {
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      color: #f5f5f5;
    }

    #gemini-automator-panel button#ga-setup:hover:not(:disabled) {
      background: #242424;
      border-color: #3a3a3a;
      box-shadow: none;
    }

    #gemini-automator-panel button#ga-pause {
      background: #f59e0b;
    }

    #gemini-automator-panel button#ga-pause:hover:not(:disabled) {
      background: #fbbf24;
    }

    #gemini-automator-panel button#ga-stop {
      background: #ef4444;
    }

    #gemini-automator-panel button#ga-stop:hover:not(:disabled) {
      background: #f87171;
    }

    #gemini-automator-panel .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: 12px 0;
      padding: 12px;
      background: #151515;
      border: 1px solid #2a2a2a;
      border-radius: 6px;
      gap: 12px;
      flex-wrap: wrap;
    }

    #gemini-automator-panel .setting-row label {
      margin: 0;
      color: #f5f5f5;
      font-size: 12px;
      font-weight: 500;
      text-transform: none;
      letter-spacing: -0.01em;
      flex: 1;
      min-width: 100px;
    }

    #gemini-automator-panel > div:first-of-type > div:first-child {
      margin-bottom: 12px;
    }

    #gemini-automator-panel > div:first-of-type > div:nth-child(4) {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 6px;
      margin: 12px 0;
    }

    #gemini-automator-panel > div:first-of-type > div:nth-child(4) button {
      margin: 0;
    }

    #gemini-automator-panel .status {
      padding: 12px;
      background: #151515;
      border: 1px solid #2a2a2a;
      border-radius: 6px;
      font-size: 11px;
      margin-top: 12px;
      font-family: 'IBM Plex Mono', monospace;
      word-break: break-word;
    }

    #gemini-automator-panel .progress {
      font-weight: 600;
      color: #4285f4;
      margin-bottom: 6px;
      font-size: 12px;
      letter-spacing: 0.05em;
    }

    #gemini-automator-panel .status > div:last-child {
      color: #a0a0a0;
      font-size: 10px;
      line-height: 1.4;
      word-wrap: break-word;
    }

    .toggle-panel {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #000000;
      border: 1px solid #2a2a2a;
      border-radius: 50%;
      width: 52px;
      height: 52px;
      cursor: pointer;
      z-index: 999999;
      color: white;
      font-size: 24px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
    }

    .toggle-panel:hover {
      background: #1a1a1a;
      border-color: #3a3a3a;
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.8);
    }

    .toggle-panel:active {
      transform: translateY(0);
    }

    /* Scrollbar styling */
    #gemini-automator-panel > div:first-of-type::-webkit-scrollbar {
      width: 8px;
    }

    #gemini-automator-panel > div:first-of-type::-webkit-scrollbar-track {
      background: transparent;
    }

    #gemini-automator-panel > div:first-of-type::-webkit-scrollbar-thumb {
      background: #2a2a2a;
      border-radius: 4px;
    }

    #gemini-automator-panel > div:first-of-type::-webkit-scrollbar-thumb:hover {
      background: #3a3a3a;
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
    panel.style.display = 'block';

    // Title
    const title = document.createElement('h2');
    title.textContent = '✨ Gemini Automator';
    title.className = 'panel-header';
    panel.appendChild(title);

    // Resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    panel.appendChild(resizeHandle);

    // Prompts section
    const promptsDiv = document.createElement('div');
    const promptsLabel = document.createElement('label');
    promptsLabel.textContent = 'Prompts (one per line):';
    const promptsTextarea = document.createElement('textarea');
    promptsTextarea.id = 'ga-prompts';
    promptsTextarea.placeholder = 'A serene mountain landscape\nA futuristic cityscape\nAbstract geometric patterns';
    promptsDiv.appendChild(promptsLabel);
    promptsDiv.appendChild(promptsTextarea);
    panel.appendChild(promptsDiv);

    // Min Delay
    const minDelayDiv = document.createElement('div');
    minDelayDiv.className = 'setting-row';
    const minDelayLabel = document.createElement('label');
    minDelayLabel.textContent = 'Min Delay (sec):';
    const minDelayInput = document.createElement('input');
    minDelayInput.type = 'number';
    minDelayInput.id = 'ga-min-delay';
    minDelayInput.value = '10';
    minDelayInput.min = '5';
    minDelayInput.max = '60';
    minDelayDiv.appendChild(minDelayLabel);
    minDelayDiv.appendChild(minDelayInput);
    panel.appendChild(minDelayDiv);

    // Max Delay
    const maxDelayDiv = document.createElement('div');
    maxDelayDiv.className = 'setting-row';
    const maxDelayLabel = document.createElement('label');
    maxDelayLabel.textContent = 'Max Delay (sec):';
    const maxDelayInput = document.createElement('input');
    maxDelayInput.type = 'number';
    maxDelayInput.id = 'ga-max-delay';
    maxDelayInput.value = '20';
    maxDelayInput.min = '10';
    maxDelayInput.max = '120';
    maxDelayDiv.appendChild(maxDelayLabel);
    maxDelayDiv.appendChild(maxDelayInput);
    panel.appendChild(maxDelayDiv);

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

    // Buttons
    const buttonsDiv = document.createElement('div');
    const setupBtn = document.createElement('button');
    setupBtn.id = 'ga-setup';
    setupBtn.textContent = 'Setup Gemini';
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
      panel.style.display = isVisible ? 'block' : 'none';
      console.log('[Gemini Automator] Panel', isVisible ? 'opened' : 'closed');
    };

    document.body.appendChild(toggleBtn);
    document.body.appendChild(panel);

    console.log('[Gemini Automator] Toggle button added to page');

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
        panel.style.left = state.left || 'auto';
        panel.style.top = state.top || 'auto';
        panel.style.right = state.right || '20px';
        panel.style.bottom = state.bottom || '80px';
        panel.style.width = state.width || '360px';
        panel.style.height = state.height || 'auto';
      } catch (e) {
        // Use defaults if parse fails
        panel.style.right = '20px';
        panel.style.bottom = '80px';
        panel.style.width = '360px';
      }
    } else {
      // Default position
      panel.style.right = '20px';
      panel.style.bottom = '80px';
      panel.style.width = '360px';
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
