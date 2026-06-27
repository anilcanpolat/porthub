from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from scanner import scan_ports
from docker_watcher import get_docker_services
from systemctl_watcher import get_systemctl_services
from network import get_interfaces
import socket, os

FRONTEND = os.path.join(os.path.dirname(__file__), '../frontend')
app = FastAPI()

@app.get('/api/services')
def services():
    result   = {}
    docker_svcs   = get_docker_services()
    systemctl_svcs = get_systemctl_services()

    for ip, meta in get_interfaces().items():
        seen_ports = set()
        svcs = []

        for svc in docker_svcs + systemctl_svcs:
            if svc['port'] not in seen_ports:
                seen_ports.add(svc['port'])
                svcs.append(svc)

        for port in scan_ports(ip):
            if port not in seen_ports:
                seen_ports.add(port)
                svcs.append({'port': port, 'label': 'Unknown', 'source': 'port-scan'})

        result[ip] = {
            'iface':    meta['iface'],
            'mac':      meta['mac'],
            'aliases':  meta['aliases'],
            'services': svcs
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

app.mount('/', StaticFiles(directory=FRONTEND, html=True), name='static')

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=7777)
