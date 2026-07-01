import subprocess
import re

SKIP_PREFIXES = ('docker', 'br-', 'veth', 'virbr', 'lo')
SKIP_IP_PREFIXES = ('172.1', '172.2', '172.3')
OVERLAY_PREFIXES = ('tailscale', 'wg', 'zt', 'ts')
PRIMARY_HINTS = ('eth', 'wlan', 'en')

def get_interfaces():
    try:
        out = subprocess.check_output(['ip', 'addr'], text=True)
    except Exception:
        return {}

    interfaces = {}
    current = None

    for line in out.splitlines():
        m = re.match(r'^\d+: (\S+):', line)
        if m:
            current = m.group(1).rstrip(':')
            interfaces[current] = {'name': current, 'ips': [], 'mac': None}
        if current:
            mac_m = re.search(r'link/ether\s+([0-9a-f:]{17})', line)
            if mac_m:
                interfaces[current]['mac'] = mac_m.group(1)
            ip_m = re.search(r'inet\s+(\d+\.\d+\.\d+\.\d+)', line)
            if ip_m:
                interfaces[current]['ips'].append(ip_m.group(1))

    physical = {}
    overlay_ips = []

    for name, data in interfaces.items():
        if any(name.startswith(p) for p in SKIP_PREFIXES):
            continue
        if not data['ips']:
            continue
        if any(ip.startswith(p) for ip in data['ips'] for p in SKIP_IP_PREFIXES):
            continue
        if any(name.startswith(p) for p in OVERLAY_PREFIXES):
            overlay_ips.extend(data['ips'])
            continue
        physical[name] = data

    seen_macs = {}
    result = {}

    ordered_names = sorted(
        physical.keys(),
        key=lambda n: (not any(n.startswith(p) for p in PRIMARY_HINTS), n)
    )

    for name in ordered_names:
        data = physical[name]
        mac = data['mac']
        mac_key = ':'.join(mac.split(':')[:5]) if mac else name

        if mac_key in seen_macs:
            primary_ip = seen_macs[mac_key]
            result[primary_ip]['aliases'].extend(data['ips'])
        else:
            primary_ip = data['ips'][0]
            result[primary_ip] = {
                'iface': name,
                'mac': mac,
                'aliases': data['ips'][1:]
            }
            seen_macs[mac_key] = primary_ip

    if overlay_ips and result:
        primary_ip = next(iter(result))
        result[primary_ip]['aliases'].extend(overlay_ips)

    return result
