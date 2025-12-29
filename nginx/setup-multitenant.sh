#!/bin/bash
# CADReport Multi-Tenant Setup Script
# Run this on the server as root or with sudo

set -e

echo "==================================="
echo "CADReport Multi-Tenant Setup"
echo "==================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root or with sudo"
    exit 1
fi

# Install apache2-utils for htpasswd if not present
if ! command -v htpasswd &> /dev/null; then
    echo "Installing apache2-utils for htpasswd..."
    apt-get update && apt-get install -y apache2-utils
fi

# Create landing page directory
echo "Creating landing page directory..."
mkdir -p /var/www/cadreport-landing

# Copy landing page (assumes this script is run from /opt/runsheet)
echo "Copying landing page..."
cp /opt/runsheet/nginx/landing/index.html /var/www/cadreport-landing/

# Create htpasswd file with glenmoorefc credentials
echo "Creating htpasswd file..."
# Format: htpasswd -cb /etc/nginx/.htpasswd username password
htpasswd -cb /etc/nginx/.htpasswd glenmoorefc GMFC4848
echo "  Added user: glenmoorefc"

# Backup existing nginx config
echo "Backing up existing nginx config..."
cp /etc/nginx/sites-available/cadreport /etc/nginx/sites-available/cadreport.backup.$(date +%Y%m%d_%H%M%S)

# Copy new nginx config
echo "Installing new nginx config..."
cp /opt/runsheet/nginx/cadreport.conf /etc/nginx/sites-available/cadreport

# Test nginx config
echo "Testing nginx configuration..."
nginx -t

# Reload nginx
echo "Reloading nginx..."
systemctl reload nginx

echo ""
echo "==================================="
echo "Setup Complete!"
echo "==================================="
echo ""
echo "URLs:"
echo "  - cadreport.com          → Landing page (public)"
echo "  - glenmoorefc.cadreport.com → App (protected)"
echo ""
echo "Login Credentials:"
echo "  Username: glenmoorefc"
echo "  Password: GMFC4848"
echo ""
echo "To add more tenants:"
echo "  sudo htpasswd /etc/nginx/.htpasswd newusername"
echo ""
