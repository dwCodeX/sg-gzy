function getScale() {
    const radio = document.querySelector('input[name="renderQuality"]:checked');
    return radio ? parseInt(radio.value) : 2;
}

document.addEventListener('DOMContentLoaded', function () {

    function debounce(func, delay) {
        let timeout;
        return function (...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    }

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = url;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    function adjustContainerRatio(ratio) {
        const container = document.getElementById('rectContainer');
        const parent = document.getElementById('imageContainerParent');
        if (!container) return;

        container.style.width = '100%';
        container.style.height = 'auto';

        const imageItems = document.querySelectorAll('.rect-item');
        if (imageItems.length === 0) {
            switch (ratio) {
                case '16:9':
                    container.style.paddingTop = '56.25%';
                    break;
                case '3:4':
                    container.style.paddingTop = '133.333%';
                    break;
                case '4:3':
                    container.style.paddingTop = '75%';
                    break;
            }
            container.style.minHeight = '';
            container.style.height = '';
            if (parent) parent.classList.add('image-container-empty');
        } else {
            container.style.paddingTop = '0';
            if (parent) parent.classList.remove('image-container-empty');
        }
    }


    class GalleryOptimizer {

        CONFIG = {
            GAP: 1,
            IDEAL_ROW_HEIGHT: 250,
            BINARY_SEARCH_ITERATIONS: 15,
            JPEG_QUALITY: 1.0,
        };

        constructor() {
            this.THEMES = [
                { name: 'Violet', primary: '124, 58, 237', dark: '109, 40, 217' },
                { name: 'Blue', primary: '59, 130, 246', dark: '37, 99, 235' },
                { name: 'Pink', primary: '236, 72, 153', dark: '219, 39, 119' },
                { name: 'Green', primary: '34, 197, 94', dark: '22, 163, 74' },
                { name: 'Orange', primary: '249, 115, 22', dark: '234, 88, 12' },
                { name: 'Sky', primary: '14, 165, 233', dark: '2, 132, 199' },
                { name: 'Rose', primary: '244, 63, 94', dark: '225, 29, 72' },
                { name: 'Teal', primary: '20, 184, 166', dark: '15, 118, 110' },
                { name: 'Amber', primary: '245, 158, 11', dark: '217, 119, 6' },
                { name: 'Indigo', primary: '99, 102, 241', dark: '79, 70, 229' }
            ];
            this.currentThemeIndex = 0;

            this._loadTheme();
            this.dom = this._getDomReferences();
            this.state = this._getInitialState();

            if (!this.dom.domWatermark) {
                const wm = document.createElement('div');
                wm.id = 'domWatermark';
                wm.classList.add('hidden');
                this.dom.domWatermark = wm;
                if (this.dom.rectContainer) this.dom.rectContainer.appendChild(wm);
            }

            this._initEventListeners();
            this._setupDragAndDrop();
            this.updateRatioButtonState(this.state.renderQuality.toString(), 'renderQuality');
            this.updateUIState();
            if (this.state.imageItems.length === 0) {
                this.dom.emptyState.classList.remove('hidden');
            } else {
                this.dom.emptyState.classList.add('hidden');
            }

            const hasVisited = localStorage.getItem('hasVisitedPuzzleTool');
            const onboardingModal = document.getElementById('onboardingModal');
            const closeOnboarding = document.getElementById('closeOnboarding');

            if (!hasVisited && onboardingModal && closeOnboarding) {
                setTimeout(() => {
                    onboardingModal.classList.add('opacity-100', 'pointer-events-auto');
                }, 500);

                closeOnboarding.addEventListener('click', () => {
                    onboardingModal.classList.remove('opacity-100', 'pointer-events-auto');
                    localStorage.setItem('hasVisitedPuzzleTool', 'true');
                });
            }
        }

        _getDomReferences() {
            const ids = [
                'rectContainer', 'fileInputTop', 'fileInputTopBtn',
                'emptyState', 'loadingState', 'loadingText', 'loadingBar', 'downloadBtn',
                'clearBtn', 'imageModal', 'modalImage', 'closeModal', 'prevImageBtn',
                'nextImageBtn', 'currentImageIndex', 'totalImageCount',
                'statsBar', 'rectDimensions', 'regenerateBtn', 'imageName',
                'downloadSingleBtn', 'deleteSingleBtn', 'modalImgSize',
                'modalImgRatio', 'routeNumberInput', 'downloadOverlay',
                'downloadProgressBar', 'downloadProgressText', 'imageCount',
                'imageContainerParent',
                'domWatermark'
            ];
            const dom = {};
            ids.forEach(id => dom[id] = document.getElementById(id));
            
            dom.renderQualityRadios = document.querySelectorAll('input[name="renderQuality"]');
            dom.ratioButtons = document.querySelectorAll('.ratio-quality-btn');
            return dom;
        }

        _getInitialState() {
            const defaultRatio = '4:3';

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

        _initEventListeners() {
            this.dom.fileInputTop.addEventListener('change', async (e) => {
                try {
                    await this.handleFileUpload(e.target.files);
                } catch (error) {
                    console.error("处理图片时出错:", error);
                } finally {
                    e.target.value = null;
                }
            });
            this.dom.downloadBtn.addEventListener('click', this.downloadRectangle.bind(this));
            this.dom.clearBtn.addEventListener('click', this.clearAllImages.bind(this));
            this.dom.regenerateBtn.addEventListener('click', this.regenerateLayout.bind(this));
            this.dom.closeModal.addEventListener('click', this.closeModal.bind(this));
            this.dom.prevImageBtn.addEventListener('click', () => this.switchPreviewImage(-1));
            this.dom.nextImageBtn.addEventListener('click', () => this.switchPreviewImage(1));
            this.dom.imageModal.addEventListener('click', (e) => { if (e.target === this.dom.imageModal) this.closeModal(); });
            this.dom.downloadSingleBtn.addEventListener('click', () => this.downloadSingleImage());
            this.dom.deleteSingleBtn.addEventListener('click', () => this.deleteCurrentImage());

            document.addEventListener('keydown', (e) => {
                if (this.dom.imageModal.classList.contains('hidden')) return;
                if (e.key === 'Escape') this.closeModal();
                if (e.key === 'ArrowLeft') this.switchPreviewImage(-1);
                if (e.key === 'ArrowRight') this.switchPreviewImage(1);
            });

            this.dom.routeNumberInput.addEventListener('input', () => this.handleRouteInputChange());

            document.addEventListener('click', this._handleDocumentClick.bind(this));
            document.addEventListener('keydown', this._handleDocumentKeydown.bind(this));

            this.dom.renderQualityRadios.forEach(radio => {
                radio.addEventListener('change', (e) => {
                    this.state.renderQuality = parseInt(e.target.value);
                    this.updateRatioButtonState(e.target.value, 'renderQuality');
                });
            });

            window.addEventListener('resize', debounce(this.calculateAndRenderRectangle.bind(this), 150));

            if (this.state.imageItems.length === 0) {
                this.dom.imageContainerParent.classList.remove('hidden');
                this.dom.emptyState.classList.remove('hidden');
            }
        }

        handleRouteInputChange() {
            this.updateUIState();
            this._updateWatermarkVisibility();
        }

        _updateWatermarkVisibility() {
            const watermarkText = this.dom.routeNumberInput.value.trim();
            const domWatermark = this.dom.domWatermark;
            const rectContainer = this.dom.rectContainer;

            if (!rectContainer) return;

            if (watermarkText === '') {
                domWatermark.classList.add('hidden');
                return;
            }

            const rectItems = document.querySelectorAll('.rect-item');
            if (rectItems.length === 0) {
                domWatermark.classList.add('hidden');
                return;
            }

            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;

            rectItems.forEach(item => {
                const rect = item.getBoundingClientRect();
                const containerRect = rectContainer.getBoundingClientRect();

                const x = rect.left - containerRect.left;
                const y = rect.top - containerRect.top;
                const right = x + rect.width;
                const bottom = y + rect.height;

                minX = Math.min(minX, x);
                maxX = Math.max(maxX, right);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, bottom);
            });

            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;

            const contentWidth = maxX - minX;
            const contentHeight = maxY - minY;

            domWatermark.style.left = `${centerX}px`;
            domWatermark.style.top = `${centerY}px`;
            domWatermark.style.transform = 'translate(-50%, -50%) rotate(-15deg)';

            const maxWatermarkWidth = contentWidth * 0.9;
            const maxWatermarkHeight = contentHeight * 0.8;
            const textLength = watermarkText.length;

            let fontSize = Math.floor(maxWatermarkWidth / (Math.max(textLength * 0.4, 3)));
            fontSize = Math.min(fontSize, maxWatermarkHeight);
            fontSize = Math.max(fontSize, 16);

            domWatermark.style.setProperty('font-size', `${fontSize}px`, 'important');
            domWatermark.style.maxWidth = `${maxWatermarkWidth}px`;
            domWatermark.textContent = watermarkText;

            const strokeWidth = Math.max(fontSize / 40, 0.8);
            domWatermark.style.textStroke = `${strokeWidth}px rgba(255, 255, 255, 0.85)`;
            domWatermark.style.webkitTextStroke = `${strokeWidth}px rgba(255, 255, 255, 0.85)`;

            domWatermark.classList.remove('hidden');
        }

        _handleDocumentClick() {
            if (this.dom.actionDropdown && !this.dom.actionDropdown.classList.contains('hidden')) {
                this.dom.actionDropdown.classList.add('hidden');
            }
        }

        _handleDocumentKeydown(e) {
            if (this.dom.actionDropdown && e.key === 'Escape' && !this.dom.actionDropdown.classList.contains('hidden')) {
                this.dom.actionDropdown.classList.add('hidden');
            }
        }

        _applyTheme(theme) {
            document.documentElement.style.setProperty('--color-primary', theme.primary);
            document.documentElement.style.setProperty('--color-primary-dark', theme.dark);
        }

        _switchTheme() {
            this.currentThemeIndex = (this.currentThemeIndex + 1) % this.THEMES.length;
            const nextTheme = this.THEMES[this.currentThemeIndex];
            this._applyTheme(nextTheme);

            if (this.dom.actionDropdown) {
                this.dom.actionDropdown.classList.add('hidden');
            }
            const emptyState = document.getElementById('emptyState');
            if (emptyState && !emptyState.classList.contains('hidden')) {
                emptyState.classList.add('hidden');
                setTimeout(() => {
                    emptyState.classList.remove('hidden');
                }, 50);
            }
        }

        _loadTheme() {

            const randomIndex = Math.floor(Math.random() * this.THEMES.length);
            this.currentThemeIndex = randomIndex;
            const theme = this.THEMES[this.currentThemeIndex];
            this._applyTheme(theme);
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

        _setupDragAndDrop() {
            const dropArea = document.body;
            const preventDefaults = (e) => { e.preventDefault(); e.stopPropagation(); };
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => dropArea.addEventListener(eventName, preventDefaults, false));
            dropArea.addEventListener('drop', (e) => { this.handleFileUpload(e.dataTransfer.files); }, false);
        }

        async _readFileAsDataURL(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = (e) => reject(new Error('Failed to read file as DataURL.'));
                reader.readAsDataURL(file);
            });
        }

        async _loadImageData(file) {
            try {
                const dataURL = await this._readFileAsDataURL(file);

                const image = await new Promise((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => resolve(img);
                    img.onerror = () => reject(new Error('Image load failed from DataURL.'));
                    img.src = dataURL;
                });

                const { width, height } = image;

                if (width <= 0 || height <= 0 || !isFinite(width) || !isFinite(height)) {
                    console.error('Image has invalid dimensions:', file.name, width, 'x', height);
                    throw new Error('Invalid dimensions (0 or NaN)');
                }

                return {
                    id: `${Date.now()}-${Math.random()}`,
                    src: dataURL,
                    width,
                    height,
                    ratio: width / height,
                    name: file.name,
                    file: file
                };
            } catch (error) {
                console.error('Failed to load image metadata:', file.name, error);
                return null;
            }
        }

        async handleFileUpload(files) {
            if (!files || files.length === 0) return;

            const imageFiles = Array.from(files).filter(file =>
                ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
            );
            if (imageFiles.length === 0) {
                alert('未检测到有效图片文件（仅支持 JPG/PNG/WEBP 格式）');
                return;
            }

            this.dom.imageContainerParent.classList.remove('hidden');
            this.dom.emptyState.classList.add('hidden');
            this.dom.loadingState.classList.remove('hidden');

            const totalFiles = imageFiles.length;
            const failedFiles = [];
            const newImages = [];

            const updateProgress = (loaded, currentFileName, status = '处理中') => {
                this.dom.loadingText.textContent = `[${status}] 第 ${loaded}/${totalFiles} 张：${currentFileName}`;
                this.dom.loadingBar.style.width = `${(loaded / totalFiles) * 100}%`;
            };

            updateProgress(0, imageFiles[0].name, '准备中');

            for (let i = 0; i < totalFiles; i++) {
                const file = imageFiles[i];
                try {
                    updateProgress(i + 1, file.name);
                    const result = await this._loadImageData(file);
                    if (result) {
                        newImages.push(result);
                    } else {
                        failedFiles.push(`${file.name}（格式无法识别）`);
                    }
                } catch (error) {
                    failedFiles.push(`${file.name}（错误：${error.message.slice(0, 20)}...）`);
                    console.error(`处理文件 ${file.name} 失败：`, error);
                }
            }

            this.state.imageItems = [...this.state.imageItems, ...newImages];

            this.dom.loadingState.classList.add('hidden');

            if (failedFiles.length > 0) {
                this.showErrorToast(`成功加载 ${newImages.length} 张，失败 ${failedFiles.length} 张`);
            } else if (newImages.length > 0) {
                this.showSuccessToast(`成功加载 ${newImages.length} 张图片`);
            }

            this._resetLayout();
            setTimeout(() => {
                this.calculateAndRenderRectangle();
            }, 100);

            this.updateUIState();
            this._updateWatermarkVisibility();
        }

        showSuccessToast(message) {
            const toast = document.getElementById('successToast');
            const toastMessage = document.getElementById('toastMessage');
            const countdownEl = document.getElementById('countdown');

            if (toast.timer) clearInterval(toast.timer);

            toastMessage.textContent = message;
            let seconds = 6;
            countdownEl.textContent = seconds;

            toast.classList.remove('hidden');
            toast.classList.add('show');

            toast.timer = setInterval(() => {
                seconds--;
                countdownEl.textContent = seconds;
                if (seconds <= 0) {
                    this.closeSuccessToast();
                }
            }, 1000);

            const closeOnClick = () => {
                this.closeSuccessToast();
                toast.removeEventListener('click', closeOnClick);
            };
            toast.addEventListener('click', closeOnClick);
        }

        closeSuccessToast() {
            const toast = document.getElementById('successToast');
            if (toast.timer) {
                clearInterval(toast.timer);
                toast.timer = null;
            }
            toast.classList.remove('show');
            toast.classList.add('hidden');
        }

        showErrorToast(message) {
            const toast = document.getElementById('errorToast');
            const toastMessage = document.getElementById('errorToastMessage');
            const countdownEl = document.getElementById('errorCountdown');
            if (toast.timer) clearInterval(toast.timer);
            toastMessage.textContent = message;
            let seconds = 6;
            countdownEl.textContent = seconds;
            toast.classList.remove('hidden');
            toast.classList.add('show');
            toast.timer = setInterval(() => {
                seconds--;
                countdownEl.textContent = seconds;
                if (seconds <= 0) {
                    this.closeErrorToast();
                }
            }, 1000);
            const closeOnClick = () => {
                this.closeErrorToast();
                toast.removeEventListener('click', closeOnClick);
            };
            toast.addEventListener('click', closeOnClick);
        }

        closeErrorToast() {
            const toast = document.getElementById('errorToast');
            if (toast.timer) {
                clearInterval(toast.timer);
                toast.timer = null;
            }
            toast.classList.remove('show');
            toast.classList.add('hidden');
        }

        _resetLayout() {
            this.state.layoutPositions = [];
            this.state.totalHeight = 0;
            this.state.rectWidth = 0;

            const imageContainer = this.dom.imageContainerParent;
            if (!imageContainer) return;

            const containerRect = imageContainer.getBoundingClientRect();
            this.state.rectWidth = Math.max(600, Math.round(containerRect.width) || 600);

            this.dom.rectContainer.innerHTML = '';
            this.dom.rectContainer.appendChild(this.dom.domWatermark);

            this.dom.rectContainer.style.display = 'none';
            this.dom.rectContainer.offsetHeight;
            this.dom.rectContainer.style.display = 'block';

            if (this.state.imageItems.length > 0) {
                this.calculateAndRenderRectangle();
            }
        }

        regenerateLayout() {
            if (this.state.imageItems.length === 0) return;
            this.state.imageItems.sort(() => 0.5 - Math.random());
            this.calculateAndRenderRectangle();
        }

        calculateAndRenderRectangle() {
            const filteredItems = this.state.imageItems.filter(item =>
                item && item.ratio > 0 && isFinite(item.ratio)
            );

            if (filteredItems.length === 0) {
                this.state.layoutPositions = [];
                this.state.totalHeight = 0;
                this.dom.rectContainer.style.minHeight = '';
                this.dom.rectContainer.style.height = '';
                adjustContainerRatio(this.state.aspectRatio);
                this.updateUIState();
                return;
            }

            this.dom.rectContainer.style.minHeight = 'auto';
            this.dom.rectContainer.style.height = 'auto';

            const itemsForLayout = filteredItems;

            this.dom.rectContainer.innerHTML = '';
            this.dom.rectContainer.appendChild(this.dom.domWatermark);

            const imageContainer = this.dom.imageContainerParent;
            const containerRect = imageContainer.getBoundingClientRect();

            const containerStyle = window.getComputedStyle(imageContainer);
            const paddingLeft = parseFloat(containerStyle.paddingLeft) || 0;
            const paddingRight = parseFloat(containerStyle.paddingRight) || 0;

            this.state.rectWidth = Math.round(imageContainer.clientWidth - paddingLeft - paddingRight);

            const [w, h] = this.state.aspectRatio.split(':').map(Number);
            const targetRatio = w / h;
            const baseTargetHeight = this.state.rectWidth / targetRatio;
            const viewportCap = Math.max(320, Math.round((window.innerHeight || document.documentElement.clientHeight || 800) * 0.75));
            const targetHeight = this.state.aspectRatio === '3:4' ? Math.min(baseTargetHeight, viewportCap) : baseTargetHeight;

            let estimatedRowCount = Math[(this.state.aspectRatio === '16:9') ? 'floor' : 'ceil'](Math.sqrt(itemsForLayout.length / targetRatio));
            estimatedRowCount = Math.max(2, estimatedRowCount);
            let idealRowHeight = targetHeight / estimatedRowCount;
            idealRowHeight = Math.max(80, Math.min(400, idealRowHeight));

            let bestLayout = null;
            let minCost = Infinity;
            const maxIterations = 15;
            const rowHeightStep = 15;

            const originalItems = this.state.imageItems;

            try {
                this.state.imageItems = filteredItems;

                for (let i = 0; i < maxIterations; i++) {
                    const layout = this._findLayoutForTargetHeight(this.state.rectWidth, idealRowHeight);
                    if (!layout || layout.totalHeight === 0 || layout.positions.length !== itemsForLayout.length) continue;

                    const ratioDiff = Math.abs(layout.totalHeight - targetHeight) / targetHeight;
                    const rowHeights = layout.positions.reduce((acc, pos) => {
                        if (pos.x === 0) acc.push(pos.height);
                        return acc;
                    }, []);
                    const rowCount = rowHeights.length;
                    const avgRowHeight = rowHeights.length > 0 ? rowHeights.reduce((sum, h) => sum + h, 0) / rowHeights.length : 0;
                    const rowHeightDiff = rowHeights.reduce((sum, h) => sum + Math.pow(h - avgRowHeight, 2), 0) / (rowHeights.length || 1);
                    const colCount = rowCount > 0 ? Math.ceil(layout.positions.length / rowCount) : 0;

                    const ratioWeight = this.state.aspectRatio === '16:9' ? 1100 : 700;
                    const tooWidePenalty = layout.totalHeight < targetHeight
                        ? ((targetHeight - layout.totalHeight) / targetHeight) * (this.state.aspectRatio === '16:9' ? 1000 : 800)
                        : 0;
                    const tooTallPenalty = layout.totalHeight > targetHeight
                        ? ((layout.totalHeight - targetHeight) / targetHeight) * (this.state.aspectRatio === '3:4' ? 1600 : 900)
                        : 0;
                    const expectedRows16x9 = Math.max(2, Math.floor(Math.sqrt(itemsForLayout.length / targetRatio)));
                    const rowCountPenalty = this.state.aspectRatio === '16:9' && rowCount > expectedRows16x9
                        ? Math.pow(rowCount - expectedRows16x9, 2) * 160
                        : 0;
                    const totalCost = ratioDiff * ratioWeight + rowHeightDiff * 0.3 + tooWidePenalty + tooTallPenalty + rowCountPenalty;

                    if (totalCost < minCost) {
                        minCost = totalCost;
                        bestLayout = layout;
                    }

                    const currentRatio = this.state.rectWidth / layout.totalHeight;
                    const currentTotalHeight = layout.totalHeight;
                    const heightDiff = currentTotalHeight - targetHeight;

                    if (heightDiff > 20) {
                        idealRowHeight = Math.max(80, idealRowHeight - rowHeightStep * (1 + Math.abs(heightDiff) / targetHeight));
                    } else if (heightDiff < -20) {
                        idealRowHeight += rowHeightStep * (1 + Math.abs(heightDiff) / targetHeight);
                    } else {
                        idealRowHeight += heightDiff > 0 ? -rowHeightStep / 2 : rowHeightStep / 2;
                    }
                }

                if (!bestLayout) {
                    throw new Error("未计算出有效布局");
                }

                const finalRatio = this.state.rectWidth / bestLayout.totalHeight;
                const finalDiff = Math.abs(finalRatio - targetRatio);
                let finalRowCount = bestLayout.positions.filter(pos => pos.x === 0).length;
                let finalColCount = Math.ceil(bestLayout.positions.length / finalRowCount);

                if (finalDiff > 0.01) {
                    const adjustedTotalHeight = bestLayout.totalHeight * (targetRatio / finalRatio);
                    const adjustedRowHeight = adjustedTotalHeight / finalRowCount;
                    const adjustedLayout = this._findLayoutForTargetHeight(this.state.rectWidth, adjustedRowHeight);

                    if (adjustedLayout && adjustedLayout.totalHeight > 0) {
                        const newDiff = Math.abs(this.state.rectWidth / adjustedLayout.totalHeight - targetRatio);
                        const newRowCount = adjustedLayout.positions.filter(pos => pos.x === 0).length;
                        if (newDiff < finalDiff) {
                            bestLayout = adjustedLayout;
                            finalRowCount = newRowCount;
                        }
                    }
                }

                if (this.state.aspectRatio === '16:9') {
                    const targetHeightExact = this.state.rectWidth / targetRatio;
                    const baseRowCount = bestLayout.positions.filter(p => p.x === 0).length;
                    let tunedLayout = bestLayout;
                    let tunedDiff = Math.abs(this.state.rectWidth / tunedLayout.totalHeight - targetRatio);
                    const baseRowHeight = tunedLayout.totalHeight / Math.max(1, baseRowCount);
                    let low = baseRowHeight * 0.85;
                    let high = baseRowHeight * 1.15;
                    for (let i = 0; i < 10; i++) {
                        const mid = (low + high) / 2;
                        const lay = this._calculateJustifiedLayout(this.state.rectWidth, mid);
                        if (!lay || !isFinite(lay.totalHeight) || lay.totalHeight <= 0) break;
                        const diff = Math.abs(this.state.rectWidth / lay.totalHeight - targetRatio);
                        if (diff < tunedDiff) { tunedLayout = lay; tunedDiff = diff; }
                        if (lay.totalHeight > targetHeightExact) { high = mid; } else { low = mid; }
                    }
                    const currentDiff = Math.abs(this.state.rectWidth / bestLayout.totalHeight - targetRatio);
                    if (tunedDiff < currentDiff) { bestLayout = tunedLayout; }

                    let candidateBest = bestLayout;
                    let candidateBestCost = Math.abs(this.state.rectWidth / candidateBest.totalHeight - targetRatio) * 1100;
                    for (let k = 2; k <= 5; k++) {
                        const h = targetHeightExact / k;
                        const cand = this._findLayoutForTargetHeight(this.state.rectWidth, h);
                        if (!cand || !cand.positions || cand.positions.length !== itemsForLayout.length || !isFinite(cand.totalHeight) || cand.totalHeight <= 0) continue;
                        const diff = Math.abs(this.state.rectWidth / cand.totalHeight - targetRatio);
                        const rowHeights = cand.positions.reduce((acc, pos) => { if (pos.x === 0) acc.push(pos.height); return acc; }, []);
                        const avgRow = rowHeights.length > 0 ? rowHeights.reduce((s, v) => s + v, 0) / rowHeights.length : 0;
                        const varRow = rowHeights.reduce((s, v) => s + Math.pow(v - avgRow, 2), 0) / (rowHeights.length || 1);
                        const cost = diff * 1100 + varRow * 0.2;
                        if (cost < candidateBestCost) { candidateBest = cand; candidateBestCost = cost; }
                    }
                    const currentCost = Math.abs(this.state.rectWidth / bestLayout.totalHeight - targetRatio) * 1100;
                    if (candidateBestCost < currentCost) { bestLayout = candidateBest; }
                }

                if (this.state.aspectRatio === '3:4') {
                    const targetHeightExact = this.state.rectWidth / targetRatio;
                    const baseRowCount = bestLayout.positions.filter(p => p.x === 0).length;
                    let tunedLayout = bestLayout;
                    let tunedDiff = Math.abs(this.state.rectWidth / tunedLayout.totalHeight - targetRatio);
                    const baseRowHeight = tunedLayout.totalHeight / Math.max(1, baseRowCount);
                    let low = baseRowHeight * 0.9;
                    let high = baseRowHeight * 1.1;
                    for (let i = 0; i < 10; i++) {
                        const mid = (low + high) / 2;
                        const lay = this._calculateJustifiedLayout(this.state.rectWidth, mid);
                        if (!lay || !isFinite(lay.totalHeight) || lay.totalHeight <= 0) break;
                        const diff = Math.abs(this.state.rectWidth / lay.totalHeight - targetRatio);
                        if (diff < tunedDiff) { tunedLayout = lay; tunedDiff = diff; }
                        if (lay.totalHeight > targetHeightExact) { high = mid; } else { low = mid; }
                    }
                    const currentDiff = Math.abs(this.state.rectWidth / bestLayout.totalHeight - targetRatio);
                    if (tunedDiff < currentDiff) { bestLayout = tunedLayout; }
                }

                this.state.layoutPositions = bestLayout.positions;
                this.state.totalHeight = bestLayout.totalHeight;

                const finalRatioFinal = this.state.rectWidth / bestLayout.totalHeight;
                const finalDiffFinal = Math.abs(finalRatioFinal - targetRatio);

                const unscaledWidth = Math.round(this.state.rectWidth);
                const unscaledHeight = Math.round(bestLayout.totalHeight);
                const finalContainerWidth = unscaledWidth;
                const finalContainerMinHeight = unscaledHeight;

                setTimeout(() => {
                    const requiredParentHeight = finalContainerMinHeight + 40

                    this.dom.rectContainer.style.cssText = `
                width: ${finalContainerWidth}px !important;
                min-height: ${finalContainerMinHeight}px !important;
                height: auto !important;
                padding-top: 0 !important;
                padding-bottom: 20px !important;
                display: block !important;
                overflow: visible !important;
                max-height: none !important;
                margin: 0 auto !important;
                position: relative !important;
                box-sizing: border-box !important;
                background-color: #ffffff !important;
                box-shadow: var(--shadow-inner) !important;
                border: 1px solid #f0f0f0 !important;
            `;

                    this.dom.imageContainerParent.style.cssText = `
                height: ${requiredParentHeight}px !important;
                min-height: ${requiredParentHeight}px !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: flex-start !important;
                overflow: auto !important;
                max-height: none !important;
                padding: clamp(8px, 1vw, 16px) !important;
                box-sizing: border-box !important;
                background-color: #ffffff !important;
                position: relative !important;
                margin: clamp(0.25rem, 1vw, 0.5rem) !important;
            `;

                    this.dom.rectContainer.offsetHeight;
                    this.dom.imageContainerParent.offsetHeight;

                    console.log("===== 最终样式确认 =====");
                    console.log("拼图容器 min-height（计算值）：", unscaledHeight);
                    console.log("拼图容器 min-height（实际值）：", window.getComputedStyle(this.dom.rectContainer).minHeight);
                    console.log("父容器 height（计算值）：", requiredParentHeight);
                    console.log("父容器 height（实际值）：", window.getComputedStyle(this.dom.imageContainerParent).height);
                }, 100);

                this._placeImagesInRectangle(this.state.layoutPositions);
                

                this.dom.rectContainer.style.transform = 'none';
                this.dom.rectContainer.style.transformOrigin = 'top left';
                this.dom.rectContainer.style.overflow = 'visible';
                this.dom.rectContainer.style.maxHeight = "none";
                this.dom.rectContainer.style.overflowY = "visible";
                this.dom.imageContainerParent.style.overflowY = "auto";
                this.dom.imageContainerParent.style.overflowX = 'hidden';
                this.dom.imageContainerParent.style.maxHeight = 'none';
                this.dom.imageContainerParent.style.minHeight = 'auto';
                this.dom.imageContainerParent.style.position = 'relative';

                this.dom.rectContainer.style.display = 'block';
                this.dom.rectContainer.style.position = 'relative';

                setTimeout(() => {
                    const rectContainer = this.dom.rectContainer;
                    const parentContainer = this.dom.imageContainerParent;

                    console.log("===== 图片渲染后最终尺寸 =====");
                    console.log("拼图容器设置的min-height：", rectContainer.style.minHeight);
                    console.log("父容器设置的height：", parentContainer.style.height);
                    console.log("父容器overflow：", window.getComputedStyle(parentContainer).overflow);
                }, 200);
                this.updateUIState();
                this._updateWatermarkVisibility();

            } catch (error) {
                console.error('布局计算错误:', error);
            } finally {
                this.state.imageItems = originalItems;
            }
        }

        _findLayoutForTargetHeight(containerWidth, idealRowHeight) {
            const [wRatio, hRatio] = this.state.aspectRatio.split(':').map(Number);
            const targetRatio = wRatio / hRatio;
            const itemCount = this.state.imageItems.length;

            if (itemCount === 0) {
                return { positions: [], totalHeight: 0 };
            }

            const approxCols = Math.round(Math.sqrt(itemCount * targetRatio));
            const baseColCount = Math.min(8, Math.max(1, approxCols));

            const adjustedIdealRowHeight = (containerWidth / (targetRatio * baseColCount)) * (this.state.aspectRatio === '16:9' ? 1.12 : 1);

            let low = Math.max(50, adjustedIdealRowHeight * 0.5);
            let high = Math.min(800, adjustedIdealRowHeight * 2);

            let bestLayout = this._calculateJustifiedLayout(containerWidth, adjustedIdealRowHeight);

            if (!bestLayout || bestLayout.totalHeight <= 0 || !isFinite(bestLayout.totalHeight)) {
                bestLayout = this._calculateJustifiedLayout(containerWidth, this.CONFIG.IDEAL_ROW_HEIGHT);
                if (!bestLayout || bestLayout.totalHeight <= 0 || !isFinite(bestLayout.totalHeight)) {
                    return { positions: [], totalHeight: 0 };
                }
            }

            let minLayoutDiff = Infinity;
            if (bestLayout.positions.length > 0) {
                const rowHeights = bestLayout.positions.reduce((acc, pos) => {
                    if (pos.x === 0) acc.push(pos.height);
                    return acc;
                }, []);
                const averageRowHeight = rowHeights.length > 0 ? rowHeights.reduce((sum, h) => sum + h, 0) / rowHeights.length : 0;
                const diff = Math.abs(averageRowHeight - adjustedIdealRowHeight);
                minLayoutDiff = diff;
            } else {
                return { positions: [], totalHeight: 0 };
            }

            for (let i = 0; i < this.CONFIG.BINARY_SEARCH_ITERATIONS; i++) {
                const midRowHeight = (low + high) / 2;
                if (high - low < 0.5 || i === this.CONFIG.BINARY_SEARCH_ITERATIONS - 1) break;
                const layout = this._calculateJustifiedLayout(containerWidth, midRowHeight);

                if (!isFinite(layout.totalHeight) || layout.totalHeight <= 0) {
                    high = midRowHeight;
                    continue;
                }

                const rowHeights = layout.positions.reduce((acc, pos) => {
                    if (pos.x === 0) acc.push(pos.height);
                    return acc;
                }, []);
                const averageRowHeight = rowHeights.length > 0 ? rowHeights.reduce((sum, h) => sum + h, 0) / rowHeights.length : 0;
                const diff = Math.abs(averageRowHeight - adjustedIdealRowHeight);

                if (diff < minLayoutDiff) {
                    minLayoutDiff = diff;
                    bestLayout = layout;
                }

                if (averageRowHeight < adjustedIdealRowHeight) {
                    low = midRowHeight;
                } else {
                    high = midRowHeight;
                }
            }

            if (!bestLayout || !bestLayout.positions || bestLayout.totalHeight <= 0) {
                return { positions: [], totalHeight: 0 };
            }

            const finalRatio = containerWidth / bestLayout.totalHeight;
            const finalDiff = Math.abs(finalRatio - targetRatio);

            if (finalDiff > 0.02) {
                const adjustRatio = targetRatio / finalRatio;
                const adjustedTotalHeight = bestLayout.totalHeight * adjustRatio;
                const rowCount = bestLayout.positions.filter(pos => pos.x === 0).length;
                let adjustedRowHeight = 200;
                if (isFinite(adjustedTotalHeight) && adjustedTotalHeight > 0) {
                    adjustedRowHeight = rowCount > 0 ? adjustedTotalHeight / rowCount : 200;
                }
                const adjustedLayout = this._calculateJustifiedLayout(containerWidth, adjustedRowHeight);
                if (adjustedLayout && adjustedLayout.totalHeight > 0) {
                    const newDiff = Math.abs(containerWidth / adjustedLayout.totalHeight - targetRatio);
                    if (newDiff < finalDiff) {
                        bestLayout = adjustedLayout;
                    }
                }
            }

            return bestLayout;
        }

        _calculateJustifiedLayout(containerWidth, idealHeight) {
            const items = this.state.imageItems;
            if (!items || items.length === 0) return { positions: [], totalHeight: 0 };
            const { GAP } = this.CONFIG;
            const costs = [0];
            const partitions = [0];

            for (let i = 1; i <= items.length; i++) {
                let minCost = Infinity, bestPartition = 0;
                const [wRatio, hRatio] = this.state.aspectRatio.split(':').map(Number);
                const targetRatio = wRatio / hRatio;
                const maxPossibleColumns = 100;

                for (let j = Math.max(1, i - maxPossibleColumns); j <= i; j++) {
                    if (costs[j - 1] === Infinity) continue;

                    const rowItems = items.slice(j - 1, i);
                    const sumOfRatios = rowItems.reduce((sum, item) => sum + item.ratio, 0);
                    const gapSpace = (rowItems.length - 1) * GAP;

                    if (containerWidth <= gapSpace || sumOfRatios <= 0 || !isFinite(sumOfRatios)) continue;

                    const rowHeight = (containerWidth - gapSpace) / sumOfRatios;
                    if (!isFinite(rowHeight) || rowHeight <= 0) continue;

                    const currentRowRatio = containerWidth / rowHeight;
                    const ratioDiff = Math.abs(currentRowRatio - targetRatio);

                    const rowHeightCost = Math.pow(Math.abs(rowHeight - idealHeight), 2) * 0.5;
                    const asymFactor = this.state.aspectRatio === '16:9' ? 1000 : (this.state.aspectRatio === '3:4' ? 900 : 700);
                    const nearBonus = ratioDiff < 0.02 ? -200 : 0;
                    const ratioPenalty = currentRowRatio > targetRatio
                        ? Math.pow(currentRowRatio - targetRatio, 2) * asymFactor
                        : Math.pow(targetRatio - currentRowRatio, 2) * (asymFactor * 0.5);
                    const currentCost = costs[j - 1] + rowHeightCost + ratioPenalty + nearBonus;

                    if (currentCost < minCost) {
                        minCost = currentCost;
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
                if (startIndex <= 0 || startIndex > currentIndex) {
                    const [wRatio] = this.state.aspectRatio.split(':').map(Number);
                    const defaultSplit = Math.max(1, currentIndex - (wRatio > 4 ? 5 : 4));
                    startIndex = defaultSplit;
                }
                rows.unshift(items.slice(startIndex - 1, currentIndex));
                currentIndex = startIndex - 1;
            }

            const positions = [];
            let currentY = 0;
            for (const rowItems of rows) {
                const sumOfRatios = rowItems.reduce((sum, item) => sum + item.ratio, 0);
                const gapSpace = (rowItems.length - 1) * GAP;
                if (sumOfRatios <= 0) continue;

                const rowHeight = (containerWidth - gapSpace) / sumOfRatios;
                if (!isFinite(rowHeight)) continue;

                let currentX = 0;
                for (const item of rowItems) {
                    const itemWidth = rowHeight * item.ratio;
                    positions.push({ x: currentX, y: currentY, width: itemWidth, height: rowHeight });
                    currentX += itemWidth + GAP;
                }
                currentY += rowHeight + GAP;
            }
            const totalHeight = currentY > 0 ? currentY - GAP : 0;
            return { positions, totalHeight };
        }

        _placeImagesInRectangle(positions) {
            const container = this.dom.rectContainer;

            const oldItems = container.querySelectorAll('.rect-item');
            oldItems.forEach(item => item.remove());

            if (!container.contains(this.dom.domWatermark)) {
                container.appendChild(this.dom.domWatermark);
            }

            positions.forEach((pos, i) => {
                this._placeSingleImage(i, pos);
            });
        }

        _placeSingleImage(index, position) {
            const imageItem = this.state.imageItems[index];
            if (!imageItem || !position) return;

            const item = document.createElement('div');
            item.className = 'rect-item rounded-sm';
            const itemWidth = Math.round(position.width);
            const itemHeight = Math.round(position.height);

            item.style.cssText = `
        left: ${Math.round(position.x)}px;
        top: ${Math.round(position.y)}px;
        width: ${itemWidth}px;
        height: ${itemHeight}px;
        position: absolute;
        overflow: visible;
    `;

            const img = new Image();
            img.src = imageItem.src;
            img.alt = imageItem.name;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'contain';

            img.onload = () => {
                const rectContainer = this.dom.rectContainer;
                const parentContainer = this.dom.imageContainerParent;
                const rectRect = rectContainer.getBoundingClientRect();

                if (img.height > itemHeight) {
                    rectContainer.style.height = `${Math.max(rectRect.height, img.height + position.y + 20)}px`;
                    parentContainer.style.height = `${rectContainer.getBoundingClientRect().height + 20}px`;
                }
            };

            item.appendChild(img);
            item.addEventListener('click', () => this.openModal(index));
            this.dom.rectContainer.appendChild(item);
        }

        openModal(index) {
            this.state.currentPreviewIndex = index;
            this.dom.imageModal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            this.updateModalContent();
        }
        closeModal() {
            this.dom.imageModal.classList.add('hidden');
            document.body.style.overflow = '';
        }

        switchPreviewImage(direction) {
            const newIndex = this.state.currentPreviewIndex + direction;
            if (newIndex >= 0 && newIndex < this.state.imageItems.length) {
                this.state.currentPreviewIndex = newIndex;
                this.updateModalContent();
            }
        }

        updateModalContent() {
            const item = this.state.imageItems[this.state.currentPreviewIndex];
            if (!item) return;

            if (this._pendingDeleteTimeout) { clearTimeout(this._pendingDeleteTimeout); this._pendingDeleteTimeout = null; }
            this._pendingDelete = false;
            if (this.dom && this.dom.deleteSingleBtn) {
                this.dom.deleteSingleBtn.innerHTML = '<i class="fa fa-trash"></i> <span class="hidden sm:inline">删除</span>';
                this.dom.deleteSingleBtn.style.borderColor = '';
            }

            this.dom.modalImage.src = item.src;
            this.dom.imageName.textContent = item.name;
            this.dom.modalImgSize.textContent = `${item.width} × ${item.height}`;
            this.dom.modalImgRatio.textContent = item.ratio.toFixed(2);
            this.dom.currentImageIndex.textContent = this.state.currentPreviewIndex + 1;
            this.dom.totalImageCount.textContent = this.state.imageItems.length;
            this.dom.prevImageBtn.disabled = this.state.currentPreviewIndex === 0;
            this.dom.nextImageBtn.disabled = this.state.imageItems.length === 0 || this.state.currentPreviewIndex === this.state.imageItems.length - 1;
        }

        clearAllImages() {
            if (!this._pendingClear) {
                this._pendingClear = true;
                if (this._pendingClearTimeout) { clearTimeout(this._pendingClearTimeout); }
                if (this.dom && this.dom.clearBtn) {
                    this.dom.clearBtn.innerHTML = '<i class="fa fa-exclamation-triangle"></i> <span class="hidden sm:inline">再次点击确认</span>';
                    this.dom.clearBtn.style.setProperty('border-color', 'rgb(225, 29, 72)', 'important');
                    this.dom.clearBtn.style.setProperty('background', 'rgb(225, 29, 72)', 'important');
                    this.dom.clearBtn.style.setProperty('color', '#fff', 'important');
                }
                this._pendingClearTimeout = setTimeout(() => {
                    this._pendingClear = false;
                    if (this.dom && this.dom.clearBtn) {
                        this.dom.clearBtn.innerHTML = '<i class="fa fa-trash"></i> <span class="hidden sm:inline">清空</span>';
                        this.dom.clearBtn.style.removeProperty('border-color');
                        this.dom.clearBtn.style.removeProperty('background');
                        this.dom.clearBtn.style.removeProperty('color');
                    }
                }, 5000);
                return;
            }
            if (this._pendingClearTimeout) { clearTimeout(this._pendingClearTimeout); this._pendingClearTimeout = null; }
            this._pendingClear = false;
            this.state.imageItems = [];
            this.dom.rectContainer.innerHTML = '';
            this.dom.rectContainer.appendChild(this.dom.domWatermark);
            this.dom.routeNumberInput.value = '';
            this.updateUIState();
            this._updateWatermarkVisibility();
            this.dom.rectContainer.style.width = '';
            this.dom.rectContainer.style.height = '';
            adjustContainerRatio(this.state.aspectRatio);
            if (typeof this.showSuccessToast === 'function') { this.showSuccessToast('已清空图片'); }
            if (this.dom && this.dom.clearBtn) {
                this.dom.clearBtn.innerHTML = '<i class="fa fa-trash"></i> <span class="hidden sm:inline">清空</span>';
                this.dom.clearBtn.style.removeProperty('border-color');
                this.dom.clearBtn.style.removeProperty('background');
                this.dom.clearBtn.style.removeProperty('color');
            }
        }
        deleteCurrentImage() {
            if (!this._pendingDelete) {
                this._pendingDelete = true;
                if (this.dom && this.dom.deleteSingleBtn) {
                    this.dom.deleteSingleBtn.innerHTML = '<i class="fa fa-exclamation-triangle"></i> <span class="hidden sm:inline">再次点击确认</span>';
                    this.dom.deleteSingleBtn.style.setProperty('border-color', 'rgb(225, 29, 72)', 'important');
                    this.dom.deleteSingleBtn.style.setProperty('background', 'rgb(225, 29, 72)', 'important');
                    this.dom.deleteSingleBtn.style.setProperty('color', '#fff', 'important');
                }
                if (this._pendingDeleteTimeout) { clearTimeout(this._pendingDeleteTimeout); }
                this._pendingDeleteTimeout = setTimeout(() => {
                    this._pendingDelete = false;
                    if (this.dom && this.dom.deleteSingleBtn) {
                        this.dom.deleteSingleBtn.innerHTML = '<i class="fa fa-trash"></i> <span class="hidden sm:inline">删除</span>';
                        this.dom.deleteSingleBtn.style.removeProperty('border-color');
                        this.dom.deleteSingleBtn.style.removeProperty('background');
                        this.dom.deleteSingleBtn.style.removeProperty('color');
                    }
                }, 5000);
                return;
            }
            if (this._pendingDeleteTimeout) { clearTimeout(this._pendingDeleteTimeout); this._pendingDeleteTimeout = null; }
            this._pendingDelete = false;
            if (typeof this.closeErrorToast === 'function') { this.closeErrorToast(); }
            this.state.imageItems.splice(this.state.currentPreviewIndex, 1);
            this.closeModal();
            this.showSuccessToast('图片已删除');
            if (this.state.imageItems.length > 0) {
                this.state.currentPreviewIndex = Math.min(this.state.currentPreviewIndex, this.state.imageItems.length - 1);
                this.calculateAndRenderRectangle();
            } else {
                this.updateUIState();
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

        _resetDownloadState() {
            this.state.isDownloading = false;
            this.dom.downloadBtn.innerHTML = '<i class="fa fa-download"></i> <span class="hidden sm:inline">下载</span>';
            this.dom.downloadOverlay.classList.add('hidden');
            this.dom.downloadOverlay.classList.remove('flex');
            this.dom.downloadProgressBar.style.width = '0%';
            this.dom.downloadProgressText.textContent = '正在等待浏览器渲染...';
            this.updateUIState();
        }

        async downloadRectangle() {
            if (this.state.isDownloading || this.state.imageItems.length === 0) return;
            const watermarkText = this.dom.routeNumberInput.value.trim();
            if (watermarkText === '') {
                this.updateUIState();
                return;
            }

            const qualityLevels = [3, 2, 1];
            const startIndex = qualityLevels.indexOf(this.state.renderQuality);
            const retryLevels = startIndex > -1
                ? qualityLevels.slice(startIndex)
                : [2, 1];

            this.state.isDownloading = true;
            this.dom.downloadOverlay.classList.remove('hidden');
            this.dom.downloadOverlay.classList.add('flex');
            this.updateUIState();

            let success = false;
            let lastError;
            const originalQuality = this.state.renderQuality;

            for (const quality of retryLevels) {
                try {
                    this.dom.downloadOverlay.querySelector('p:first-child').textContent =
                        `正在生成 ${quality}x 大图...`;
                    this.dom.downloadBtn.innerHTML =
                        `<i class="fa fa-spinner fa-spin"></i> <span>尝试 ${quality}x 清晰度</span>`;

                    this.state.renderQuality = quality;
                    document.querySelector(`input[name="renderQuality"][value="${quality}"]`).checked = true;
                    this.updateRatioButtonState(quality.toString(), 'renderQuality');

                    this.calculateAndRenderRectangle();
                    await new Promise(resolve => setTimeout(resolve, 500));

                    const targetElement = this.dom.rectContainer;
                    let dataUrl;
                    if (window.htmlToImage && typeof window.htmlToImage.toJpeg === 'function') {
                        dataUrl = await htmlToImage.toJpeg(targetElement, {
                            quality: this.CONFIG.JPEG_QUALITY,
                            pixelRatio: quality,
                            backgroundColor: '#ffffff',
                            fetch: { mode: 'no-cors' },
                            fontEmbedCSS: false,
                            useCORS: false
                        });
                    } else {
                        if (!window.html2canvas) {
                            try {
                                await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
                            } catch (e) {
                                try {
                                    await loadScript('https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js');
                                } catch (e2) {}
                            }
                        }
                        if (window.html2canvas) {
                            const canvas = await html2canvas(targetElement, {
                                backgroundColor: '#ffffff',
                                scale: quality,
                                useCORS: true,
                                allowTaint: true
                            });
                            dataUrl = canvas.toDataURL('image/jpeg', this.CONFIG.JPEG_QUALITY);
                        } else {
                            throw new Error('渲染库未加载');
                        }
                    }

                    const a = document.createElement('a');
                    a.href = dataUrl;
                    a.download = `${watermarkText}-S${quality}x-${Date.now()}.jpeg`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                    success = true;
                    this.showSuccessToast(`已使用 ${quality}x 清晰度下载成功`);
                    this.state.renderQuality = originalQuality;
                    const backRadio = document.querySelector(`input[name="renderQuality"][value="${originalQuality}"]`);
                    if (backRadio) backRadio.checked = true;
                    this.updateRatioButtonState(originalQuality.toString(), 'renderQuality');
                    break;
                } catch (error) {
                    lastError = error;
                    console.error(`Quality ${quality}x failed:`, error);
                }
            }

            if (!success) {
                this.showErrorToast(`下载失败：${lastError?.message || '未知错误'}`);
                this.state.renderQuality = originalQuality;
                const backRadio = document.querySelector(`input[name="renderQuality"][value="${originalQuality}"]`);
                if (backRadio) backRadio.checked = true;
                this.updateRatioButtonState(originalQuality.toString(), 'renderQuality');
            }

            this._resetDownloadState();
        }

        updateUIState() {
            const hasImages = this.state.imageItems.length > 0;
            const routeNumberEntered = this.dom.routeNumberInput.value.trim() !== '';
            const inputElement = this.dom.routeNumberInput;

            this.dom.imageContainerParent.classList.remove('hidden');
            if (hasImages) {
                this.dom.rectContainer.classList.remove('hidden');
                this.dom.emptyState.classList.add('hidden');
                this.dom.imageContainerParent.classList.remove('image-container-empty');
            } else {
                this.dom.rectContainer.classList.remove('hidden');
                this.dom.emptyState.classList.remove('hidden');
                this.dom.imageContainerParent.classList.add('image-container-empty');
                adjustContainerRatio(this.state.aspectRatio);
            }

            this.dom.regenerateBtn.disabled = !hasImages || this.state.isDownloading;
            this.dom.downloadBtn.disabled = !hasImages || this.state.isDownloading || !routeNumberEntered;
            this.dom.clearBtn.disabled = !hasImages || this.state.isDownloading;
            this.dom.fileInputTopBtn.classList.toggle('disabled', this.state.isDownloading);
            this.dom.fileInputTopBtn.style.opacity = this.state.isDownloading ? 0.6 : 1;

            if (!hasImages) {
                this.dom.downloadBtn.title = '请先添加图片';
            } else if (!routeNumberEntered) {
                this.dom.downloadBtn.title = '请输入线路编号';
            } else {
                this.dom.downloadBtn.removeAttribute('title');
            }

            if (hasImages && !routeNumberEntered && !this.state.isDownloading) {
                inputElement.classList.add('animate-pulse-primary', 'border-error');
            } else {
                inputElement.classList.remove('animate-pulse-primary', 'border-error');
            }
        }
    }

    window.addEventListener('load', function () {
        adjustContainerRatio('4:3');
    });

    window.galleryOptimizer = new GalleryOptimizer();

    const START_YEAR = 2024;
    const currentYear = new Date().getFullYear();
    const yearString = currentYear > START_YEAR ? `${START_YEAR}-${currentYear}` : `${START_YEAR}`;
    document.getElementById('copyrightFooter').textContent = `${yearString} | it王工@深高园24级创新线长`;

});
window.addEventListener('resize', function () {
    const rectContainer = document.getElementById('rectContainer');
    if (rectContainer) {
        rectContainer.style.width = 'auto';
        setTimeout(() => {
            rectContainer.style.margin = '0 auto';
            rectContainer.offsetHeight;
            if (window.galleryOptimizer && typeof window.galleryOptimizer._updateWatermarkVisibility === 'function') {
                window.galleryOptimizer._updateWatermarkVisibility();
            }
        }, 50);
    }
});
