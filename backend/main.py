from flask import Flask, jsonify, send_from_directory
from scanner import scan_ports
from docker_watcher import get_docker_services
from systemctl_watcher import get_systemctl_services
from network import get_interfaces
import os

app = Flask(__name__, static_folder='../frontend')

@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')

@app.route('/api/services')
def services():
    result = {}

    interfaces = get_interfaces()

    for iface, ip in interfaces.items():
        services = []

        # Docker
        for svc in get_docker_services():
            services.append(svc)

        # Systemctl
        for svc in get_systemctl_services():
            services.append(svc)

        # Port scan
        for port in scan_ports(ip):
            services.append({
                'port': port,
                'label': 'Unknown',
                'source': 'port-scan'
            })

        if services:
            result[ip] = services

    return jsonify(result)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=7777, debug=False)
