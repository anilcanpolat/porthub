import socket
import netifaces

def get_interfaces():
    interfaces = {}
    try:
        for iface in netifaces.interfaces():
            addrs = netifaces.ifaddresses(iface)
            if netifaces.AF_INET in addrs:
                ip = addrs[netifaces.AF_INET][0]['addr']
                if not ip.startswith('127.'):
                    interfaces[iface] = ip
    except Exception as e:
        print(f"Network error: {e}")

    # Always include localhost
    interfaces['localhost'] = '127.0.0.1'
    return interfaces
