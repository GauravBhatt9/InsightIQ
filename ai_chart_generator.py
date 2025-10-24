import os
import pandas as pd
from groq import Groq
from openai import OpenAI  # <-- We already have this, perfect!
from dotenv import load_dotenv
from io import StringIO
import json
import numpy as np
import re
import json

"""
This is the single, all-in-one module for AI and Chart logic.
It is designed to be completely self-contained.
- It communicates with the Groq AI to get chart suggestions.
- It parses and validates AI responses with a strict firewall.
- It generates the final data structures required by a front-end (like Chart.js).
- It is filled with detailed print statements for easy debugging.
"""

# --- Load Environment Variables & Initialize Client ---
load_dotenv()
try:
    groq_api_key = os.environ.get("GROQ_API_KEY")
    if not groq_api_key: raise ValueError("CRITICAL: GROQ_API_KEY not found in .env file.")
    client = Groq(api_key=groq_api_key)
    print("✅ [ai_chart_generator] Groq client initialized successfully.")
except Exception as e:
    print(f"!!! [ai_chart_generator] Failed to initialize Groq client: {e}"); client = None
try:
    openrouter_api_key = os.environ.get("OPENROUTER_API_KEY")
    if not openrouter_api_key: raise ValueError("CRITICAL: OPENROUTER_API_KEY not found in .env file.")
    
    openrouter_client = OpenAI(
      base_url="https://openrouter.ai/api/v1",
      api_key=openrouter_api_key,
    )
    # Optional headers for OpenRouter analytics
    openrouter_headers = {
        "HTTP-Referer": os.environ.get("YOUR_SITE_URL", ""),
        "X-Title": os.environ.get("YOUR_SITE_NAME", ""),
    }
    print("✅ [ai_chart_generator] OpenRouter client initialized.")
except Exception as e:
    print(f"!!! [ai_chart_generator] Failed to initialize OpenRouter client: {e}"); openrouter_client = None

# ==============================================================================
# --- CORE LOGIC - This is the heart of the module ---
# ==============================================================================

def _normalize_name(name):
    """A consistent normalization function used everywhere to clean column names."""
    return re.sub(r'[^a-z0-9]', '', str(name).lower())

def generate_chart_data(df, options):
    """
    Takes a DataFrame and chart options, then returns data formatted for Chart.js.
    This is the final step and handles all data type combinations.
    """
    print("\n" + "-"*80)
    print("--- STEP 5 [ai_chart_generator]: Generating Final Chart Data ---")
    print(f"--- Received options: {options}")
    try:
        chart_type, x_sugg, y_sugg = options.get('chartType'), options.get('x_column'), options.get('y_column')
        actual_cols = df.columns.tolist()
        
        # Use normalization to find the correct column names
        normalized_mapping = {_normalize_name(col): col for col in actual_cols}
        x_col = normalized_mapping.get(_normalize_name(x_sugg))
        y_col = normalized_mapping.get(_normalize_name(y_sugg))

        print(f"  - Normalizing X: '{x_sugg}' -> Resolved to: '{x_col}'")
        print(f"  - Normalizing Y: '{y_sugg}' -> Resolved to: '{y_col}'")
        
        if not all([chart_type, x_col, y_col]):
            error_msg = f"A required column ('{x_sugg}' or '{y_sugg}') could not be found."
            print(f"  - ❌ FAILED: {error_msg}")
            return {'error': error_msg}
            
        is_x_numeric, is_y_numeric = pd.api.types.is_numeric_dtype(df[x_col]), pd.api.types.is_numeric_dtype(df[y_col])
        chart_data = {}

        if chart_type in ['pie', 'doughnut']:
            if not is_y_numeric: return {'error': f"Pie charts require a numeric Y-axis ('{y_col}')."}
            grouped = df.groupby(x_col)[y_col].sum().nlargest(10)
            chart_data['labels'], chart_data['datasets'] = grouped.index.astype(str).tolist(), [{'label': y_col, 'data': grouped.values.tolist()}]
        elif chart_type == 'bar':
            if not is_y_numeric: return {'error': f"Bar charts require a numeric Y-axis ('{y_col}')."}
            if not is_x_numeric: grouped = df.groupby(x_col)[y_col].sum().nlargest(25).sort_index()
            else:
                df['x_binned'] = pd.cut(df[x_col], bins=10); grouped = df.groupby('x_binned')[y_col].sum()
            chart_data['labels'], chart_data['datasets'] = grouped.index.astype(str).tolist(), [{'label': y_col, 'data': grouped.values.tolist()}]
        elif chart_type == 'line':
            if not is_y_numeric: return {'error': f"Line charts require a numeric Y-axis ('{y_col}')."}
            df_sorted = df.sort_values(by=x_col).dropna(subset=[x_col, y_col])
            chart_data['labels'] = df_sorted[x_col].tolist()
            chart_data['datasets'] = [{'label': y_col, 'data': df_sorted[y_col].tolist(), 'fill': False, 'tension': 0.1}]
        elif chart_type == 'scatter':
            df_sorted = df.dropna(subset=[x_col, y_col])
            chart_data['datasets'] = [{'label': f'{y_col} vs {x_col}', 'data': [{'x': r[x_col], 'y': r[y_col]} for _, r in df_sorted.iterrows()]}]
        else: return {'error': f"Unsupported chart type: {chart_type}"}
        
        print("  - ✅ SUCCESS: Chart data generated.")
        print("-" * 80 + "\n")
        return chart_data
    except Exception as e:
        print(f"  - ❌ FATAL ERROR in generate_chart_data: {e}")
        return {'error': f'An internal error occurred: {str(e)}'}

def get_dashboard_configs_from_data(df):
    """The main AI function to generate a dashboard, with extreme debugging."""
    if client is None: raise ConnectionError("Groq client not initialized.")
    actual_columns = df.columns.tolist()
    column_names_str = ", ".join(f"'{c}'" for c in actual_columns)
    prompt = f"Analyze data with columns {column_names_str}. Suggest charts in a markdown table ('Column X', 'Column Y', 'Chart Type'). Types: 'bar', 'line', 'scatter', 'pie'. Use ONLY given columns. Provide ONLY the table. Data sample:\n{df.head().to_string()}"

    print("\n" + "#"*80); print("### STEP 1 [ai_chart_generator]: SENDING PROMPT TO GROQ AI ###")
    print(f"Prompt is using these available columns: {actual_columns}"); print("#"*80 + "\n")
    
    try:
        completion = client.chat.completions.create(model="llama-3.1-8b-instant", messages=[{"role": "user", "content": prompt}], temperature=0.1, max_tokens=2048)
        response_text = completion.choices[0].message.content
        
        print("\n" + "#"*80); print("### STEP 2 [ai_chart_generator]: RAW RESPONSE RECEIVED FROM AI ###")
        print(response_text); print("#"*80 + "\n")
        
        suggestions_df = _parse_ai_response_to_df(response_text)
        if suggestions_df.empty: return []

        valid_configs = []; print("\n" + "#"*80); print("### STEP 3 [ai_chart_generator]: VALIDATION FIREWALL - CHECKING EACH SUGGESTION ###")
        normalized_mapping = {_normalize_name(col): col for col in actual_columns}
        print(f"Firewall is checking against this normalized mapping: {normalized_mapping}")

        for index, row in suggestions_df.iterrows():
            x_sugg, y_sugg = row['x_column'].strip(), row['y_column'].strip()
            print(f"\n--- Evaluating Suggestion #{index+1}: X='{x_sugg}', Y='{y_sugg}' ---")
            norm_x, norm_y = _normalize_name(x_sugg), _normalize_name(y_sugg)
            x_corrected, y_corrected = normalized_mapping.get(norm_x), normalized_mapping.get(norm_y)
            print(f"  - Normalized AI suggestion: X='{norm_x}', Y='{norm_y}'")
            print(f"  - Matched actual columns: X='{x_corrected}', Y='{y_corrected}'")
            if x_corrected and y_corrected:
                print("  - ✅ STATUS: ACCEPTED. Both columns found a match.")
                valid_configs.append({"chartType": row['chartType'].lower().strip(), "x_column": x_corrected, "y_column": y_corrected, "title": f"{y_corrected} by {x_corrected}"})
            else:
                print(f"  - ❌ STATUS: REJECTED. Could not find a match for '{x_sugg if not x_corrected else y_sugg}'.")
        print("#"*80 + "\n")

        print("\n" + "#"*80); print("### STEP 4 [ai_chart_generator]: FINAL CONFIGS SENT BACK TO app.py ###")
        if not valid_configs: print("No valid suggestions passed the firewall.")
        else: [print(config) for config in valid_configs]
        print("#"*80 + "\n")
        return valid_configs
    except Exception as e:
        print(f"!!! CRITICAL ERROR in get_dashboard_configs_from_data: {e}"); raise

def get_chart_config_from_prompt(user_prompt, df):
    """Generates a single chart config from a text prompt."""
    if client is None: raise ConnectionError("Groq client not initialized.")
    cols = ", ".join(f"'{c}'" for c in df.columns); prompt = f"Generate JSON for user request '{user_prompt}' using columns from {cols}. RULES: Respond with single JSON: {{\"chartType\": \"bar|line|scatter|pie\", \"x_column\": \"<col>\", \"y_column\": \"<col>\", \"title\": \"<title>\"}}. Use ONLY given columns."
    try:
        completion = client.chat.completions.create(model="llama-3.1-8b-instant", messages=[{"role": "user", "content": prompt}], temperature=0.0, max_tokens=1024, response_format={"type": "json_object"})
        config = json.loads(completion.choices[0].message.content)
        return config
    except Exception as e: print(f"Error in prompt gen: {e}"); raise

def _parse_ai_response_to_df(suggestions_text):
    """Helper function to parse markdown table from AI response."""
    try:
        lines = [line for line in suggestions_text.strip().splitlines() if line.strip().startswith('|')]
        if len(lines) < 2: raise ValueError("Markdown table not found in AI response.")
        df = pd.read_csv(StringIO('\n'.join(lines)), sep='|', skipinitialspace=True).iloc[:, 1:-1].drop(index=0).reset_index(drop=True)
        df.columns = [c.strip() for c in df.columns]; df.rename(columns={df.columns[0]: 'x_column', df.columns[1]: 'y_column', df.columns[2]: 'chartType'}, inplace=True)
        df.replace('', np.nan, inplace=True); df.dropna(subset=['x_column', 'y_column'], inplace=True)
        if df.empty: raise ValueError("Parsed table has no valid rows.")
        return df
    except Exception as e: 
        print(f"!!! [Parser] FAILED TO PARSE AI RESPONSE: {e}"); return pd.DataFrame()
    
def get_insight_from_image_openrouter(base64_image_data_url):
    """
    Takes a base64 encoded chart image and asks Gemini 2.0 Flash via OpenRouter
    for a detailed, multi-line interpretation.
    """
    if openrouter_client is None:
        raise ConnectionError("OpenRouter client not initialized. Check your API key.")

    # --- THIS IS THE UPDATED PROMPT ---
    prompt_text = """
    You are a data analyst summarizing a chart for a business report.
    Analyze the chart in this image and provide a short, multi-point summary.

    Your summary should be 3-4 sentences long and follow this structure:
    1.  **Main Observation:** Start with the most significant finding (e.g., the highest/lowest value, the main trend).
    2.  **Context or Comparison:** Provide a specific comparison or context for the main observation (e.g., "which is nearly double...", "in contrast to...").
    3.  **Secondary Insight:** Mention another interesting point, such as an outlier, a cluster of similar values, or the second-most important trend.

    RULES:
    - Respond ONLY with the text of the summary.
    - Do not use headings or bullet points in your final output.
    - Keep the tone professional and clear.

    Example Summary:
    The 'East' region is the clear top performer in sales, significantly outperforming all other areas. Its revenue is almost double that of the 'West', the next highest region. Interestingly, both the 'North' and 'South' regions show very similar, lower performance, suggesting a potential area for market growth.
    """

    print("\n" + "#"*80); print("### [ai_chart_generator]: SENDING IMAGE FOR DETAILED INSIGHT ###")

    try:
        completion = openrouter_client.chat.completions.create(
          extra_headers=openrouter_headers,
          model="google/gemini-2.0-flash-exp:free",
          messages=[
            {
              "role": "user",
              "content": [
                {"type": "text", "text": prompt_text},
                {
                  "type": "image_url",
                  "image_url": {
                    "url": base64_image_data_url 
                  }
                }
              ]
            }
          ],
          max_tokens=300,  # <-- Increased to allow for a longer response
          temperature=0.2
        )
        insight = completion.choices[0].message.content.strip()
        print(f"  - ✅ SUCCESS: Received detailed insight:\n{insight}")
        print("#"*80 + "\n")
        return insight
    except Exception as e:
        print(f"!!! CRITICAL ERROR in get_insight_from_image_openrouter: {e}")
        raise