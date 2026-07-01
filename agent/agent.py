import socket
import requests
import time
import platform
import os

PORTHUB_URL = os.environ.get('PORTHUB_URL', 'http://YOUR_PORTHUB_IP:7777/api/agent')
AGENT_SECRET = os.environ.get('PORTHUB_AGENT_SECRET', 'changeme')
REPORT_INTERVAL = int(os.environ.get('PORTHUB_REPORT_INTERVAL', '30'))

COMMON_PORTS = [
    21, 22, 23, 25, 53, 80, 443, 3000, 3001, 3306,
    5000, 5432, 6379, 7000, 8000, 8080, 8081, 8443,
    8888, 9000, 9090, 9100, 9443, 27017
]

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    finally:
        s.close()

def scan_open_ports(ports=COMMON_PORTS, timeout=0.5):
    open_ports = []
    for port in ports:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            if sock.connect_ex(('127.0.0.1', port)) == 0:
                open_ports.append(port)
            sock.close()
        except Exception:
            pass
    return open_ports

def report():
    payload = {
        "hostname": platform.node(),
        "ip": get_local_ip(),
        "os": platform.system(),
        "ports": scan_open_ports(),
        "secret": AGENT_SECRET
    }
    try:
        requests.post(PORTHUB_URL, json=payload, timeout=5)
        print(f"Reported: {payload}")
    except Exception as e:
        print(f"Failed to report: {e}")

if __name__ == '__main__':
    print("PortHub Agent running...")
    while True:
        report()
        time.sleep(REPORT_INTERVAL)
