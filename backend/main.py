from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from scanner import scan_ports
from docker_watcher import get_docker_services
from systemctl_watcher import get_systemctl_services
from network import get_interfaces
import socket, os, yaml, time

FRONTEND = os.path.join(os.path.dirname(__file__), '../frontend')
CONFIG_PATH = os.path.join(os.path.dirname(__file__), '../config/config.yaml')

def load_config():
    try:
        with open(CONFIG_PATH) as f:
            return yaml.safe_load(f) or {}
    except FileNotFoundError:
        return {}

config = load_config()
PORT = config.get('porthub', {}).get('port', 7777)
IGNORED_PORTS = set(config.get('network', {}).get('ignored_ports') or [])
MANUAL_DEVICES = config.get('devices', {}).get('manual') or []
AGENT_ENABLED = config.get('agent', {}).get('enabled', False)
AGENT_SECRET = config.get('agent', {}).get('secret', '')

app = FastAPI()
agent_hosts = {}  # ip -> {hostname, os, ports, last_seen}

@app.get('/api/services')
def services():
    result = {}
    docker_svcs = get_docker_services()
    systemctl_svcs = get_systemctl_services()

    for ip, meta in get_interfaces().items():
        seen_ports = set()
        svcs = []

        for svc in docker_svcs + systemctl_svcs:
            if svc['port'] in IGNORED_PORTS or svc['port'] in seen_ports:
                continue
            seen_ports.add(svc['port'])
            svcs.append(svc)

        for port in scan_ports(ip):
            if port in IGNORED_PORTS or port in seen_ports:
                continue
            seen_ports.add(port)
            label = 'PortHub' if port == PORT else 'Unknown'
            svcs.append({'port': port, 'label': label, 'source': 'port-scan'})

        result[ip] = {
            'iface':    meta['iface'],
            'mac':      meta['mac'],
            'aliases':  meta['aliases'],
            'services': svcs
        }

    for dev in MANUAL_DEVICES:
        ip = dev.get('ip')
        if not ip:
            continue
        result[ip] = {
            'iface': dev.get('label', ip),
            'mac': None,
            'aliases': [],
            'services': [
                {'port': p, 'label': dev.get('label', 'Manual'), 'source': 'manual'}
                for p in dev.get('ports', []) if p not in IGNORED_PORTS
            ]
        }

    for ip, info in agent_hosts.items():
        result[ip] = {
            'iface': info.get('hostname', ip),
            'mac': None,
            'aliases': [],
            'services': [
                {'port': p, 'label': info.get('hostname', 'Agent'), 'source': 'agent'}
                for p in info.get('ports', []) if p not in IGNORED_PORTS
            ]
        }

    return result

@app.post('/api/check')
async def check_port(request: Request):
    data = await request.json()
    host = data.get('host', '127.0.0.1')
    port = int(data.get('port', 0))
    try:
        s = socket.socket()
        s.settimeout(0.5)
        r = s.connect_ex((host, port))
        s.close()
        return {'open': r == 0}
    except Exception:
        return {'open': False}

@app.post('/api/agent')
async def agent_report(request: Request):
    if not AGENT_ENABLED:
        raise HTTPException(status_code=403, detail='Agent reporting disabled')

    data = await request.json()

    if AGENT_SECRET and data.get('secret') != AGENT_SECRET:
        raise HTTPException(status_code=401, detail='Invalid agent secret')

    ip = data.get('ip')
    if not ip:
        raise HTTPException(status_code=400, detail='Missing ip')

    agent_hosts[ip] = {
        'hostname': data.get('hostname', ip),
        'os': data.get('os', 'unknown'),
        'ports': data.get('ports', []),
        'last_seen': time.time()
    }
    return {'status': 'ok'}

app.mount('/', StaticFiles(directory=FRONTEND, html=True), name='static')

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=PORT)
