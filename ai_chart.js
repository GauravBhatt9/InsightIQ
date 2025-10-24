
document.addEventListener('DOMContentLoaded', () => {
    // Ensure this script only runs on the AI Chart page
    const aiChartPage = document.getElementById('ai-chart-page');
    if (!aiChartPage) return;

    // --- DOM ELEMENT SELECTORS ---
    const generateDashboardBtn = document.getElementById('generate-dashboard-btn');
    const generateFromPromptBtn = document.getElementById('generate-from-prompt-btn');
    const promptInput = document.getElementById('ai-prompt-input');
    const chartGrid = document.getElementById('ai-chart-grid');
    const suggestionPillsContainer = document.getElementById('suggestion-pills');

    // --- STATE MANAGEMENT ---
    let activeCharts = []; // To keep track of created Chart.js instances

    // --- EVENT LISTENERS ---
    generateDashboardBtn.addEventListener('click', handleGenerateDashboard);
    generateFromPromptBtn.addEventListener('click', handleGenerateFromPrompt);
    promptInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleGenerateFromPrompt();
        }
    });
    
    // Only add event listener if the element exists
    if (suggestionPillsContainer) {
        suggestionPillsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('suggestion-pill')) {
                promptInput.value = e.target.dataset.prompt;
                handleGenerateFromPrompt();
            }
        });
    }
    // In ai_chart.js, add this to your event listeners section

chartGrid.addEventListener('click', async (e) => {
    const insightBtn = e.target.closest('.insight-btn');
    if (!insightBtn) return; // Exit if not the insight button

    const module = insightBtn.closest('.chart-module');
    const footer = module.querySelector('.chart-footer');
    const canvas = module.querySelector('canvas'); // <-- Get the canvas element

    if (!canvas) {
        console.error("Could not find canvas element for insight generation.");
        return;
    }
    
    insightBtn.disabled = true;
    footer.innerHTML = `<span class="loading-insight">Analyzing image...</span>`;

    try {
        // Convert the canvas to a base64 image data URL
        const imageData = canvas.toDataURL('image/png');

        const response = await fetch('/api/get-chart-insight', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Send the image data in the payload
            body: JSON.stringify({ imageData: imageData }) 
        });

        if (!response.ok) {
            const errorResult = await response.json();
            throw new Error(errorResult.error || 'Server error');
        }

        const result = await response.json();

        if (result.error) throw new Error(result.error);
        
        footer.innerHTML = `<p class="ai-insight"><i class="fa-solid fa-sparkles"></i> ${result.insight}</p>`;

    } catch (error) {
        footer.innerHTML = `<p class="error-insight">Failed to get insight: ${error.message}</p>`;
    } finally {
        insightBtn.disabled = false;
    }
});

    // --- CORE LOGIC FUNCTIONS ---

    /**
     * Handles the "Let AI Build a Dashboard" button click.
     * Fetches multiple chart configurations and renders them.
     */
    async function handleGenerateDashboard() {
        setLoadingState('Generating AI dashboard suggestions...');
        try {
            const response = await fetch('/api/get-ai-dashboard-configs', { method: 'POST' });
            const configs = await response.json();

            if (configs.error) throw new Error(configs.error);
            if (!configs || configs.length === 0) {
                renderError('The AI did not return any valid chart suggestions for this dataset.');
                return;
            }
            
            clearCharts();
            setStatusMessage(`Received ${configs.length} suggestions. Generating charts...`);

            // Generate all charts concurrently for better performance
            await Promise.all(configs.map(config => generateAndDisplayChart(config)));
            
            clearStatusMessage(); // Remove status on success

        } catch (error) {
            console.error('Error generating dashboard:', error);
            renderError(error.message);
        }
    }

    /**
     * Handles the "Generate Chart" button click for a single prompt.
     */
    async function handleGenerateFromPrompt() {
        const prompt = promptInput.value.trim();
        if (!prompt) {
            alert('Please enter a prompt.');
            return;
        }

        setLoadingState(`Generating chart for: "${prompt}"`);
        try {
            // Step 1: Get the chart configuration from the AI based on the prompt
            const configResponse = await fetch('/api/get-ai-chart-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });
            const config = await configResponse.json();
            if (config.error) throw new Error(config.error);
            
            clearCharts();
            await generateAndDisplayChart(config);
            clearStatusMessage();

        } catch (error) {
            console.error('Error generating from prompt:', error);
            renderError(error.message);
        }
    }

    /**
     * A versatile function that takes a chart config, fetches its data, and renders it.
     * @param {object} config - The chart configuration from the AI.
     */
    async function generateAndDisplayChart(config) {
        try {
            // Step 2: Get the actual plottable data from the server using the AI's config
            const dataResponse = await fetch('/api/generate-chart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            const chartData = await dataResponse.json();
            if (chartData.error) throw new Error(chartData.error);

            createChart(config, chartData);
        } catch (error) {
            console.error(`Failed to generate chart for "${config.title || 'untitled'}":`, error);
            // Render an error message specifically for this chart instead of stopping everything
            const errorModule = document.createElement('div');
            errorModule.className = 'chart-module error';
            errorModule.innerHTML = `
                <div class="chart-header">
                    <h5 class="chart-title">Error: ${config.title || 'Chart Failed'}</h5>
                </div>
                <div class="chart-body">
                    <p>${error.message}</p>
                </div>`;
            chartGrid.appendChild(errorModule);
        }
    }

    // --- UI HELPER FUNCTIONS ---

    /**
     * Draws the chart on a canvas inside a styled module.
     * @param {object} config - The chart configuration (for title).
     * @param {object} data - The plottable data from Chart.js.
     */
    function createChart(config, data) {
    const module = document.createElement('div');
    module.className = 'chart-module';
    // Store the config and data on the element for later use by the insight button
    module.dataset.config = JSON.stringify(config);
    module.dataset.chartdata = JSON.stringify(data);

    module.innerHTML = `
        <div class="chart-header">
            <h5 class="chart-title">${config.title || 'AI Generated Chart'}</h5>
            <button class="insight-btn" title="Get AI Insight">
                <i class="fa-solid fa-lightbulb"></i>
            </button>
        </div>
        <div class="chart-body">
            <canvas></canvas>
        </div>
        <div class="chart-footer">
            <!-- AI Insight will be loaded here -->
        </div>
    `;
    chartGrid.appendChild(module);
    
    const canvas = module.querySelector('canvas');
    const chart = new Chart(canvas, {
        type: config.chartType,
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
    activeCharts.push(chart);
}

    /** Destroys old charts and clears the grid container. */
    function clearCharts() {
        activeCharts.forEach(chart => chart.destroy());
        activeCharts = [];
        chartGrid.innerHTML = '';
    }
    
    /** Sets the grid to a loading state. */
    function setLoadingState(message) {
        clearCharts();
        chartGrid.innerHTML = `<div class="status-message loading">${message}</div>`;
    }

    /** Renders a prominent error message in the grid. */
    function renderError(message) {
        clearCharts();
        chartGrid.innerHTML = `<div class="status-message error"><strong>Error:</strong> ${message}</div>`;
    }

    /** Displays a simple status message. */
    function setStatusMessage(message) {
        const statusEl = document.createElement('div');
        statusEl.className = 'status-message';
        statusEl.textContent = message;
        chartGrid.prepend(statusEl);
    }

    /** Removes any status message from the grid. */
    function clearStatusMessage() {
        const statusEl = chartGrid.querySelector('.status-message');
        if (statusEl && !statusEl.classList.contains('error')) {
            statusEl.remove();
        }
    }

    // Immediately make all elements with data-scroll-anim visible for testing
    document.querySelectorAll('[data-scroll-anim]').forEach(el => {
        el.classList.add('is-visible');
    });

    // Find all elements that are marked for animation
    const animatedElements = document.querySelectorAll('[data-scroll-anim]');

    // Create an observer
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            // If the element is in the viewport
            if (entry.isIntersecting) {
                // Get the delay from the data-delay attribute, default to 0
                const delay = entry.target.dataset.delay || 0;

                // Apply the animation after the specified delay
                setTimeout(() => {
                    entry.target.classList.add('is-visible');
                }, delay);

                // Stop observing the element once it has been animated
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1 // Trigger when 10% of the element is visible
    });

    // Start observing each animated element
    animatedElements.forEach(el => {
        observer.observe(el);
    });
});