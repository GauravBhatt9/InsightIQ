import os
import pandas as pd
import uuid
from flask import Flask, render_template, request, jsonify, session, redirect, url_for, flash, send_from_directory
from werkzeug.utils import secure_filename
import chart_generator
import ai_analyzer
import ai_chart_generator
from summary import generate_ai_summary
from groq import Groq
from dotenv import load_dotenv
from flask import Response
from weasyprint import HTML

load_dotenv()


try:
    groq_api_key = os.environ.get("GROQ_API_KEY")
    if not groq_api_key:
        raise ValueError("GROQ_API_KEY not found in .env file.")
    groq_client = Groq(api_key=groq_api_key)
    print("✅ [main.py] Groq client initialized successfully.")
except Exception as e:
    print(f"!!! [main.py] FAILED to initialize Groq client: {e}")
    groq_client = None # Set to None if initialization fails

# --- App Initialization ---
app = Flask(__name__)
# A secret key is REQUIRED to use sessions in Flask
app.config['SECRET_KEY'] = 'a_super_secret_key_change_me_for_production' 
app.config['UPLOAD_FOLDER'] = 'uploads'
ALLOWED_EXTENSIONS = {'csv', 'xls', 'xlsx'}

if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# --- Helper Preprocessing Functions ---

def load_dataframe():
    """Loads the current dataframe from session and performs initial type conversion."""
    if 'current_filename' not in session:
        return None
    
    current_filename = session.get('current_filename')
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], current_filename)
    
    try:
        # --- THIS IS THE CORRECTED LINE ---
        # We now explicitly tell Pandas to use the 'openpyxl' engine for Excel files.
        df = pd.read_csv(filepath) if current_filename.endswith('.csv') else pd.read_excel(filepath, engine='openpyxl')
        
        df.columns = [col.strip() for col in df.columns]
        for col in df.columns:
            if df[col].dtype == 'object':
                try:
                    df[col] = pd.to_datetime(df[col], errors='coerce').fillna(df[col])
                except Exception:
                    continue
        return df
    except Exception as e:
        flash(f"Error reading file: {e}", "danger")
        return None

def handle_missing_values(df):
    """Fills missing numerical values with the mean."""
    for col in df.select_dtypes(include=['number']).columns:
        df[col].fillna(df[col].mean(), inplace=True)
    flash(f"Missing numerical values filled with column mean.", "success")
    return df

def clean_data(df):
    """Removes duplicate rows."""
    initial_rows = len(df)
    df.drop_duplicates(inplace=True)
    rows_removed = initial_rows - len(df)
    flash(f"Removed {rows_removed} duplicate rows.", "success")
    return df

def transform_data(df):
    """Placeholder for data transformation (e.g., scaling)."""
    flash("Data transformation step applied (placeholder).", "success")
    return df

def encode_categorical_data(df):
    """Converts categorical columns to numerical using one-hot encoding."""
    initial_cols = len(df.columns)
    df = pd.get_dummies(df, dummy_na=True)
    cols_added = len(df.columns) - initial_cols
    flash(f"Encoded categorical data, adding {cols_added} new columns.", "success")
    return df

def handle_outliers_iqr(df):
    """Removes outliers from numerical columns using the IQR method."""
    initial_rows = len(df)
    numerical_cols = df.select_dtypes(include=['number']).columns
    
    if len(numerical_cols) == 0:
        flash("No numerical columns found to handle outliers.", "warning")
        return df

    # Create a boolean mask for rows to keep
    rows_to_keep = pd.Series([True] * len(df), index=df.index)

    for col in numerical_cols:
        Q1 = df[col].quantile(0.25)
        Q3 = df[col].quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR
        # Update the mask to exclude outliers for this column
        rows_to_keep &= (df[col] >= lower_bound) & (df[col] <= upper_bound)
    
    df = df[rows_to_keep]
    rows_removed = initial_rows - len(df)
    flash(f"Removed {rows_removed} rows identified as outliers using IQR method.", "success")
    return df

# In main.py

def get_dataframe_from_session():
    """
    Loads the DataFrame from the ORIGINAL uploaded file path.
    It handles both .csv and .xlsx files.
    """
    print("\n--- [get_dataframe_from_session] ---")
    print(f"DEBUG: Current Session Contents: {dict(session)}")

    raw_path = session.get('filepath')
    
    if raw_path and os.path.exists(raw_path):
        print(f"SUCCESS: Found raw file path: {raw_path}")
        try:
            if raw_path.endswith('.xlsx'):
                return pd.read_excel(raw_path)
            else: # Assume CSV for everything else
                return pd.read_csv(raw_path)
        except Exception as e:
            print(f"ERROR: Failed to read file {raw_path}. Reason: {e}")
            return None
            
    print("FAILURE: No valid 'filepath' key found in session or file does not exist.")
    return None

@app.route('/')
def index():
    return render_template('index.html')

ALLOWED_EXTENSIONS = {'csv', 'xlsx'}

def allowed_file(filename):
    """Checks if the file extension is allowed."""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# --- Your app setup should include UPLOAD_FOLDER ---
# app.config['UPLOAD_FOLDER'] = 'uploads'


@app.route('/upload', methods=['GET', 'POST'])
def upload_file():
    if request.method == 'POST':
        if 'file' not in request.files:
            return jsonify({'error': 'No file part'}), 400
        
        file = request.files['file']

        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        if not allowed_file(file.filename):
            return jsonify({'error': 'File type not allowed. Please use .csv or .xlsx'}), 400
        
        # --- This logic is great for creating a unique filename ---
        original_filename = secure_filename(file.filename)
        unique_prefix = uuid.uuid4().hex[:8]
        new_filename = f"{unique_prefix}_{original_filename}"
        
        # Construct the full path to the file
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], new_filename)
        
        # Save the file to the server's disk
        file.save(filepath)
        
        # --- THIS IS THE CRITICAL FIX ---
        # We store the FULL PATH in the session key 'filepath'.
        # This is the key that the rest of your application (like get_dataframe_from_session)
        # is looking for.
        session['filepath'] = filepath
        
        # Clear any old processed file paths from previous sessions
        session.pop('processed_filepath', None)
        
        print("\n--- UPLOAD SUCCESS ---")
        print(f"Saved file to: {filepath}")
        print(f"✅ Set session['filepath'] = {session.get('filepath')}")
        print("---------------------\n")

        # Your frontend JavaScript will use this redirect URL
        return jsonify({'redirect': url_for('process_data')})
    
    # This handles the GET request to show the upload page
    return render_template('upload.html')

@app.route('/process', methods=['GET', 'POST'])
def process_data():
    if 'current_filename' not in session:
        flash("Please upload a file first.", "warning")
        return redirect(url_for('upload_file'))

    current_filename = session.get('current_filename')
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], current_filename)
    
    try:
        df = pd.read_csv(filepath) if current_filename.endswith('.csv') else pd.read_excel(filepath)
    except Exception as e:
        flash(f"Error reading file: {e}", "danger")
        session.pop('current_filename', None) # Clear bad file from session
        return redirect(url_for('upload_file'))

    # Get column names for the feature selection form
    column_names = df.columns.tolist()

    if request.method == 'POST':
        step = request.form.get('processing_step')
        new_filename = None # Initialize new filename

        # --- Logic for Feature Selection ---
        if step == 'feature_selection':
            columns_to_drop = request.form.getlist('columns_to_drop')
            if columns_to_drop:
                df.drop(columns=columns_to_drop, inplace=True, errors='ignore')
                flash(f"Removed columns: {', '.join(columns_to_drop)}", "success")
                new_filename = "selected_" + current_filename
        
        # --- Logic for Dropdown Processing Steps ---
        else:
            processing_steps = {
                'missing': (handle_missing_values, 'handling_'),
                'cleaning': (clean_data, 'clean_'),
                'transform': (transform_data, 'transform_'),
                'encode': (encode_categorical_data, 'encode_'),
                'outliers': (handle_outliers_iqr, 'outlier_')
            }
            if step in processing_steps:
                func, prefix = processing_steps[step]
                df = func(df)
                new_filename = prefix + current_filename
        
        # --- Save the modified file and update the session ---
        if new_filename:
            new_filepath = os.path.join(app.config['UPLOAD_FOLDER'], new_filename)
            if new_filename.endswith('.csv'):
                df.to_csv(new_filepath, index=False)
            else:
                df.to_excel(new_filepath, index=False)
            
            # Optionally, remove the old file to save space
            # os.remove(filepath) 

            session['current_filename'] = new_filename
            return redirect(url_for('process_data'))

    # For a GET request, display the page with data preview and column names
    data_preview = df.head().to_html(classes='table table-striped', justify='left')
    return render_template('process.html', 
                           current_file=current_filename, 
                           data_preview=data_preview,
                           column_names=column_names)

@app.route('/download/<filename>')
def download_file(filename):
    if 'current_filename' not in session or filename != session['current_filename']:
        flash("Invalid download request.", "danger")
        return redirect(url_for('process_data'))
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename, as_attachment=True)

@app.route('/custom-chart')
def custom_chart():
    """Renders the custom chart building page."""
    df = load_dataframe()
    if df is None:
        flash("Please upload and process a file first.", "warning")
        return redirect(url_for('upload_file'))

    columns = df.columns.tolist()
    numeric_columns = df.select_dtypes(include=['number']).columns.tolist()
    categorical_columns = df.select_dtypes(include=['object', 'category', 'datetime64[ns]']).columns.tolist()

    return render_template('custom_chart.html', 
                           columns=columns, 
                           numeric_columns=numeric_columns,
                           categorical_columns=categorical_columns)

@app.route('/api/generate-chart', methods=['POST'])
def api_generate_chart():
    df = load_dataframe()
    if df is None:
        return jsonify({'error': 'No file found in session. Please upload a file again.'}), 400

    payload = request.json
    print(f"[DEBUG] Received payload in /api/generate-chart: {payload}")

    # --- THIS IS THE CORRECTED LOGIC ---
    # It now understands the keys from dashboard.js (x_axis, category)
    # AND the keys from ai_chart.js (x_column, y_column).
    chart_options = {
        'chartType': payload.get('chartType'),
        'x_column': payload.get('x_axis') or payload.get('category') or payload.get('column') or payload.get('x_column'),
        'y_column': payload.get('y_axis') or payload.get('values') or payload.get('y_column')
    }
    
    # We now pass the entire flexible payload to the generator
    # This handles extra options like agg_func, bins, showLine, etc.
    final_options = {**payload, **chart_options}

    try:
        # Use your ai_chart_generator as it has the robust data generation logic
        chart_data = ai_chart_generator.generate_chart_data(df, final_options)
        
        if chart_data.get('error'):
             print(f"[ERROR] Chart generation failed: {chart_data.get('error')}")
             return jsonify(chart_data), 400

        return jsonify(chart_data)
        
    except Exception as e:
        print(f"[CRITICAL ERROR] in /api/generate-chart: {str(e)}")
        return jsonify({'error': f"An unexpected server error occurred: {str(e)}"}), 500


@app.route('/api/analyze-chart', methods=['POST'])
def analyze_chart():
    data = request.json
    if 'image_data_url' not in data:
        return jsonify({'error': 'No image data provided.'}), 400

    image_data_url = data['image_data_url']
    
    try:
        # Call the dedicated function from your new module
        insight = ai_analyzer.get_chart_analysis(image_data_url)
        return jsonify({'insight': insight})

    except ValueError as e:
        # Catches the missing API key error specifically
        return jsonify({'error': str(e)}), 500
    except Exception as e:
        # Catches any other error from the API call
        print(f"Error during chart analysis: {e}")
        return jsonify({'error': f"An error occurred while analyzing the chart."}), 500
    
@app.route('/ai-chart')
def ai_chart():
    df = load_dataframe()
    if df is None:
        flash("Please upload a file first before using the AI Chart feature.", "warning")
        return redirect(url_for('upload_file'))
    
    # This renders the new HTML page
    return render_template('ai_chart.html')

@app.route('/api/get-ai-chart-config', methods=['POST'])
def api_get_ai_chart_config():
    prompt = request.json.get('prompt')
    df = load_dataframe()
    if df is None or not prompt: return jsonify({'error': 'Missing data or prompt.'}), 400
    try:
        chart_config = ai_chart_generator.get_chart_config_from_prompt(prompt, df)
        return jsonify(chart_config)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
@app.route('/api/get-ai-dashboard-configs', methods=['POST'])
def api_get_ai_dashboard_configs():
    df = load_dataframe()
    if df is None: return jsonify({'error': 'Missing data.'}), 400
    try:
        configs = ai_chart_generator.get_dashboard_configs_from_data(df)
        return jsonify(configs)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/get-chart-insight', methods=['POST'])
def get_chart_insight():
    """
    Receives a base64 image of a chart and returns a Gemini/OpenRouter-generated insight.
    """
    try:
        payload = request.get_json()
        image_data = payload.get('imageData')

        if not image_data:
            return jsonify({'error': 'Missing image data.'}), 400

        # Call the NEW OpenRouter function in your AI module
        insight_text = ai_chart_generator.get_insight_from_image_openrouter(image_data)
        
        return jsonify({'insight': insight_text})

    except Exception as e:
        print(f"Error getting chart insight: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/summary-generator')
def summary_generator_page():
    """Renders the dedicated page for the AI Summary Generator."""
    # This route just serves the HTML page. The real work is done by the API.
    return render_template('summary_generator.html')


@app.route('/api/apply-preprocessing', methods=['POST'])
def apply_preprocessing():
    # 1. Get the currently active DataFrame
    df = get_dataframe_from_session()
    if df is None:
        return jsonify({'error': 'No data found to process.'}), 400

    # --- YOUR PREPROCESSING LOGIC GOES HERE ---
    # For example:
    df.dropna(inplace=True)
    df.drop_duplicates(inplace=True)
    # ------------------------------------------

    try:
        raw_filepath = session.get('filepath')
        if not raw_filepath:
            # This is a fallback in case the original path is lost
            return jsonify({'error': 'Original file path not found in session.'}), 500

        # --- Create the new filepath for the processed file ---
        dir_name = os.path.dirname(raw_filepath)
        base_filename = os.path.basename(raw_filepath)
        processed_filename = f"processed_{base_filename}"
        processed_filepath = os.path.join(dir_name, processed_filename)

        # --- Save the cleaned data to the new file ---
        df.to_csv(processed_filepath, index=False)
        
        # --- THIS IS THE MOST IMPORTANT LINE - IS IT IN YOUR CODE? ---
        session['processed_filepath'] = processed_filepath
        
        print(f"✅ Data processed. Session key 'processed_filepath' set to: {processed_filepath}")
        
        return jsonify({'message': 'Preprocessing successful!'})

    except Exception as e:
        print(f"Error saving processed file: {e}")
        return jsonify({'error': 'Failed to save the processed data.'}), 500
    
@app.route('/api/generate-full-summary', methods=['POST'])
def generate_full_summary_api():
    """
    API endpoint that uses the summary module to generate a data summary.
    This version includes a safety check to handle cases where no data is loaded.
    """
    # First, attempt to get the dataframe from the session
    df = get_dataframe_from_session()
    
    # --- THIS IS THE CRUCIAL FIX ---
    # Check if the dataframe is None RIGHT AFTER you get it.
    # If it's None, stop immediately and return a clean JSON error.
    if df is None:
        return jsonify({'error': 'No data file found. Please upload and process a file first.'}), 400

    # We wrap the rest in a try...except block for robust error handling
    try:
        # Now it is safe to call the summary function, because we know df is not None.
        # This function is imported from your summary.py file.
        summary_text = generate_ai_summary(df, groq_client)
        
        # If successful, return the summary in a JSON format
        return jsonify({'summary': summary_text})

    except Exception as e:
        # If any other error happens during the AI call, catch it
        print(f"Error in /api/generate-full-summary route: {e}")
        # Return a generic error message to the user
        return jsonify({'error': 'An internal error occurred while generating the summary.'}), 500
    
# In main.py

@app.route('/api/download-summary-pdf', methods=['POST'])
def download_summary_pdf():
    """
    DEBUGGING VERSION: Receives summary content, converts it to PDF,
    and prints debug info to the terminal.
    """
    try:
        data = request.get_json()
        html_content = data.get('html_content')

        # --- DEBUG CHECK #1: See what HTML is arriving from the browser ---
        print("\n" + "="*50)
        print("--- DEBUGGING PDF GENERATION ---")
        print("1. HTML content received from JavaScript:")
        print(html_content)
        print("-" * 50)

        if not html_content:
            return jsonify({'error': 'No content provided for PDF generation.'}), 400

        pdf_style = """
        <style>
            body { font-family: sans-serif; font-size: 11pt; line-height: 1.6; }
            h3, h4 { color: #0056b3; border-bottom: 2px solid #007bff; padding-bottom: 5px; }
            ul { list-style-type: disc; padding-left: 20px; }
            li { margin-bottom: 8px; }
        </style>
        """
        full_html = f"<html><head>{pdf_style}</head><body><h1>AI Data Summary</h1>{html_content}</body></html>"

        # --- Use WeasyPrint to generate the PDF ---
        pdf_bytes = HTML(string=full_html).write_pdf()

        # --- DEBUG CHECK #2: See what WeasyPrint produced ---
        print("2. WeasyPrint output check:")
        print(f"   - Length of generated PDF bytes: {len(pdf_bytes)}")
        print(f"   - First 100 bytes: {pdf_bytes[:100]}")
        print("="*50 + "\n")

        # A quick check to see if the PDF is likely valid
        if len(pdf_bytes) < 100: # A real PDF is thousands of bytes
            raise Exception("WeasyPrint generated an empty or invalid PDF file.")

        # --- Create and return the Flask Response ---
        return Response(
            pdf_bytes,
            mimetype='application/pdf',
            headers={'Content-Disposition': 'attachment;filename=ai_summary.pdf'}
        )

    except Exception as e:
        print(f"!!! ERROR generating PDF: {e}")
        return jsonify({'error': f'Failed to generate PDF: {e}'}), 500
    
if __name__ == '__main__':
    app.run(debug=True)