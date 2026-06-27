import docker

def get_docker_services():
    services = []
    seen = set()  # (host_port) dedup across IPv4/IPv6 bindings

    try:
        client = docker.from_env()
        containers = client.containers.list()

        # Map internal port -> real container name (for shared network_mode containers)
        port_to_name = {}
        for c in containers:
            net_mode = c.attrs.get('HostConfig', {}).get('NetworkMode', '')
            if net_mode.startswith('service:'):
                exposed = c.attrs.get('Config', {}).get('ExposedPorts') or {}
                for port_proto in exposed:
                    port = port_proto.split('/')[0]
                    try:
                        port_to_name[int(port)] = c.name
                    except ValueError:
                        pass

        for c in containers:
            for container_port, bindings in (c.ports or {}).items():
                if not bindings:
                    continue
                internal_port = int(container_port.split('/')[0])
                for binding in bindings:
                    host_port = binding.get('HostPort')
                    if not host_port:
                        continue
                    hp = int(host_port)
                    if hp in seen:
                        continue
                    seen.add(hp)
                    label = port_to_name.get(internal_port) or c.name
                    services.append({
                        'port':   hp,
                        'label':  label,
                        'source': 'docker'
                    })

    except Exception as e:
        print(f"Docker error: {e}")

    return services
