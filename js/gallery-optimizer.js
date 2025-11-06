class GalleryOptimizer {
  constructor() {
    this.CONFIG = {
      GAP: 1,
      IDEAL_ROW_HEIGHT: 250,
      BINARY_SEARCH_ITERATIONS: 15,
      JPEG_QUALITY: 1.0,
    };

    this.THEMES = [
      { name: 'Violet', primary: '124, 58, 237', dark: '109, 40, 217' },
      { name: 'Blue', primary: '59, 130, 246', dark: '37, 99, 235' },
      { name: 'Pink', primary: '236, 72, 153', dark: '219, 39, 119' },
      { name: 'Green', primary: '34, 197, 94', dark: '22, 163, 74' },
      { name: 'Orange', primary: '249, 115, 22', dark: '234, 88, 12' },
    ];

    this.currentThemeIndex = 0;
    this.isDarkMode = false;

    this.dom = this.getDomReferences();
    this.state = this.getInitialState();

    this.loadTheme();
    this.loadDarkMode();
    this.initEventListeners();
    this.setupDragAndDrop();
    this.updateUIState();
  }

  getDomReferences() {
    const ids = [
      'rectContainer', 'fileInput', 'fileInputTop', 'emptyState',
      'loadingState', 'loadingBar', 'downloadBtn', 'imageModal',
      'modalImage', 'closeModal', 'prevImageBtn', 'nextImageBtn',
      'currentImageIndex', 'totalImageCount', 'statsBar',
      'imageName', 'downloadSingleBtn', 'deleteSingleBtn',
      'modalImgSize', 'modalImgRatio', 'routeNumberInput',
      'downloadOverlay', 'downloadProgressBar', 'domWatermark',
      'imageContainerParent', 'currentQuote'
    ];

    const dom = {};
    ids.forEach(id => {
      dom[id] = document.getElementById(id);
    });

    dom.aspectRatioRadios = document.querySelectorAll('input[name="aspectRatio"]');
    dom.renderQualityRadios = document.querySelectorAll('input[name="renderQuality"]');
    dom.ratioButtons = document.querySelectorAll('.ratio-quality-btn');

    return dom;
  }

  getInitialState() {
    let defaultRatio = '4:3';
    const checkedRatio = document.querySelector('input[name="aspectRatio"]:checked');
    if (checkedRatio) defaultRatio = checkedRatio.value;

    let defaultQuality = 2;
    const checkedQuality = document.querySelector('input[name="renderQuality"]:checked');
    if (checkedQuality) defaultQuality = parseInt(checkedQuality.value);

    return {
      imageItems: [],
      currentPreviewIndex: 0,
      isDownloading: false,
      rectWidth: 0,
      layoutPositions: [],
      totalHeight: 0,
      aspectRatio: defaultRatio,
      renderQuality: defaultQuality,
    };
  }

  initEventListeners() {
    this.dom.fileInput?.addEventListener('change', (e) => this.handleFileUpload(e.target.files));
    this.dom.downloadBtn?.addEventListener('click', () => this.downloadRectangle());
    this.dom.closeModal?.addEventListener('click', () => this.closeModal());
    this.dom.prevImageBtn?.addEventListener('click', () => this.switchPreviewImage(-1));
    this.dom.nextImageBtn?.addEventListener('click', () => this.switchPreviewImage(1));

    this.dom.imageModal?.addEventListener('click', (e) => {
      if (e.target === this.dom.imageModal) this.closeModal();
    });

    this.dom.downloadSingleBtn?.addEventListener('click', () => this.downloadSingleImage());
    this.dom.deleteSingleBtn?.addEventListener('click', () => this.deleteCurrentImage());

    document.addEventListener('keydown', (e) => {
      if (this.dom.imageModal.classList.contains('hidden')) return;
      if (e.key === 'Escape') this.closeModal();
      if (e.key === 'ArrowLeft') this.switchPreviewImage(-1);
      if (e.key === 'ArrowRight') this.switchPreviewImage(1);
    });

    this.dom.routeNumberInput?.addEventListener('input', () => this.updateWatermarkVisibility());

    this.dom.aspectRatioRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.state.aspectRatio = e.target.value;
        this.updateRatioButtonState(e.target.value, 'aspectRatio');
        this.calculateAndRenderRectangle();
      });
    });

    this.dom.renderQualityRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.state.renderQuality = parseInt(e.target.value);
        this.updateRatioButtonState(e.target.value, 'renderQuality');
      });
    });

    window.addEventListener('resize', () => this.calculateAndRenderRectangle());
  }

  setupDragAndDrop() {
    const dropArea = document.body;
    const preventDefaults = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropArea.addEventListener(eventName, preventDefaults, false);
    });

    dropArea.addEventListener('drop', (e) => {
      this.handleFileUpload(e.dataTransfer.files);
    }, false);
  }

  async readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error('读取文件失败'));
      reader.readAsDataURL(file);
    });
  }

  async loadImageData(file) {
    try {
      const dataURL = await this.readFileAsDataURL(file);
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = dataURL;
      });

      const { width, height } = image;
      if (width === 0 || height === 0 || !isFinite(width) || !isFinite(height)) {
        throw new Error('图片尺寸无效');
      }

      return {
        id: Date.now() + '-' + Math.random(),
        src: dataURL,
        width,
        height,
        ratio: width / height,
        name: file.name,
        file
      };
    } catch (error) {
      console.error('加载图片失败:', file.name, error);
      return null;
    }
  }

  async handleFileUpload(files) {
    if (!files || files.length === 0) return;

    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      alert('没有检测到有效的图片文件');
      return;
    }

    this.dom.imageContainerParent?.classList.remove('hidden');
    this.dom.emptyState?.classList.add('hidden');
    this.dom.loadingState?.classList.remove('hidden');

    const newImages = [];
    for (let i = 0; i < imageFiles.length; i++) {
      const result = await this.loadImageData(imageFiles[i]);
      if (result) newImages.push(result);
    }

    this.state.imageItems = this.state.imageItems.concat(newImages);

    if (this.state.imageItems.length > 0) {
      this.dom.loadingState?.classList.add('hidden');
      this.state.layoutPositions = [];
      this.state.totalHeight = 0;
      this.calculateAndRenderRectangle();
      this.updateUIState();
      this.updateWatermarkVisibility();
    }
  }

  calculateAndRenderRectangle() {
    if (!this.state.imageItems || this.state.imageItems.length === 0) {
      this.state.layoutPositions = [];
      this.state.totalHeight = 0;
      this.updateUIState();
      return;
    }

    this.dom.rectContainer.innerHTML = '';
    this.dom.rectContainer.appendChild(this.dom.domWatermark);

    const imageContainer = this.dom.imageContainerParent;
    const mainContentWidth = imageContainer.getBoundingClientRect().width;
    const rectContainerPadding = 32;

    this.state.rectWidth = Math.round(mainContentWidth - rectContainerPadding);
    if (this.state.rectWidth < 200) this.state.rectWidth = 200;

    const [w, h] = this.state.aspectRatio.split(':').map(Number);
    const targetRatio = w / h;

    const result = this.findLayoutForTargetHeight(this.state.rectWidth, this.CONFIG.IDEAL_ROW_HEIGHT);

    if (!result || !result.positions || typeof result.totalHeight !== 'number' || result.totalHeight < 0) {
      console.warn('布局计算失败，使用默认布局');
      this.state.layoutPositions = [];
      this.state.totalHeight = 0;
      this.updateUIState();
      return;
    }

    this.state.layoutPositions = result.positions;
    this.state.totalHeight = result.totalHeight;

    this.dom.rectContainer.style.width = this.state.rectWidth + 'px';
    this.dom.rectContainer.style.height = this.state.totalHeight + 'px';

    this.placeImagesInRectangle(this.state.layoutPositions);
    this.updateUIState();
    this.updateWatermarkVisibility();
  }

  findLayoutForTargetHeight(containerWidth, idealRowHeight) {
    const items = this.state.imageItems;
    if (!items || items.length === 0) return { positions: [], totalHeight: 0 };

    const result = this.calculateJustifiedLayout(containerWidth, idealRowHeight);
    if (!result || !result.positions || result.totalHeight < 0) {
      return { positions: [], totalHeight: 0 };
    }

    return result;
  }

  calculateJustifiedLayout(containerWidth, idealHeight) {
    const items = this.state.imageItems;
    if (!items || items.length === 0) return { positions: [], totalHeight: 0 };

    const GAP = this.CONFIG.GAP;
    const costs = [0];
    const partitions = [0];

    for (let i = 1; i < items.length; i++) {
      let minCost = Infinity;
      let bestPartition = 0;

      for (let j = 1; j <= i; j++) {
        if (costs[j - 1] === Infinity) continue;

        const rowItems = items.slice(j - 1, i);
        const sumOfRatios = rowItems.reduce((sum, item) => sum + item.ratio, 0);
        const gapSpace = (rowItems.length - 1) * GAP;

        if (containerWidth <= gapSpace || sumOfRatios === 0 || !isFinite(sumOfRatios)) continue;

        const rowHeight = (containerWidth - gapSpace) / sumOfRatios;
        if (!isFinite(rowHeight) || rowHeight <= 0) continue;

        const currentCost = Math.pow(Math.abs(rowHeight - idealHeight), 2);
        const totalCost = costs[j - 1] + currentCost;

        if (totalCost < minCost) {
          minCost = totalCost;
          bestPartition = j;
        }
      }

      costs[i] = minCost;
      partitions[i] = bestPartition;
    }

    const rows = [];
    let currentIndex = items.length;

    while (currentIndex > 0) {
      let startIndex = partitions[currentIndex];
      if (startIndex === 0) startIndex = currentIndex;

      rows.unshift(items.slice(startIndex - 1, currentIndex));
      currentIndex = startIndex - 1;
    }

    const positions = [];
    let currentY = 0;

    for (const rowItems of rows) {
      const sumOfRatios = rowItems.reduce((sum, item) => sum + item.ratio, 0);
      const gapSpace = (rowItems.length - 1) * GAP;

      if (sumOfRatios === 0) continue;

      const rowHeight = (containerWidth - gapSpace) / sumOfRatios;
      if (!isFinite(rowHeight) || rowHeight <= 0) continue;

      let currentX = 0;

      for (const item of rowItems) {
        const itemWidth = rowHeight * item.ratio;
        positions.push({
          x: currentX,
          y: currentY,
          width: itemWidth,
          height: rowHeight
        });
        currentX += itemWidth + GAP;
      }

      currentY += rowHeight + GAP;
    }

    const totalHeight = currentY > 0 ? currentY - GAP : 0;
    return { positions, totalHeight };
  }

  placeImagesInRectangle(positions) {
    positions.forEach((pos, i) => {
      this.placeSingleImage(i, pos);
    });
  }

  placeSingleImage(index, position) {
    const imageItem = this.state.imageItems[index];
    if (!imageItem || !position) return;

    const item = document.createElement('div');
    item.className = 'rect-item rounded-sm fade-in';
    item.style.cssText = `left: ${position.x}px; top: ${position.y}px; width: ${position.width}px; height: ${position.height}px;`;

    const img = new Image();
    img.src = imageItem.src;
    img.alt = imageItem.name;

    item.appendChild(img);
    item.addEventListener('click', () => this.openModal(index));

    this.dom.rectContainer.appendChild(item);
  }

  openModal(index) {
    this.state.currentPreviewIndex = index;
    this.dom.imageModal?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    this.updateModalContent();
  }

  closeModal() {
    this.dom.imageModal?.classList.add('hidden');
    document.body.style.overflow = '';
  }

  switchPreviewImage(direction) {
    const newIndex = this.state.currentPreviewIndex + direction;
    if (newIndex < 0 || newIndex >= this.state.imageItems.length) return;

    this.state.currentPreviewIndex = newIndex;
    this.updateModalContent();
  }

  updateModalContent() {
    const item = this.state.imageItems[this.state.currentPreviewIndex];
    if (!item) return;

    this.dom.modalImage.src = item.src;
    this.dom.imageName.textContent = item.name;
    this.dom.modalImgSize.textContent = `${item.width} × ${item.height}`;
    this.dom.modalImgRatio.textContent = item.ratio.toFixed(2);
    this.dom.currentImageIndex.textContent = this.state.currentPreviewIndex + 1;
    this.dom.totalImageCount.textContent = this.state.imageItems.length;

    this.dom.prevImageBtn.disabled = this.state.currentPreviewIndex === 0;
    this.dom.nextImageBtn.disabled = this.state.currentPreviewIndex >= this.state.imageItems.length - 1;
  }

  updateWatermarkVisibility() {
    const watermarkText = this.dom.routeNumberInput?.value.trim() || '';
    let rectWidth = this.state.rectWidth;

    if (!rectWidth) rectWidth = 100;
    if (rectWidth < 200) rectWidth = this.dom.rectContainer?.getBoundingClientRect().width || 200;

    const maxWatermarkWidth = rectWidth * 0.9;
    const domWatermark = this.dom.domWatermark;

    if (watermarkText && rectWidth > 0) {
      domWatermark.textContent = watermarkText;
      domWatermark.style.whiteSpace = 'pre-line';
      domWatermark.style.lineHeight = '1.2';
      domWatermark.style.wordBreak = 'break-word';
      domWatermark.style.wordSpacing = '0';
      domWatermark.style.maxWidth = maxWatermarkWidth + 'px';
      domWatermark.style.margin = '0 auto';

      const textLength = watermarkText.length;
      let fontSize = 0.5;
      const maxLines = textLength > 5 ? 1 : 3;
      const minCharsPerLine = textLength > 5 ? textLength / 5 : textLength;
      const SAFETY_FACTOR = textLength > 5 ? 1.1 : 1.2;
      const PADDING_FACTOR = 0.95;

      let charsPerLine = Math.ceil(textLength / maxLines);
      fontSize = Math.floor((rectWidth * PADDING_FACTOR) / charsPerLine / SAFETY_FACTOR);
      charsPerLine = Math.max(Math.ceil(textLength / maxLines), minCharsPerLine);

      const MAXIMUM_FONT_LIMIT = Math.floor(maxWatermarkWidth / 5 + 45);
      fontSize = Math.min(fontSize, MAXIMUM_FONT_LIMIT);
      fontSize = Math.max(fontSize, 14);

      domWatermark.style.fontSize = fontSize + 'px';

      const strokeWidth = Math.max(fontSize / 25, 1.2);
      domWatermark.style.textStroke = strokeWidth + 'px rgba(255, 255, 255, 0.35)';
      domWatermark.style.webkitTextStroke = strokeWidth + 'px rgba(255, 255, 255, 0.35)';
      domWatermark.style.display = 'block';
    } else {
      domWatermark.style.display = 'none';
    }
  }

  updateRatioButtonState(activeValue, groupName) {
    this.dom.ratioButtons.forEach(btn => {
      if (btn.getAttribute('data-group') === groupName) {
        if (btn.getAttribute('data-value') === String(activeValue)) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      }
    });
  }

  deleteCurrentImage() {
    if (confirm('确定要删除此图片吗？')) {
      this.state.imageItems.splice(this.state.currentPreviewIndex, 1);
      this.closeModal();

      if (this.state.imageItems.length === 0) {
        this.state.currentPreviewIndex = 0;
        this.calculateAndRenderRectangle();
      } else {
        this.state.currentPreviewIndex = Math.min(this.state.currentPreviewIndex, this.state.imageItems.length - 1);
        this.calculateAndRenderRectangle();
      }
    }
  }

  downloadSingleImage() {
    const item = this.state.imageItems[this.state.currentPreviewIndex];
    if (!item) return;

    const a = document.createElement('a');
    a.href = item.src;
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async downloadRectangle() {
    if (this.state.isDownloading || this.state.imageItems.length === 0) return;

    const watermarkText = this.dom.routeNumberInput?.value.trim() || '';
    if (!watermarkText) {
      alert('请输入水印文字后再下载');
      return;
    }

    this.state.isDownloading = true;
    this.dom.downloadOverlay?.classList.remove('hidden');
    this.dom.downloadOverlay?.classList.add('flex');

    const currentScale = this.state.renderQuality;

    const targetElement = this.dom.rectContainer;
    const originalRectShadow = targetElement.style.boxShadow;
    const originalRectBorder = targetElement.style.border;

    try {
      const overlayWasVisible = !this.dom.downloadOverlay?.classList.contains('hidden');
      if (overlayWasVisible) {
        this.dom.downloadOverlay.style.visibility = 'hidden';
      }

      targetElement.style.boxShadow = 'none';
      targetElement.style.border = 'none';

      await new Promise(resolve => setTimeout(resolve, 50));

      const dataUrl = await htmlToImage.toJpeg(targetElement, {
        quality: this.CONFIG.JPEG_QUALITY,
        pixelRatio: currentScale,
        backgroundColor: '#ffffff',
        skipFonts: true,
      });

      targetElement.style.boxShadow = originalRectShadow;
      targetElement.style.border = originalRectBorder;

      if (overlayWasVisible) {
        this.dom.downloadOverlay.style.visibility = 'visible';
      }

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${watermarkText}-${currentScale}x-${Date.now()}.jpeg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      this.dom.downloadProgressBar.style.width = '100%';
    } catch (error) {
      console.error('下载失败:', error);
      alert('下载失败，请重试');
      targetElement.style.boxShadow = originalRectShadow;
      targetElement.style.border = originalRectBorder;
    } finally {
      setTimeout(() => {
        this.state.isDownloading = false;
        this.dom.downloadOverlay?.classList.add('hidden');
        this.dom.downloadOverlay?.classList.remove('flex');
        this.dom.downloadProgressBar.style.width = '0';
      }, 1000);
    }
  }

  updateUIState() {
    const hasImages = this.state.imageItems.length > 0;
    const routeNumberEntered = this.dom.routeNumberInput?.value.trim() !== '';

    this.dom.imageContainerParent?.classList.remove('hidden');
    this.dom.emptyState?.classList.toggle('hidden', hasImages);
    this.dom.statsBar?.classList.toggle('hidden', !hasImages);
    this.dom.downloadBtn.disabled = !hasImages || this.state.isDownloading || !routeNumberEntered;

    if (hasImages && !routeNumberEntered && !this.state.isDownloading) {
      this.dom.routeNumberInput?.classList.add('animate-pulse-primary', 'border-red-500');
    } else {
      this.dom.routeNumberInput?.classList.remove('animate-pulse-primary', 'border-red-500');
    }
  }

  toggleDarkMode() {
    this.isDarkMode = !this.isDarkMode;
    const root = document.documentElement;
    root.classList.toggle('dark', this.isDarkMode);
    localStorage.setItem('darkMode', this.isDarkMode);
  }

  switchTheme() {
    this.currentThemeIndex = (this.currentThemeIndex + 1) % this.THEMES.length;
    const nextTheme = this.THEMES[this.currentThemeIndex];
    this.applyTheme(nextTheme);
    localStorage.setItem('themeIndex', this.currentThemeIndex);
  }

  applyTheme(theme) {
    const root = document.documentElement;
    root.style.setProperty('--color-primary', theme.primary);
    root.style.setProperty('--color-primary-dark', theme.dark);
  }

  loadTheme() {
    const savedThemeIndex = localStorage.getItem('themeIndex');
    if (savedThemeIndex !== null) {
      this.currentThemeIndex = parseInt(savedThemeIndex);
    } else {
      this.currentThemeIndex = Math.floor(Math.random() * this.THEMES.length);
    }

    const theme = this.THEMES[this.currentThemeIndex];
    this.applyTheme(theme);
  }

  loadDarkMode() {
    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode !== null) {
      this.isDarkMode = savedDarkMode === 'true';
    }
    const root = document.documentElement;
    root.classList.toggle('dark', this.isDarkMode);
  }
}


