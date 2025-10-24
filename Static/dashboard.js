document.addEventListener('DOMContentLoaded', () => {
    const biContainer = document.querySelector('.bi-builder-container');
    if (!biContainer) return; // Exit if not on the dashboard page

    // --- PLUGIN REGISTRATION (For Trend Lines) ---
    if (typeof chartJsRegression !== 'undefined') {
        try {
            Chart.register(chartJsRegression);
        } catch (e) {
            console.error('Error registering regression plugin:', e);
        }
    } else {
        console.warn('Chart.js regression plugin not found. Trend lines will not be available.');
    }

    // --- STATE & DOM ELEMENTS ---
    const biCanvas = document.getElementById('bi-canvas');
    const vizIcons = document.querySelectorAll('.viz-icon');
    const wellsContainer = document.getElementById('viz-config-wells');
    const mainPlaceholder = document.querySelector('.canvas-placeholder');
    const insightsModal = document.getElementById('insights-modal');
    const modalBody = document.getElementById('modal-body');
    const closeModalBtn = insightsModal.querySelector('.close-btn');

    let activeChartModule = null;
    let chartIdCounter = 0;
    const chartInstances = {}; // Stores Chart.js instances { chartId: instance }

    // --- INITIAL SETUP & EVENT LISTENERS ---
    initializeDashboard();

    function initializeDashboard() {
        checkMainPlaceholderVisibility();
        addEventListeners();
    }

    function addEventListeners() {
        vizIcons.forEach(icon => icon.addEventListener('click', () => createNewChartModule(icon.dataset.chartType)));

        document.querySelectorAll('.field-item').forEach(field => {
            field.addEventListener('dragstart', handleFieldDragStart);
        });

        biCanvas.addEventListener('click', handleCanvasClick);
        addWellEventListeners();

        // Modal closing events
        closeModalBtn.addEventListener('click', hideInsightsModal);
        insightsModal.addEventListener('click', (e) => {
            if (e.target === insightsModal) hideInsightsModal();
        });
    }

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


    // --- EVENT HANDLERS ---

    function handleFieldDragStart(e) {
        e.dataTransfer.setData('text/plain', e.target.dataset.columnName);
        window.draggingFieldType = e.target.dataset.columnType;
    }

    async function handleCanvasClick(e) {
        const chartModule = e.target.closest('.chart-module');
        if (!chartModule) return;

        if (e.target.matches('.delete-chart-btn')) {
            deleteChartModule(chartModule);
        } else if (e.target.matches('.analyze-chart-btn')) {
            await getChartAnalysis(chartModule);
        } else {
            setActiveChart(chartModule);
        }
    }

    function addWellEventListeners() {
        // Use event delegation on the static container
        wellsContainer.addEventListener('dragover', handleWellDragOver);
        wellsContainer.addEventListener('dragleave', handleWellDragLeave);
        wellsContainer.addEventListener('drop', handleWellDrop);
        wellsContainer.addEventListener('change', handleWellInputChange);
        wellsContainer.addEventListener('click', handleWellClick);
    }

    function handleWellDragOver(e) {
        e.preventDefault();
        const well = e.target.closest('.config-well');
        if (well && (!well.dataset.accepts || window.draggingFieldType === well.dataset.accepts)) {
            well.classList.add('drag-over');
        }
    }

    function handleWellDragLeave(e) {
        const well = e.target.closest('.config-well');
        if (well) well.classList.remove('drag-over');
    }

    function handleWellDrop(e) {
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
    }

    function handleWellInputChange(e) {
        if (e.target.matches('select, input')) {
            triggerChartUpdateForActiveModule();
        }
    }
    
    function handleWellClick(e) {
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

    // --- CHART GENERATION AND API CALLS ---

    async function triggerChartUpdateForActiveModule() {
        if (!activeChartModule) return;
        const chartType = activeChartModule.dataset.chartType;
        const currentConfig = buildConfigFromWells(chartType);
        
        activeChartModule.dataset.config = JSON.stringify(currentConfig);

        if (!isConfigComplete(chartType, currentConfig)) {
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
    
    function buildConfigFromWells(chartType) {
        const config = { chartType };
        wellsContainer.querySelectorAll('.config-well').forEach(well => {
            const content = well.querySelector('.well-content > span:first-child');
            if (content) {
                config[well.dataset.wellType] = content.textContent;
            }
        });
        wellsContainer.querySelectorAll('select, input').forEach(input => {
            if (input.name) {
                config[input.name] = (input.type === 'checkbox') ? input.checked : input.value;
            }
        });
        return config;
    }
    
    function isConfigComplete(chartType, config) {
        let requiredFields = [];
        switch (chartType) {
            case 'pie': case 'doughnut': requiredFields = ['category', 'values']; break;
            case 'histogram': requiredFields = ['column']; break;
            default: requiredFields = ['x_axis', 'y_axis'];
        }
        return requiredFields.every(key => key in config);
    }

    function renderChartInModule(module, chartData, message = '') {
        const chartId = module.id;
        const chartBody = module.querySelector('.chart-body');
        
        if (chartInstances[chartId]) {
            chartInstances[chartId].destroy();
            delete chartInstances[chartId];
        }
        chartBody.innerHTML = '';
        
        if (message) {
            const messageColor = message.startsWith('Error') ? 'color:red;' : '';
            chartBody.innerHTML = `<p class="chart-placeholder-text" style="${messageColor}">${message}</p>`;
            return;
        }

        const canvas = document.createElement('canvas');
        chartBody.appendChild(canvas);
        
        const config = JSON.parse(module.dataset.config);
        const { type, options } = getChartJsConfig(module.dataset.chartType, config, chartData);

        chartInstances[chartId] = new Chart(canvas.getContext('2d'), {
            type: type,
            data: chartData,
            options: options
        });
    }
    
    function getChartJsConfig(chartType, userConfig, chartData) {
        let type = chartType === 'histogram' ? 'bar' : chartType;
        let options = { responsive: true, maintainAspectRatio: false, plugins: {} };

        if (chartType === 'scatter' && userConfig.showLine) {
            chartData.datasets.forEach(dataset => {
                dataset.showLine = true;
                dataset.trendlineLinear = { style: "rgba(220, 53, 69, 0.8)", lineStyle: "dotted", width: 2 };
            });
        } else if (['pie', 'doughnut'].includes(chartType)) {
            options.plugins.legend = { position: 'top' };
        } else if (chartType === 'histogram') {
            chartData.datasets[0].barPercentage = 1.0;
            chartData.datasets[0].categoryPercentage = 1.0;
            options.scales = { x: { grid: { offset: false } }, y: { beginAtZero: true } };
        } else {
            options.scales = { y: { beginAtZero: true } };
        }
        return { type, options };
    }


    async function getChartAnalysis(module) {
        const chartInstance = chartInstances[module.id];
        const analyzeBtn = module.querySelector('.analyze-chart-btn');

        if (!chartInstance) {
            alert('Cannot analyze. The chart is not fully rendered.');
            return;
        }
        
        showInsightsModal('<p class="loading-text">🤖 Analyzing, please wait...</p>');
        analyzeBtn.disabled = true;

        try {
            const imageDataUrl = chartInstance.canvas.toDataURL('image/png');
            const response = await fetch('/api/analyze-chart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_data_url: imageDataUrl })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to get analysis.');
            
            const formattedInsight = data.insight.replace(/\n/g, '<br>');
            showInsightsModal(`<h5>AI Insights:</h5><div>${formattedInsight}</div>`);
        } catch (error) {
            console.error('Analysis failed:', error);
            showInsightsModal(`<p class="error-text" style="color: red;"><b>Error:</b> ${error.message}</p>`);
        } finally {
            analyzeBtn.disabled = false;
        }
    }
    
    // --- MODAL UTILITY FUNCTIONS ---
    function showInsightsModal(htmlContent) {
        modalBody.innerHTML = htmlContent;
        insightsModal.style.display = 'flex';
    }

    function hideInsightsModal() {
        insightsModal.style.display = 'none';
    }

});