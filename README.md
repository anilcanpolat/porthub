# PortHub

You run a home server. You have Docker containers, systemd services, a VPN, maybe a few devices on the network. You always forget which thing runs on which port.

PortHub fixes that. It scans your interfaces automatically — Ethernet, Wi-Fi, Tailscale, anything active — detects what is running, and shows it as a simple node graph in the browser. Click a node to open the service. No config files, no manual entries.

Most dashboards make you define everything upfront. PortHub discovers it for you.

---

## Quick Start

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python main.py
```

Or with Docker:

```bash
docker compose up -d
```

Open `http://localhost:7777`

---

## What it detects

* Docker containers and their exposed ports

* systemd services with bound ports

* All active network interfaces including VPNs

---

## Requirements

* Python 3.10+

* Docker and/or systemd (optional)

---

## License

MIT
