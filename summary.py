import pandas as pd
from groq import Groq
from io import StringIO

# Add type hints for better code clarity
from typing import Optional

def generate_ai_summary(df: pd.DataFrame, groq_client: Optional[Groq]) -> str:
    """
    Takes a DataFrame, samples the first 100 rows, and asks an AI for a summary.
    """
    if not groq_client:
        raise ConnectionError("Groq client has not been initialized.")

    # --- Step 1: Create a sample of the first 100 rows ---
    print("### [summary.py] Analyzing the first 100 rows of the dataset...")
    df_sample = df.head(50)
    
    # --- Step 2: Gather Context from the SAMPLE ---
    buffer = StringIO()
    # Use the sample for info and describe
    df_sample.info(buf=buffer)
    info_str = buffer.getvalue()
    stats_str = df_sample.describe(include='all').to_string()

    # --- Step 3: Update the Prompt to reflect it's a sample ---
    prompt = f"""
    You are a senior data analyst providing an executive summary.
    Below is the structure and statistical summary of the FIRST 100 ROWS of a dataset.

    --- DATASET STRUCTURE & INFO (from first 100 rows) ---
    {info_str}

    --- STATISTICAL SUMMARY (from first 100 rows) ---
    {stats_str}

    --- YOUR TASK ---
    Based ONLY on this sample of the first 100 rows, provide a high-level summary.
    Focus on these key points:
    1.  **Overall Purpose:** What does this dataset appear to be about based on the sample?
    2.  **Key Columns:** Identify the most important columns in this sample.
    3.  **Interesting Findings:** Point out trends or stats visible in this 100-row sample.
    4.  **Potential Issues:** Mention potential data quality issues visible in the sample.

    Format your response with headings and bullet points for readability.
    """
    
    # ... (the rest of the function for calling the AI is exactly the same)
    try:
        completion = groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1024
        )
        summary = completion.choices[0].message.content.strip()
        print("### [summary.py] Successfully received summary from AI.")
        return summary
    except Exception as e:
        print(f"!!! [summary.py] CRITICAL ERROR during AI summary generation: {e}")
        raise