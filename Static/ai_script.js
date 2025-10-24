document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element Selection ---
    const promptForm = document.getElementById('ai-prompt-form');
    const promptInput = document.getElementById('ai-prompt-input');
    const dashboardBtn = document.getElementById('ai-dashboard-btn');
    const grid = document.getElementById('ai-dashboard-grid');
    const placeholder = grid.querySelector('.canvas-placeholder');

    // --- State Management ---
    const chartInstances = {}; // To store and manage Chart.js instances
    let chartIdCounter = 0;

    // --- Event Listeners ---

    // Handle single chart generation via the text prompt form
    promptForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const prompt = promptInput.value.trim();
        if (!prompt) return; // Do nothing if input is empty

        setLoadingState('Generating your chart...');
        await generateSingleChart(prompt);
        promptInput.value = ''; // Clear the input field after submission
    });

    // Handle the "Auto-Generate Dashboard" button click
    dashboardBtn.addEventListener('click', async () => {
        setLoadingState('Building your AI dashboard, please wait...');
        grid.innerHTML = ''; // Clear any existing charts before building a new dashboard
        await generateAIDashboard();
    });
    
    // Use event delegation to handle clicks on delete buttons for dynamically added charts
    grid.addEventListener('click', e => {
        if (e.target.matches('.delete-chart-btn')) {
            const module = e.target.closest('.chart-module');
            if (module) {
                deleteChartModule(module);
            }
        }
    });

    // --- Core API & Logic Functions ---

    /**
     * Generates a single chart based on a user's text prompt.
     * @param {string} prompt The user's natural language question.
     */
    async function generateSingleChart(prompt) {
        try {
            // Step 1: Call the backend to get a chart configuration JSON from the AI
            const configResponse = await fetch('/api/get-ai-chart-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });
            const chartConfig = await configResponse.json();
            if (!configResponse.ok) {
                throw new Error(chartConfig.error || 'The AI could not create a chart configuration.');
            }

            // Step 2: Use the received config to call the data generation endpoint
            const dataResponse = await fetch('/api/generate-chart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(chartConfig)
            });
            const chartData = await dataResponse.json();
            if (!dataResponse.ok) {
                throw new Error(chartData.error || 'The backend could not generate data for this chart.');
            }
            
            // Step 3: If both calls succeed, render the chart on the page
            renderChart(chartConfig, chartData);

        } catch (error) {
            console.error(error);
            showError(error.message);
        }
    }

    /**
     * Calls the backend to get multiple chart configurations and renders them as a dashboard.
     */
    async function generateAIDashboard() {
        try {
            // Step 1: Get an array of chart configurations from the AI
            const configsResponse = await fetch('/api/get-ai-dashboard-configs', { method: 'POST' });
            const dashboardConfigs = await configsResponse.json();
            if (!configsResponse.ok) {
                throw new Error(dashboardConfigs.error || 'The AI failed to generate a dashboard.');
            }
            
            if (placeholder) placeholder.style.display = 'none';

            // Step 2: Loop through each configuration and generate its chart
            for (const chartConfig of dashboardConfigs) {
                try {
                    const dataResponse = await fetch('/api/generate-chart', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(chartConfig)
                    });
                    if (dataResponse.ok) {
                        const chartData = await dataResponse.json();
                        renderChart(chartConfig, chartData);
                    } else {
                        // Log a warning but don't stop the whole dashboard from rendering
                        console.warn('Skipping a chart due to data generation error.', await dataResponse.json());
                    }
                } catch (chartError) {
                    console.error("Could not render one of the dashboard charts:", chartError);
                }
            }
        } catch (error) {
            console.error(error);
            showError(error.message);
        }
    }

    // --- Helper & UI Rendering Functions ---

    /**
     * Creates a chart module, canvas, and Chart.js instance on the page.
     * @param {object} config The chart configuration (for title, chartType).
     * @param {object} data The data for Chart.js (labels, datasets).
     */
    function renderChart(config, data) {
        if (placeholder) placeholder.style.display = 'none';

        const template = document.getElementById('chart-module-template');
        const module = template.content.firstElementChild.cloneNode(true);
        const chartId = `ai-chart-${chartIdCounter++}`;
        module.id = chartId;
        module.querySelector('.chart-title').textContent = config.title || 'AI Generated Chart';
        
        const chartBody = module.querySelector('.chart-body');
        const canvas = document.createElement('canvas');
        chartBody.appendChild(canvas);
        grid.appendChild(module);
        
        const chartType = config.chartType === 'histogram' ? 'bar' : config.chartType;
        
        // Store the new chart instance so we can destroy it later if deleted
        chartInstances[chartId] = new Chart(canvas.getContext('2d'), {
            type: chartType,
            data: data,
            options: { 
                responsive: true, 
                maintainAspectRatio: false 
            }
        });
    }

    /**
     * Destroys a chart instance and removes its module from the DOM.
     * @param {HTMLElement} module The chart module element to remove.
     */
    function deleteChartModule(module) {
        const chartId = module.id;
        // Properly destroy the Chart.js instance to free up memory
        if (chartInstances[chartId]) {
            chartInstances[chartId].destroy();
            delete chartInstances[chartId];
        }
        module.remove(); // Remove the element from the page
        
        // If the grid is now empty, show the placeholder again
        if (grid.children.length === 0) {
            if (placeholder) {
                 placeholder.innerHTML = `<h3>Your AI-generated charts will appear here.</h3><p>Use the prompt bar above to get started.</p>`;
                 placeholder.style.display = 'flex';
            }
        }
    }
    
    /**
     * Displays a loading message in the placeholder area.
     * @param {string} message The loading message to display.
     */
    function setLoadingState(message) {
        if (placeholder) {
            placeholder.innerHTML = `<h3>${message}</h3>`;
            placeholder.style.display = 'flex';
        }
    }
    
    /**
     * Displays an error message in the placeholder area.
     * @param {string} message The error message to display.
     */
    function showError(message) {
        if (placeholder) {
            placeholder.innerHTML = `<h3 style="color: red;">Error: ${message}</h3>`;
            placeholder.style.display = 'flex';
        }
    }
});