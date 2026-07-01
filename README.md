# PortHub

<img src="assets/icon.png" width="80">

You run a home server. You have Docker containers, systemd services, a VPN, maybe a few devices on the network. You always forget which thing runs on which port.

PortHub fixes that. It scans your interfaces automatically — Ethernet, Wi-Fi, Tailscale, anything active — detects what is running, and shows it as a simple node graph in the browser. Click a node to open the service. No config files, no manual entries.

Most dashboards make you define everything upfront. PortHub discovers it for you.

## Quick Start

    docker run -d \
      --name porthub \
      --restart unless-stopped \
      --network host \
      -v /var/run/docker.sock:/var/run/docker.sock \
      -v /run/systemd:/run/systemd:ro \
      ghcr.io/anilcanpolat/porthub:latest

Open http://localhost:7777

## Labeling containers

If multiple containers share a network namespace (e.g. routing through another container), they will all appear under that container's process name. Fix this by adding labels to your docker-compose.yml:

    your-service:
      image: your-image
      network_mode: service:your-vpn-container
      labels:
        - "porthub.name=Your Service Name"

PortHub will use the label name instead of the process name.

## What it detects

- Docker containers and their exposed ports
- systemd services with bound ports
- All active network interfaces including VPNs

## Requirements

- Docker (recommended)
- Python 3.10+ (if running directly)

## License

GPL-3.0
