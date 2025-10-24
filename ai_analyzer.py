
import openai


api_key = "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"


openrouter_base_url = "https://openrouter.ai/api/v1"

# Custom headers required by OpenRouter
# Replace "INSIGHT_IQ_APP" with your actual app's name or URL
http_headers = {
    "HTTP-Referer": "INSIGHT_IQ_APP", 
    "X-Title": "Insight IQ AI Assistant",
}
# --- End of New Configuration ---

# Initialize the client with the OpenRouter settings
try:
    if not api_key:
        client = None
    else:
        client = openai.OpenAI(
            base_url=openrouter_base_url,
            api_key=api_key,
            default_headers=http_headers,
        )
except TypeError:
    client = None


def get_chart_analysis(image_data_url: str) -> str:
    """
    Analyzes a chart image using an OpenRouter-compatible model.
    """
    if not client:
        raise ValueError("OpenRouter API key not configured. Please set the OPENROUTER_API_KEY environment variable.")

    prompt_text = (
        "You are an expert data analyst. Look at the following chart image. "
        "Provide a concise summary of the key insights, trends, or significant data points you can identify. "
        "Focus on what the data is communicating. Use clear bullet points for your analysis. Do not start lines with asterisks or dashes."
    )

    try:
        response = client.chat.completions.create(
            model="google/gemini-2.0-flash-exp:free",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt_text},
                        {
                            "type": "image_url",
                            "image_url": {"url": image_data_url},
                        },
                    ],
                }
            ],
            max_tokens=400,
        )
        raw_insight = response.choices[0].message.content

        # --- THIS IS THE CLEANING LOGIC ---
        # 1. Split the text into individual lines
        lines = raw_insight.strip().split('\n')
        
        # 2. Process each line to remove leading asterisks, dashes, and extra spaces
        cleaned_lines = []
        for line in lines:
            line = line.strip()
            # Remove leading bullet point characters (*, -, •) and any following spaces
            if line.startswith('* '):
                line = line[2:]
            elif line.startswith('*'):
                line = line[1:]
            elif line.startswith('- '):
                line = line[2:]
            elif line.startswith('-'):
                line = line[1:]
            elif line.startswith('• '):
                line = line[2:]
            
            # Add the cleaned line only if it's not empty
            if line:
                cleaned_lines.append(line)
        
        # 3. Join the cleaned lines back together
        final_insight = '\n'.join(cleaned_lines)
        
        return final_insight

    except Exception as e:
        print(f"An error occurred calling the API: {e}")
        raise