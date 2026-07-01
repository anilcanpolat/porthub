import socket
from concurrent.futures import ThreadPoolExecutor, as_completed

COMMON_PORTS = [
    21,22,23,25,53,80,81,443,445,
    3000,3001,3306,5000,5432,5900,
    6767,6881,7878,8080,8096,8191,
    8443,8888,8920,8923,8989,9090,
    9696,9999,1883,1337,5055,7359,
    8099,999,7777,8923,22
]

def _check(ip, port, timeout=0.3):
    try:
        s = socket.socket()
        s.settimeout(timeout)
        r = s.connect_ex((ip, port))
        s.close()
        return port if r == 0 else None
    except:
        return None

def scan_ports(ip, ports=None):
    targets = ports or COMMON_PORTS
    open_ports = []
    with ThreadPoolExecutor(max_workers=50) as ex:
        futures = {ex.submit(_check, ip, p): p for p in targets}
        for f in as_completed(futures):
            r = f.result()
            if r:
                open_ports.append(r)
    return open_ports
