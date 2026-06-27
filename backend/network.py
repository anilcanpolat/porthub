import netifaces
import os

SKIP_PREFIXES = ('docker', 'br-', 'veth', 'virbr')

def _iface_type(iface):
    """Read interface type from kernel: 1=ethernet, 65535=tun/tap, 772=loopback"""
    try:
        with open(f'/sys/class/net/{iface}/type') as f:
            return int(f.read().strip())
    except:
        return -1

def _is_loopback(iface):  return _iface_type(iface) == 772
def _is_tunnel(iface):    return _iface_type(iface) == 65535   # tun/tap/wireguard
def _is_physical(iface):  return _iface_type(iface) == 1

def get_interfaces():
    """
    Generic: groups all local interfaces by MAC (first 5 octets).
    Tunnel interfaces (tailscale, wg, tun*) are attached as aliases
    to whichever physical NIC shares a routing subnet, or to the
    first physical NIC as fallback.
    Loopback is skipped. No IPs are hardcoded.
    """
    physical = {}   # mac5 -> entry
    tunnels  = []   # tun/tap/wireguard with no MAC

    for iface in netifaces.interfaces():
        if any(iface.startswith(p) for p in SKIP_PREFIXES):
            continue
        if _is_loopback(iface):
            continue

        addrs = netifaces.ifaddresses(iface)
        ip    = addrs.get(netifaces.AF_INET,  [{}])[0].get('addr')
        mac   = addrs.get(netifaces.AF_LINK,  [{}])[0].get('addr', '')

        if not ip:
            continue

        if _is_tunnel(iface) or not mac:
            tunnels.append({'iface': iface, 'ip': ip})
            continue

        mac5 = ':'.join(mac.split(':')[:5])
        if mac5 not in physical:
            physical[mac5] = {
                'iface':   iface,
                'ip':      ip,
                'mac':     mac,
                'aliases': []
            }
        else:
            physical[mac5]['aliases'].append(ip)

    # Attach tunnels as aliases — prefer NIC in same /16, else first NIC
    phys_list = list(physical.values())
    for t in tunnels:
        t_prefix = '.'.join(t['ip'].split('.')[:2])
        target = next(
            (p for p in phys_list if '.'.join(p['ip'].split('.')[:2]) == t_prefix),
            phys_list[0] if phys_list else None
        )
        if target:
            target['aliases'].append(f"{t['ip']} ({t['iface']})")
        else:
            # Standalone tunnel — no physical NIC at all (e.g. pure VPN host)
            physical[t['ip']] = {
                'iface': t['iface'], 'ip': t['ip'], 'mac': '', 'aliases': []
            }

    return {
        dev['ip']: {
            'iface':   dev['iface'],
            'mac':     dev['mac'],
            'aliases': dev['aliases']
        }
        for dev in physical.values()
    }
