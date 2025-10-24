document.addEventListener('DOMContentLoaded', () => {
    // --- DOM ELEMENT SELECTORS ---
    // Get all the interactive elements from the page
    const generateBtn = document.getElementById('generate-summary-btn');
    const downloadBtn = document.getElementById('download-summary-btn');
    const resultContainer = document.getElementById('summary-result-container');

    // --- STATE MANAGEMENT ---
    // This variable will hold the HTML of the latest summary,
    // so the download function knows what to send to the server.
    let currentSummaryHtml = '';

    // --- EVENT LISTENERS ---
    // Wire up the buttons to their respective functions
    generateBtn.addEventListener('click', handleGenerateSummary);
    downloadBtn.addEventListener('click', handleDownloadPdf);

    /**
     * Handles the "Generate AI Summary" button click.
     * It calls the API, manages loading/error states, and displays the result.
     */
    async function handleGenerateSummary() {
        // --- 1. Set Loading State ---
        // Provides clear feedback to the user that something is happening.
        generateBtn.disabled = true;
        generateBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Generating...`;
        downloadBtn.classList.add('hidden'); // Hide download button during generation
        currentSummaryHtml = ''; // Clear any previous summary
        resultContainer.innerHTML = `<div class="loading-state">The AI is analyzing your data. This may take a moment...</div>`;

        try {
            // --- 2. Make the API Call ---
            const response = await fetch('/api/generate-full-summary', {
                method: 'POST'
            });
            
            // Handle server errors (like 400 or 500 status codes)
            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.error || 'An unknown server error occurred.');
            }

            const result = await response.json();
            
            // --- 3. Render the Successful Result ---
            // Use the 'marked' library (included in the HTML) to convert AI's Markdown to HTML
            currentSummaryHtml = marked.parse(result.summary);
            
            // Display the rendered HTML on the page
            resultContainer.innerHTML = currentSummaryHtml;
            resultContainer.classList.add('loaded');

            // IMPORTANT: Show the download button now that there's content to download
            downloadBtn.classList.remove('hidden');

        } catch (error) {
            // --- 4. Render an Error Message ---
            console.error('Failed to generate summary:', error);
            resultContainer.innerHTML = `<div class="error-state"><strong>Error:</strong> ${error.message}</div>`;
        } finally {
            // --- 5. Reset the Button ---
            // This runs whether the request succeeded or failed.
            generateBtn.disabled = false;
            generateBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Regenerate Summary`;
        }
    }

    /**
     * Handles the "Download as PDF" button click.
     * Sends the summary's HTML to the server to be converted into a PDF.
     */
    async function handleDownloadPdf() {
        // Safety check in case the button is visible but there's no content
        if (!currentSummaryHtml) {
            alert('Please generate a summary first.');
            return;
        }

        // --- 1. Set Loading State for the Download Button ---
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Preparing...`;

        try {
            // --- 2. Call the PDF Generation API ---
            const response = await fetch('/api/download-summary-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ html_content: currentSummaryHtml })
            });

            if (!response.ok) {
                throw new Error('Failed to create PDF on the server.');
            }

            // --- 3. Trigger the Browser Download ---
            // The server sends back the PDF as binary data, which we handle as a "blob"
            const blob = await response.blob();

            // Create a temporary, invisible link to trigger the download
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'ai_summary.pdf'; // The default filename for the user
            
            document.body.appendChild(a);
            a.click(); // Programmatically click the link to start the download
            
            // --- 4. Clean Up ---
            // Remove the temporary link and URL from memory
            window.URL.revokeObjectURL(url);
            a.remove();

        } catch (error) {
            console.error('Download error:', error);
            alert(`Failed to download PDF: ${error.message}`);
        } finally {
            // --- 5. Reset the Download Button ---
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = `<i class="fa-solid fa-file-pdf"></i> Download as PDF`;
        }
    }
});document.addEventListener('DOMContentLoaded', () => {
    // --- DOM ELEMENT SELECTORS ---
    // Get all the interactive elements from the page
    const generateBtn = document.getElementById('generate-summary-btn');
    const downloadBtn = document.getElementById('download-summary-btn');
    const resultContainer = document.getElementById('summary-result-container');

    // --- STATE MANAGEMENT ---
    // This variable will hold the HTML of the latest summary,
    // so the download function knows what to send to the server.
    let currentSummaryHtml = '';

    // --- EVENT LISTENERS ---
    // Wire up the buttons to their respective functions
    generateBtn.addEventListener('click', handleGenerateSummary);
    downloadBtn.addEventListener('click', handleDownloadPdf);

    /**
     * Handles the "Generate AI Summary" button click.
     * It calls the API, manages loading/error states, and displays the result.
     */
    async function handleGenerateSummary() {
        // --- 1. Set Loading State ---
        // Provides clear feedback to the user that something is happening.
        generateBtn.disabled = true;
        generateBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Generating...`;
        downloadBtn.classList.add('hidden'); // Hide download button during generation
        currentSummaryHtml = ''; // Clear any previous summary
        resultContainer.innerHTML = `<div class="loading-state">The AI is analyzing your data. This may take a moment...</div>`;

        try {
            // --- 2. Make the API Call ---
            const response = await fetch('/api/generate-full-summary', {
                method: 'POST'
            });
            
            // Handle server errors (like 400 or 500 status codes)
            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.error || 'An unknown server error occurred.');
            }

            const result = await response.json();
            
            // --- 3. Render the Successful Result ---
            // Use the 'marked' library (included in the HTML) to convert AI's Markdown to HTML
            currentSummaryHtml = marked.parse(result.summary);
            
            // Display the rendered HTML on the page
            resultContainer.innerHTML = currentSummaryHtml;
            resultContainer.classList.add('loaded');

            // IMPORTANT: Show the download button now that there's content to download
            downloadBtn.classList.remove('hidden');

        } catch (error) {
            // --- 4. Render an Error Message ---
            console.error('Failed to generate summary:', error);
            resultContainer.innerHTML = `<div class="error-state"><strong>Error:</strong> ${error.message}</div>`;
        } finally {
            // --- 5. Reset the Button ---
            // This runs whether the request succeeded or failed.
            generateBtn.disabled = false;
            generateBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Regenerate Summary`;
        }
    }

    /**
     * Handles the "Download as PDF" button click.
     * Sends the summary's HTML to the server to be converted into a PDF.
     */
    async function handleDownloadPdf() {
        // Safety check in case the button is visible but there's no content
        if (!currentSummaryHtml) {
            alert('Please generate a summary first.');
            return;
        }

        // --- 1. Set Loading State for the Download Button ---
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Preparing...`;

        try {
            // --- 2. Call the PDF Generation API ---
            const response = await fetch('/api/download-summary-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ html_content: currentSummaryHtml })
            });

            if (!response.ok) {
                throw new Error('Failed to create PDF on the server.');
            }

            // --- 3. Trigger the Browser Download ---
            // The server sends back the PDF as binary data, which we handle as a "blob"
            const blob = await response.blob();

            // Create a temporary, invisible link to trigger the download
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'ai_summary.pdf'; // The default filename for the user
            
            document.body.appendChild(a);
            a.click(); // Programmatically click the link to start the download
            
            // --- 4. Clean Up ---
            // Remove the temporary link and URL from memory
            window.URL.revokeObjectURL(url);
            a.remove();

        } catch (error) {
            console.error('Download error:', error);
            alert(`Failed to download PDF: ${error.message}`);
        } finally {
            // --- 5. Reset the Download Button ---
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = `<i class="fa-solid fa-file-pdf"></i> Download as PDF`;
        }
    }
});