import pandas as pd
import numpy as np

def _format_for_chartjs(labels, datasets):
    """Helper to structure data for Chart.js library."""
    return {'labels': labels, 'datasets': datasets}

# --- Bar, Line, Scatter, Pie Functions (from previous version, no changes) ---
def _generate_bar_chart_data(df, x_col, y_col, agg_func):
    if y_col not in df.columns or x_col not in df.columns: return {'error': 'One or more selected columns not found.'}
    if not np.issubdtype(df[y_col].dtype, np.number): return {'error': f'Y-Axis column "{y_col}" must be numeric for aggregation.'}
    grouped_data = df.groupby(x_col)[y_col].agg(agg_func).reset_index().sort_values(by=y_col, ascending=False)
    labels = grouped_data[x_col].astype(str).tolist()
    data = [float(item) for item in grouped_data[y_col]]
    dataset = [{'label': f'{agg_func.capitalize()} of {y_col}', 'data': data}]
    return _format_for_chartjs(labels, dataset)

def _generate_scatter_plot_data(df, x_col, y_col):
    if y_col not in df.columns or x_col not in df.columns: return {'error': 'One or more selected columns not found.'}
    if not np.issubdtype(df[x_col].dtype, np.number) or not np.issubdtype(df[y_col].dtype, np.number): return {'error': 'Both axes must be numeric for a scatter plot.'}
    data_points = [{'x': float(x), 'y': float(y)} for x, y in zip(df[x_col], df[y_col])]
    dataset = [{'label': f'{y_col} vs. {x_col}', 'data': data_points}]
    return _format_for_chartjs(labels=None, datasets=dataset)

def _generate_line_chart_data(df, x_col, y_col, agg_func):
    if y_col not in df.columns or x_col not in df.columns: return {'error': 'One or more selected columns not found.'}
    if not np.issubdtype(df[y_col].dtype, np.number): return {'error': f'Y-Axis column "{y_col}" must be numeric for aggregation.'}
    if pd.api.types.is_datetime64_any_dtype(df[x_col]): df = df.sort_values(by=x_col)
    grouped_data = df.groupby(x_col)[y_col].agg(agg_func).reset_index()
    labels = grouped_data[x_col].astype(str).tolist()
    data = [float(item) for item in grouped_data[y_col]]
    dataset = [{'label': f'{agg_func.capitalize()} of {y_col}', 'data': data, 'borderColor': '#007bff', 'tension': 0.1}]
    return _format_for_chartjs(labels, dataset)

def _generate_pie_chart_data(df, category_col, values_col):
    if values_col not in df.columns or category_col not in df.columns: return {'error': 'One or more selected columns not found.'}
    if not np.issubdtype(df[values_col].dtype, np.number): return {'error': f'Values column "{values_col}" must be numeric.'}
    grouped_data = df.groupby(category_col)[values_col].sum().nlargest(10).reset_index()
    labels = grouped_data[category_col].astype(str).tolist()
    data = [float(item) for item in grouped_data[values_col]]
    dataset = [{'label': values_col, 'data': data}]
    return _format_for_chartjs(labels, dataset)

# --- NEW: Histogram Data Logic ---
def _generate_histogram_data(df, column, bins):
    """Generates data for a histogram by binning a numeric column."""
    if column not in df.columns: return {'error': f'Column "{column}" not found.'}
    if not np.issubdtype(df[column].dtype, np.number): return {'error': f'Column "{column}" must be numeric for a histogram.'}
    
    # Use numpy to calculate the histogram
    counts, bin_edges = np.histogram(df[column].dropna(), bins=bins)
    
    # Create user-friendly labels for the bins
    labels = [f'{bin_edges[i]:.1f}-{bin_edges[i+1]:.1f}' for i in range(len(bin_edges)-1)]
    data = [float(c) for c in counts]
    
    dataset = [{'label': f'Distribution of {column}', 'data': data}]
    return _format_for_chartjs(labels, dataset)

# --- THE MAIN ROUTER FUNCTION (UPDATED) ---
def generate_chart_data(df, chart_options):
    """Main router function to generate data for a specific chart type."""
    chart_type = chart_options.get('chartType')
    
    if chart_type in ['bar', 'horizontalBar']:
        return _generate_bar_chart_data(df, chart_options.get('x_axis'), chart_options.get('y_axis'), chart_options.get('agg_func', 'sum'))
    elif chart_type in ['line', 'area']:
        return _generate_line_chart_data(df, chart_options.get('x_axis'), chart_options.get('y_axis'), chart_options.get('agg_func', 'sum'))
    elif chart_type in ['pie', 'doughnut']:
        return _generate_pie_chart_data(df, chart_options.get('category'), chart_options.get('values'))
    elif chart_type == 'scatter':
        return _generate_scatter_plot_data(df, chart_options.get('x_axis'), chart_options.get('y_axis'))
    elif chart_type == 'histogram':
        # Safely get bins, default to 10
        try:
            bins = int(chart_options.get('bins', 10))
        except (ValueError, TypeError):
            bins = 10
        return _generate_histogram_data(df, chart_options.get('column'), bins)
    else:
        return {'error': 'Unknown chart type'}