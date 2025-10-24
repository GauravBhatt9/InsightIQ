document.addEventListener('DOMContentLoaded', () => {

    // --- UPLOAD PAGE LOGIC (Self-contained, no changes) ---
    const uploadForm = document.getElementById('upload-form');
    if (uploadForm) {
        const fileDropArea = document.getElementById('file-drop-area');
        const fileInput = document.getElementById('fileInput');
        const fileNameDisplay = document.querySelector('.file-name-display');
        const submitBtn = document.querySelector('.submit-btn');

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            fileDropArea.addEventListener(eventName, preventDefaults, false);
        });
        ['dragenter', 'dragover'].forEach(eventName => {
            fileDropArea.addEventListener(eventName, () => fileDropArea.classList.add('is-active'), false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            fileDropArea.addEventListener(eventName, () => fileDropArea.classList.remove('is-active'), false);
        });
        fileDropArea.addEventListener('drop', e => {
            fileInput.files = e.dataTransfer.files;
            handleFiles(fileInput.files);
        }, false);
        fileInput.addEventListener('change', e => handleFiles(e.target.files));

        function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

        function handleFiles(files) {
            if (files.length > 0) {
                fileNameDisplay.textContent = `Selected: ${files[0].name}`;
                fileDropArea.classList.add('has-file');
                submitBtn.disabled = false;
            } else {
                fileNameDisplay.textContent = '';
                fileDropArea.classList.remove('has-file');
                submitBtn.disabled = true;
            }
        }

        uploadForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData();
            const file = fileInput.files[0];
            if (!file) { alert('Please select a file first.'); return; }
            formData.append('file', file);
            submitBtn.textContent = 'Uploading...';
            submitBtn.disabled = true;

            fetch('/upload', { method: 'POST', body: formData })
            .then(response => response.json())
            .then(data => {
                if (data.redirect) { window.location.href = data.redirect; }
                else if (data.error) {
                    alert(`Upload failed: ${data.error}`);
                    submitBtn.textContent = 'Upload & Analyze';
                    submitBtn.disabled = false;
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('An unexpected error occurred. Please try again.');
                submitBtn.textContent = 'Upload & Analyze';
                submitBtn.disabled = false;
            });
        });
    }

    // --- MULTI-CHART DASHBOARD BUILDER LOGIC ---
    const biContainer = document.querySelector('.bi-builder-container');
    if (biContainer) {
        
        // --- PLUGIN REGISTRATION (For Trend Lines) ---
        if (typeof chartJsRegression !== 'undefined') {
            try {
                Chart.register(chartJsRegression);
            } catch (e) { console.error('Error registering regression plugin:', e); }
        } else {
            console.warn('Chart.js regression plugin not found. Trend lines will not be available.');
        }

        // --- STATE & DOM ELEMENTS ---
        const biCanvas = document.getElementById('bi-canvas');
        const vizIcons = document.querySelectorAll('.viz-icon');
        const wellsContainer = document.getElementById('viz-config-wells');
        const mainPlaceholder = document.querySelector('.canvas-placeholder');
        let activeChartModule = null; 
        let chartIdCounter = 0;
        const chartInstances = {}; // Stores Chart.js instances { chartId: instance }

        // --- NEW: MODAL CONTROL LOGIC ---
        const insightsModal = document.getElementById('insights-modal');
        const modalBody = document.getElementById('modal-body');
        const closeModalBtn = insightsModal.querySelector('.close-btn');

        function showInsightsModal(htmlContent) {
            modalBody.innerHTML = htmlContent;
            insightsModal.style.display = 'flex';
        }

        function hideInsightsModal() {
            insightsModal.style.display = 'none';
        }

        // Event listeners to close the modal
        closeModalBtn.addEventListener('click', hideInsightsModal);
        insightsModal.addEventListener('click', (e) => {
            if (e.target === insightsModal) { // Only if clicking the dark background
                hideInsightsModal();
            }
        });


        // --- INITIAL SETUP & EVENT LISTENERS ---
        checkMainPlaceholderVisibility();

        vizIcons.forEach(icon => icon.addEventListener('click', () => createNewChartModule(icon.dataset.chartType)));

        document.querySelectorAll('.field-item').forEach(field => {
            field.addEventListener('dragstart', e => {
                e.dataTransfer.setData('text/plain', e.target.dataset.columnName);
                window.draggingFieldType = e.target.dataset.columnType;
            });
        });

        // UPDATED: Consolidated click listener for the canvas area
        biCanvas.addEventListener('click', async (e) => {
            const chartModule = e.target.closest('.chart-module');
            
            if (e.target.matches('.delete-chart-btn')) {
                if(chartModule) deleteChartModule(chartModule);
            } else if (e.target.matches('.analyze-chart-btn')) {
                if(chartModule) await getChartAnalysis(chartModule);
            } else if (chartModule) {
                setActiveChart(chartModule);
            }
        });
        
        addWellEventListeners();

        // --- CORE DASHBOARD & SIDEBAR FUNCTIONS ---
        function createNewChartModule(chartType) {
            const template = document.getElementById('chart-module-template');
            const newModule = template.content.firstElementChild.cloneNode(true);
            const newChartId = `chart-${chartIdCounter++}`;
            newModule.id = newChartId;
            newModule.dataset.chartType = chartType;
            newModule.dataset.config = JSON.stringify({});
            newModule.querySelector('.chart-title').textContent = `${chartType.charAt(0).toUpperCase() + chartType.slice(1)} Chart`;
            biCanvas.appendChild(newModule);
            checkMainPlaceholderVisibility();
            setActiveChart(newModule);
        }

        function deleteChartModule(module) {
            const chartId = module.id;
            if (chartInstances[chartId]) {
                chartInstances[chartId].destroy();
                delete chartInstances[chartId];
            }
            if (activeChartModule === module) {
                activeChartModule = null;
                wellsContainer.innerHTML = '<p class="wells-placeholder">Add a new chart or select one to configure it.</p>';
            }
            module.remove();
            checkMainPlaceholderVisibility();
        }
        
        function setActiveChart(module) {
            if (activeChartModule === module) return;
            if (activeChartModule) {
                activeChartModule.classList.remove('is-active');
            }
            activeChartModule = module;
            activeChartModule.classList.add('is-active');
            updateSidebarForActiveChart();
        }

        function checkMainPlaceholderVisibility() {
            if (mainPlaceholder) {
                mainPlaceholder.style.display = biCanvas.querySelector('.chart-module') ? 'none' : 'flex';
            }
        }

        function updateSidebarForActiveChart() {
            if (!activeChartModule) return;
            const chartType = activeChartModule.dataset.chartType;
            const template = document.getElementById(`${chartType}-wells-template`);
            if (!template) {
                wellsContainer.innerHTML = '<p class="wells-placeholder">Configuration not available.</p>';
                return;
            }
            wellsContainer.innerHTML = '';
            wellsContainer.appendChild(template.content.cloneNode(true));
            const config = JSON.parse(activeChartModule.dataset.config);
            restoreWellsFromConfig(config);
        }

        function restoreWellsFromConfig(config) {
            Object.keys(config).forEach(key => {
                const well = wellsContainer.querySelector(`[data-well-type="${key}"]`);
                if (well && typeof config[key] === 'string') {
                    updateWellContent(well, config[key], key, false);
                }
            });
            const aggSelect = wellsContainer.querySelector('[name="agg_func"]');
            if (aggSelect && config.agg_func) aggSelect.value = config.agg_func;
            const showLineCheckbox = wellsContainer.querySelector('[name="showLine"]');
            if (showLineCheckbox && typeof config.showLine === 'boolean') showLineCheckbox.checked = config.showLine;
            const binsInput = wellsContainer.querySelector('[name="bins"]');
            if (binsInput && config.bins) binsInput.value = config.bins;
        }

        function addWellEventListeners() {
            wellsContainer.addEventListener('dragover', e => {
                e.preventDefault();
                const well = e.target.closest('.config-well');
                if (well && (!well.dataset.accepts || window.draggingFieldType === well.dataset.accepts)) {
                    well.classList.add('drag-over');
                }
            });
            wellsContainer.addEventListener('dragleave', e => {
                const well = e.target.closest('.config-well');
                if (well) well.classList.remove('drag-over');
            });
            wellsContainer.addEventListener('drop', e => {
                e.preventDefault();
                const well = e.target.closest('.config-well');
                if (!well || !activeChartModule) return;
                well.classList.remove('drag-over');
                const acceptsType = well.dataset.accepts;
                if (acceptsType && window.draggingFieldType !== acceptsType) {
                    alert(`This well only accepts ${acceptsType} fields.`);
                    return;
                }
                const columnName = e.dataTransfer.getData('text/plain');
                updateWellContent(well, columnName, well.dataset.wellType, true);
            });
            wellsContainer.addEventListener('change', e => {
                if(e.target.matches('select, input')) {
                    triggerChartUpdateForActiveModule();
                }
            });
            wellsContainer.addEventListener('click', e => {
                if (e.target.matches('.remove-field')) {
                    const wellType = e.target.dataset.wellType;
                    const well = e.target.closest('.config-well');
                    const originalTitle = well.querySelector('.well-title').innerText;
                    well.innerHTML = `<span class="well-title">${originalTitle}</span>`;
                    if(activeChartModule) {
                        const config = JSON.parse(activeChartModule.dataset.config);
                        delete config[wellType];
                        activeChartModule.dataset.config = JSON.stringify(config);
                        triggerChartUpdateForActiveModule();
                    }
                }
            });
        }
        
        function updateWellContent(well, columnName, wellType, shouldTriggerUpdate) {
             well.innerHTML = `
                <span class="well-title">${well.querySelector('.well-title').innerText}</span>
                <div class="well-content">
                    <span>${columnName}</span>
                    <span class="remove-field" data-well-type="${wellType}">&times;</span>
                </div>
            `;
            if (shouldTriggerUpdate) {
                triggerChartUpdateForActiveModule();
            }
        }
        
        // --- CHART GENERATION AND RENDERING ---
        async function triggerChartUpdateForActiveModule() {
            if (!activeChartModule) return;
            const chartType = activeChartModule.dataset.chartType;
            const currentConfig = { chartType };
            wellsContainer.querySelectorAll('.config-well').forEach(well => {
                const content = well.querySelector('.well-content > span:first-child');
                if (content) {
                    currentConfig[well.dataset.wellType] = content.textContent;
                }
            });
            wellsContainer.querySelectorAll('select, input').forEach(input => {
                const name = input.name;
                if(name) {
                    currentConfig[name] = (input.type === 'checkbox') ? input.checked : input.value;
                }
            });
            activeChartModule.dataset.config = JSON.stringify(currentConfig);
            let requiredFields = [];
            switch (chartType) {
                case 'pie': case 'doughnut': requiredFields = ['category', 'values']; break;
                case 'histogram': requiredFields = ['column']; break;
                default: requiredFields = ['x_axis', 'y_axis'];
            }
            if (!requiredFields.every(key => key in currentConfig)) {
                renderChartInModule(activeChartModule, null, 'Please add fields to all required wells.');
                return;
            }
            try {
                const response = await fetch('/api/generate-chart', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(currentConfig)
                });
                const responseData = await response.json();
                if (!response.ok) throw new Error(responseData.error || 'Failed to fetch chart data');
                renderChartInModule(activeChartModule, responseData);
            } catch (error) {
                console.error('Chart update failed:', error);
                renderChartInModule(activeChartModule, null, `Error: ${error.message}`);
            }
        }

        function renderChartInModule(module, chartData, message = '') {
            const chartId = module.id;
            const chartBody = module.querySelector('.chart-body');
            const chartType = module.dataset.chartType;
            if (chartInstances[chartId]) {
                chartInstances[chartId].destroy();
                delete chartInstances[chartId];
            }
            chartBody.innerHTML = '';
            if (message) {
                chartBody.innerHTML = `<p class="chart-placeholder-text" style="${message.startsWith('Error') ? 'color:red;' : ''}">${message}</p>`;
                return;
            }
            const canvas = document.createElement('canvas');
            chartBody.appendChild(canvas);
            const ctx = canvas.getContext('2d');
            const config = JSON.parse(module.dataset.config);
            let finalChartType = chartType === 'histogram' ? 'bar' : chartType;
            let options = { 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: {}
            };
            
            if (chartType === 'scatter' && config.showLine) {
                chartData.datasets.forEach(dataset => {
                    dataset.showLine = true;
                    dataset.trendlineLinear = {
                        style: "rgba(220, 53, 69, 0.8)",
                        lineStyle: "dotted",
                        width: 2
                    };
                });
            } else if (chartType === 'pie' || chartType === 'doughnut') {
                options.plugins.legend = { position: 'top' };
            } else if (chartType === 'histogram') {
                chartData.datasets[0].barPercentage = 1.0;
                chartData.datasets[0].categoryPercentage = 1.0;
                options.scales = { x: { grid: { offset: false } }, y: { beginAtZero: true } };
            } else { // Bar, Line, etc.
                options.scales = { y: { beginAtZero: true } };
            }
            
            chartInstances[chartId] = new Chart(ctx, {
                type: finalChartType,
                data: chartData,
                options: options
            });
        }

        // --- NEW: AI CHART ANALYSIS FUNCTION ---
        async function getChartAnalysis(module) {
            const chartId = module.id;
            const chartInstance = chartInstances[chartId];
            const analyzeBtn = module.querySelector('.analyze-chart-btn');

            if (!chartInstance) {
                alert('Cannot analyze. The chart is not fully rendered.');
                return;
            }

            // 1. Show the modal with a loading state
            showInsightsModal('<p class="loading-text">🤖 Analyzing, please wait...</p>');
            analyzeBtn.disabled = true;

            try {
                // 2. Get chart image as a Base64 Data URL
                const imageDataUrl = chartInstance.canvas.toDataURL('image/png');

                // 3. Send to backend API
                const response = await fetch('/api/analyze-chart', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image_data_url: imageDataUrl })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to get analysis.');
                }

                // 4. Update the modal with the successful result
                // Replace newlines with <br> for proper HTML rendering
                const formattedInsight = data.insight.replace(/\n/g, '<br>');
                showInsightsModal(`<h5>AI Insights:</h5><div>${formattedInsight}</div>`);

            } catch (error) {
                console.error('Analysis failed:', error);
                // 5. Update the modal with the error message
                showInsightsModal(`<p class="error-text" style="color: red;"><b>Error:</b> ${error.message}</p>`);
            } finally {
                // 6. Re-enable the button regardless of outcome
                analyzeBtn.disabled = false;
            }
        }
    }
});