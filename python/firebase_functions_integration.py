#!/usr/bin/env python3
"""
Firebase Functions Integration
Handles bid processing and template generation via HTTP endpoints
"""

import os
import json
import tempfile
from flask import Flask, request, jsonify, send_file
from excel_integration import ExcelTemplateProcessor
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
processor = ExcelTemplateProcessor()

@app.route('/generate-bid-template', methods=['POST'])
def generate_bid_template():
    """Generate bid template for supplier"""
    try:
        data = request.get_json()
        
        if not data or 'demand_data' not in data or 'supplier_data' not in data:
            return jsonify({'error': 'Missing required data'}), 400
        
        demand_data = data['demand_data']
        supplier_data = data['supplier_data']
        
        # Generate template
        template_path = processor.generate_bid_template(demand_data, supplier_data)
        
        return jsonify({
            'success': True,
            'template_path': template_path,
            'download_url': f'/download-template?path={os.path.basename(template_path)}'
        })
        
    except Exception as e:
        logger.error(f"Error generating bid template: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/process-bid-submission', methods=['POST'])
def process_bid_submission():
    """Process submitted bid Excel file"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['file']
        demand_data = json.loads(request.form.get('demand_data', '{}'))
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            file.save(tmp_file.name)
            
            # Process bid
            bid_data = processor.process_submitted_bid(tmp_file.name, demand_data)
            
            # Clean up temp file
            os.unlink(tmp_file.name)
            
            return jsonify({
                'success': True,
                'bid_data': bid_data
            })
        
    except Exception as e:
        logger.error(f"Error processing bid submission: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/generate-comparison-table', methods=['POST'])
def generate_comparison_table():
    """Generate comparison table for received bids"""
    try:
        data = request.get_json()
        
        if not data or 'demand_data' not in data or 'bids_data' not in data:
            return jsonify({'error': 'Missing required data'}), 400
        
        demand_data = data['demand_data']
        bids_data = data['bids_data']
        user_premium = data.get('user_premium', False)
        
        # Generate comparison table
        comparison_path = processor.generate_comparison_table(
            demand_data, bids_data, user_premium
        )
        
        return jsonify({
            'success': True,
            'comparison_path': comparison_path,
            'download_url': f'/download-comparison?path={os.path.basename(comparison_path)}'
        })
        
    except Exception as e:
        logger.error(f"Error generating comparison table: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/download-template', methods=['GET'])
def download_template():
    """Download generated bid template"""
    try:
        filename = request.args.get('path')
        if not filename:
            return jsonify({'error': 'No filename provided'}), 400
        
        file_path = os.path.join('generated', filename)
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 404
        
        return send_file(file_path, as_attachment=True)
        
    except Exception as e:
        logger.error(f"Error downloading template: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/download-comparison', methods=['GET'])
def download_comparison():
    """Download generated comparison table"""
    try:
        filename = request.args.get('path')
        if not filename:
            return jsonify({'error': 'No filename provided'}), 400
        
        file_path = os.path.join('generated', file_path)
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 404
        
        return send_file(file_path, as_attachment=True)
        
    except Exception as e:
        logger.error(f"Error downloading comparison: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'service': 'excel-integration'})

if __name__ == '__main__':
    # Create necessary directories
    os.makedirs('generated', exist_ok=True)
    os.makedirs('templates', exist_ok=True)
    
    app.run(host='0.0.0.0', port=5000, debug=True)
