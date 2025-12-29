from flask import Flask, jsonify
import json
import os
app = Flask(__name__)

@app.route('/agencies', methods=['GET'])
def names():
    obj = 'json/usds/ecfr/agencies.json'
    if not os.path.exists(obj):
        return jsonify({"error": "File not found"}), 404
    with open(obj, 'r') as f:
        data = json.load(f)
    return jsonify(data), 200

@app.route('/corrections', methods=['GET'])
def fizz():
    obj = 'json/usds/ecfr/corrections.json'
    if not os.path.exists(obj):
        return jsonify({"error": "File not found"}), 404
    with open(obj, 'r') as f:
        data = json.load(f)
    return jsonify(data), 200
