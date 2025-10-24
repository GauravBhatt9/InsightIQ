document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('upload-form');
    if (!uploadForm) return; // Exit if not on the upload page

    const fileDropArea = document.getElementById('file-drop-area');
    const fileInput = document.getElementById('fileInput');
    const fileNameDisplay = document.querySelector('.file-name-display');
    const submitBtn = document.querySelector('.submit-btn');

    // Prevent default browser behaviors for drag-and-drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        fileDropArea.addEventListener(eventName, preventDefaults, false);
    });

    // Add/remove active class for visual feedback
    ['dragenter', 'dragover'].forEach(eventName => {
        fileDropArea.addEventListener(eventName, () => fileDropArea.classList.add('is-active'), false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        fileDropArea.addEventListener(eventName, () => fileDropArea.classList.remove('is-active'), false);
    });

    // Handle dropped files
    fileDropArea.addEventListener('drop', e => {
        fileInput.files = e.dataTransfer.files;
        handleFiles(fileInput.files);
    }, false);

    // Handle files selected via the file input
    fileInput.addEventListener('change', e => handleFiles(e.target.files));

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Update UI when files are selected
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

    // Handle the form submission
    uploadForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData();
        const file = fileInput.files[0];

        if (!file) {
            alert('Please select a file first.');
            return;
        }
        formData.append('file', file);

        submitBtn.textContent = 'Uploading...';
        submitBtn.disabled = true;

        fetch('/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.redirect) {
                window.location.href = data.redirect;
            } else if (data.error) {
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
});