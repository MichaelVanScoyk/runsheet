# CADReport Multi-Tenant Setup

## Architecture

```
cadreport.com                    → Public landing page (no auth)
glenmoorefc.cadreport.com        → Protected app (basic auth)
[tenant].cadreport.com           → Each tenant has own subdomain + credentials
```

## Files

- `cadreport.conf` - Nginx configuration
- `landing/index.html` - Public marketing landing page
- `setup-multitenant.sh` - One-time setup script

## Initial Setup

1. Push to git and pull on server:
   ```bash
   # On Windows
   cd C:\Users\micha\runsheet
   git add -A
   git commit -m "Add multi-tenant nginx config and landing page"
   git push

   # On server
   cd /opt/runsheet && git pull
   ```

2. Run the setup script:
   ```bash
   sudo bash /opt/runsheet/nginx/setup-multitenant.sh
   ```

## Managing Tenants

### Add a new tenant
```bash
sudo htpasswd /etc/nginx/.htpasswd newtenantname
# Enter password when prompted
```

### Remove a tenant
```bash
sudo htpasswd -D /etc/nginx/.htpasswd tenantname
```

### Change tenant password
```bash
sudo htpasswd /etc/nginx/.htpasswd existingtenantname
# Enter new password when prompted
```

### View all tenants
```bash
cat /etc/nginx/.htpasswd
```

## Current Tenants

| Subdomain | Username | Password |
|-----------|----------|----------|
| glenmoorefc.cadreport.com | glenmoorefc | GMFC4848 |

## Updating Landing Page

1. Edit `nginx/landing/index.html`
2. Push to git
3. On server:
   ```bash
   cd /opt/runsheet && git pull
   sudo cp /opt/runsheet/nginx/landing/index.html /var/www/cadreport-landing/
   ```

## Future Enhancements

- [ ] Application-level auth (database-backed users)
- [ ] Per-tenant database isolation
- [ ] SSL/HTTPS (Let's Encrypt)
- [ ] Tenant self-service signup
