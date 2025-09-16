# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VSHN Conferenceli is a conference booth attraction system that runs on a Raspberry Pi with K3s. It combines physical hardware (red button, LED shipping containers, fog machine, label printer) with web applications to create an interactive Kubernetes chaos engineering demonstration.

## Architecture

The system consists of two main Python Flask applications:

### Podstatus Application (`podstatus/`)
- **Purpose**: Live Kubernetes pod monitoring and chaos engineering interface
- **Key Features**: 
  - Real-time pod/node status display using htmx with Server-Sent Events
  - Chaos pod deletion via authenticated `/chaos` endpoint
  - BlinkStick LED controller for physical shipping containers
  - Kubernetes API integration with watch streams
- **Entry Point**: `podstatus/app.py`
- **Config**: `podstatus/config.py`
- **LED Controller**: `podstatus/blinkstick-controller.py`

### Contactform Application (`contactform/`)
- **Purpose**: Conference lead collection and label printing
- **Key Features**:
  - Lead collection forms that integrate with Odoo CRM
  - APPUiO voucher generation and printing
  - Booth raffle ticket printing
  - Brother QL label printer integration
- **Entry Point**: `contactform/app.py`
- **Config**: `contactform/config.py`
- **Key Modules**: `odoo_client.py`, `label_voucher.py`, `label_raffle.py`

## Development Commands

### Environment Setup
```bash
# Install dependencies using uv (Python package manager)
uv sync

# Create virtual environment if needed
uv venv
source .venv/bin/activate
```

### Running Applications Locally

#### Podstatus (Development)
```bash
FLASK_APP="podstatus/app.py" PYTHONPATH="podstatus" uv run flask run --reload
```

#### Contactform (Development)
```bash
FLASK_APP="contactform/app.py" PYTHONPATH="contactform" uv run flask run --reload
```

### Production Deployment
Both apps run with gunicorn in production:
```bash
# Podstatus
GUNICORN_WORKERS=1 PYTHONPATH=./podstatus GUNICORN_BIND='0.0.0.0:8000' gunicorn -k gevent podstatus.app:app

# Contactform
GUNICORN_WORKERS=1 PYTHONPATH=./contactform GUNICORN_BIND='0.0.0.0:8000' gunicorn contactform.app:app
```

### Code Formatting
```bash
uv run black .
```

## Dependencies and Package Management

- **Package Manager**: UV (astral.sh/uv) - modern Python dependency resolver
- **Python Version**: >=3.12 (see pyproject.toml)
- **Key Dependencies**: Flask, Kubernetes client, BlinkStick, brother-ql-web, requests, gevent
- **Configuration**: All dependencies defined in `pyproject.toml`

## Kubernetes Deployment

The project uses GitOps with Argo CD for deployment:

### Setup Commands
```bash
# Install Argo CD
kubectl create ns argocd
kubectl -n argocd apply -f deployment/apps/argocd/install.yaml
kubectl -n argocd apply -f deployment/argoapps

# Apply secrets manually (not in GitOps)
kubectl -n $app apply -f deployment/apps/$app/secret.yaml
```

### Deployment Structure
- `deployment/argoapps/`: Argo CD Application definitions
- `deployment/apps/`: Kubernetes manifests organized by application
- Each app has: deployment, service, rbac, secret templates

## Hardware Integration

### BlinkStick LEDs
- Controller code: `podstatus/blinkstick-controller.py`
- Watches Kubernetes pod events and updates LED colors on shipping containers
- Each LED represents a pod's health status

### Red Chaos Button
- Puck.js Bluetooth device emulating keyboard input
- Wayfire WM configuration maps Ctrl+Alt+G to chaos endpoint curl
- Code for Puck.js: `puckjs-redbutton.js`

### Label Printer (Brother QL series)
- Network-connected via DHCP (IP: 192.168.173.100)
- Uses brother-ql-web library for printing
- Generates QR codes for APPUiO vouchers and raffle tickets

## Configuration Files

### Application Secrets
Create these files for local development (they contain sensitive data):
- `podstatus/config.py` - Kubernetes config, Flask secrets
- `contactform/config.py` - Odoo credentials, printer settings

### Hardware Configuration
- `frpc.toml` - Reverse proxy configuration for internet access
- `brother-config.json` - Label printer configuration
- `config.json` - General hardware settings

## Key Technical Patterns

1. **Gevent Integration**: Both apps use gevent monkey patching for async I/O
2. **Kubernetes Watchers**: Real-time pod status using K8s watch streams
3. **Server-Sent Events**: Live updates to web UI without polling
4. **HTMX**: Dynamic UI updates without full page reloads
5. **Flask-Bootstrap**: Consistent UI theming (darkly for podstatus, sandstone for contactform)

## Development Notes

- The system is designed to run on Raspberry Pi with limited resources
- All container images are built with multi-arch support
- Internet connectivity required for Odoo integration and container pulls
- Local DHCP server on eth0 for printer networking