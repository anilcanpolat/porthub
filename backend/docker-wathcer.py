import docker

def get_docker_services():
    services = []
    try:
        client = docker.from_env()
        containers = client.containers.list()
        for container in containers:
            ports = container.ports
            for container_port, bindings in ports.items():
                if bindings:
                    for binding in bindings:
                        host_port = binding.get('HostPort')
                        if host_port:
                            services.append({
                                'port': int(host_port),
                                'label': container.name,
                                'source': 'docker'
                            })
    except Exception as e:
        print(f"Docker error: {e}")
    return services
