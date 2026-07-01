import docker

def get_docker_services():
    services = []
    seen = set()

    try:
        client = docker.from_env()
        containers = client.containers.list()

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
            labels = c.labels or {}
            custom_label = labels.get('porthub.name')
            net_mode = c.attrs.get('HostConfig', {}).get('NetworkMode', '')

            if net_mode == 'host':
                exposed = c.attrs.get('Config', {}).get('ExposedPorts') or {}
                for port_proto in exposed:
                    try:
                        hp = int(port_proto.split('/')[0])
                    except ValueError:
                        continue
                    if hp in seen:
                        continue
                    seen.add(hp)
                    services.append({
                        'port': hp,
                        'label': custom_label or c.name,
                        'source': 'docker'
                    })
                continue

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

                    port_label = labels.get(f'porthub.port.{hp}')
                    label = (
                        port_label
                        or custom_label
                        or port_to_name.get(internal_port)
                        or c.name
                    )
                    services.append({
                        'port': hp,
                        'label': label,
                        'source': 'docker'
                    })

    except Exception as e:
        print(f"Docker error: {e}")

    return services
