import subprocess
import re

def get_systemctl_services():
    services = []
    try:
        result = subprocess.run(
            ['systemctl', 'list-units', '--type=service', '--state=running', '--no-pager', '--plain'],
            capture_output=True, text=True
        )
        lines = result.stdout.splitlines()
        for line in lines:
            parts = line.split()
            if parts:
                name = parts[0].replace('.service', '')
                port = get_service_port(name)
                if port:
                    services.append({
                        'port': port,
                        'label': name,
                        'source': 'systemctl'
                    })
    except Exception as e:
        print(f"Systemctl error: {e}")
    return services

def get_service_port(service_name):
    try:
        result = subprocess.run(
            ['ss', '-tlnp', f'sport = :{service_name}'],
            capture_output=True, text=True
        )
        match = re.search(r':(\d+)', result.stdout)
        if match:
            return int(match.group(1))
    except Exception:
        pass
    return None
