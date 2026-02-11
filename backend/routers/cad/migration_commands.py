"""
Migration command generation — shell commands for each migration step.

Separated from migration endpoints to keep both files manageable.
"""


# Step definitions (data, not code)
MIGRATION_STEPS = [
    {'order': 1, 'name': 'reserve_port',
     'description': 'Reserve a port on the destination node'},
    {'order': 2, 'name': 'backup_tenant_db',
     'description': 'Create a backup of the tenant database on the source node'},
    {'order': 3, 'name': 'transfer_database',
     'description': 'Transfer database backup to destination node and restore'},
    {'order': 4, 'name': 'provision_listener',
     'description': 'Create listener configuration on the destination node'},
    {'order': 5, 'name': 'test_parser',
     'description': 'Run test data through the parser on the destination node'},
    {'order': 6, 'name': 'verify_forwarding',
     'description': 'Test forwarding destinations from the destination node'},
    {'order': 7, 'name': 'stop_source',
     'description': 'Stop the listener on the source node'},
    {'order': 8, 'name': 'update_dns_routing',
     'description': 'Update DNS/nginx to point tenant to destination node'},
    {'order': 9, 'name': 'start_destination',
     'description': 'Start the listener on the destination node'},
    {'order': 10, 'name': 'verify_live_data',
     'description': 'Confirm live CAD data is flowing through the destination'},
]


def get_migration_context(db, migration_id):
    """Load full context needed for migration commands"""
    m = db.fetchone("""
        SELECT m.id, m.listener_id, m.tenant_id, m.source_node_id, m.destination_node_id,
               m.destination_port, m.status,
               l.tenant_slug, l.port as source_port, l.api_url, l.timezone,
               l.inbound_type, l.parser_template_id, l.inbound_config,
               sn.name as source_name, sn.hostname as source_host, sn.ip_address as source_ip,
               dn.name as dest_name, dn.hostname as dest_host, dn.ip_address as dest_ip,
               t.name as tenant_name, t.database_name,
               pt.name as parser_name
        FROM cad_migrations m
        JOIN cad_listeners l ON l.id = m.listener_id
        JOIN cad_server_nodes sn ON sn.id = m.source_node_id
        JOIN cad_server_nodes dn ON dn.id = m.destination_node_id
        JOIN tenants t ON t.id = m.tenant_id
        JOIN cad_parser_templates pt ON pt.id = l.parser_template_id
        WHERE m.id = %s
    """, (migration_id,))

    if not m:
        return None

    return {
        'migration_id': m[0], 'listener_id': m[1], 'tenant_id': m[2],
        'source_node_id': m[3], 'destination_node_id': m[4],
        'destination_port': m[5], 'status': m[6],
        'tenant_slug': m[7], 'source_port': m[8], 'api_url': m[9],
        'timezone': m[10], 'inbound_type': m[11],
        'parser_template_id': m[12], 'inbound_config': m[13] or {},
        'source_name': m[14], 'source_host': m[15], 'source_ip': m[16],
        'dest_name': m[17], 'dest_host': m[18], 'dest_ip': m[19],
        'tenant_name': m[20], 'database_name': m[21], 'parser_name': m[22],
    }


def generate_step_commands(step_name, ctx):
    """Generate shell commands for a migration step."""
    slug = ctx['tenant_slug']
    db_name = ctx['database_name']
    src_host = ctx['source_host']
    dst_host = ctx['dest_host']
    src_port = ctx['source_port']
    dst_port = ctx['destination_port']
    api_url = ctx['api_url']
    tz = ctx['timezone']
    ssh_src = f"ssh dashboard@{src_host}"
    ssh_dst = f"ssh dashboard@{dst_host}"

    commands = {
        'reserve_port': {
            'target': 'master',
            'description': f'Reserve port {dst_port} on {ctx["dest_name"]}',
            'commands': [
                f'# Port {dst_port} reserved in database.',
                f'{ssh_dst} "ss -tlnp | grep :{dst_port} || echo PORT_AVAILABLE"',
            ],
            'rollback': '# Release port reservation in database',
        },
        'backup_tenant_db': {
            'target': 'source',
            'description': f'Backup {db_name} on {ctx["source_name"]}',
            'commands': [
                f'{ssh_src} "sudo -u postgres pg_dump -Fc {db_name} > /tmp/{slug}_migration.dump"',
                f'{ssh_src} "ls -lh /tmp/{slug}_migration.dump"',
            ],
            'rollback': f'{ssh_src} "rm -f /tmp/{slug}_migration.dump"',
        },
        'transfer_database': {
            'target': 'both',
            'description': f'Transfer {db_name} to {ctx["dest_name"]}',
            'commands': [
                f'scp dashboard@{src_host}:/tmp/{slug}_migration.dump dashboard@{dst_host}:/tmp/',
                f'{ssh_dst} "sudo -u postgres createdb {db_name}"',
                f'{ssh_dst} "sudo -u postgres pg_restore -d {db_name} /tmp/{slug}_migration.dump"',
                f'{ssh_dst} "sudo -u postgres psql -c \\"GRANT ALL ON DATABASE {db_name} TO dashboard;\\""',
                f'{ssh_dst} "sudo -u postgres psql -d {db_name} -c \\"GRANT ALL ON ALL TABLES IN SCHEMA public TO dashboard;\\""',
                f'{ssh_dst} "sudo -u postgres psql -d {db_name} -c \\"GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO dashboard;\\""',
            ],
            'rollback': f'{ssh_dst} "sudo -u postgres dropdb --if-exists {db_name}"',
        },
        'provision_listener': {
            'target': 'destination',
            'description': f'Set up listener for {slug} on {ctx["dest_name"]}',
            'commands': [
                f'{ssh_dst} "mkdir -p /opt/runsheet/cad/logs"',
                f'{ssh_dst} "cd /opt/runsheet && git pull"',
                f'{ssh_dst} "/opt/runsheet/runsheet_env/bin/python --version"',
            ],
            'rollback': '# No cleanup needed',
        },
        'test_parser': {
            'target': 'destination',
            'description': f'Test parser ({ctx["parser_name"]}) on {ctx["dest_name"]}',
            'commands': [
                f'{ssh_dst} "cd /opt/runsheet/cad && /opt/runsheet/runsheet_env/bin/python -c \\"from cad_parser import parse_cad_html; print(\'OK\')\\""',
            ],
            'rollback': '# No cleanup needed',
        },
        'verify_forwarding': {
            'target': 'destination',
            'description': 'Verify forwarding destinations reachable from destination',
            'commands': [
                f'{ssh_dst} "echo \'Forwarding connectivity test placeholder\'"',
            ],
            'rollback': '# No cleanup needed',
        },
        'stop_source': {
            'target': 'source',
            'description': f'Stop listener on {ctx["source_name"]} (port {src_port})',
            'commands': [
                f'# === CUTOVER — DATA STOPS UNTIL STEP 9 ===',
                f'{ssh_src} "pkill -f \'cad_listener.py.*--port {src_port}\' || echo \'Not running\'"',
                f'{ssh_src} "ss -tlnp | grep :{src_port} && echo STILL_RUNNING || echo STOPPED"',
            ],
            'rollback': (
                f'{ssh_src} "cd /opt/runsheet/cad && nohup /opt/runsheet/runsheet_env/bin/python '
                f'cad_listener.py --port {src_port} --tenant {slug} --api-url {api_url} '
                f'--timezone {tz} > /opt/runsheet/cad/logs/{slug}.log 2>&1 &"'
            ),
        },
        'update_dns_routing': {
            'target': 'master',
            'description': f'Update routing for {slug}.cadreport.com',
            'commands': [
                f'# Update nginx proxy_pass or DNS A record:',
                f'#   Old: {ctx["source_ip"]}:{src_port}',
                f'#   New: {ctx["dest_ip"]}:{dst_port}',
                f'# sudo nginx -t && sudo systemctl reload nginx',
            ],
            'rollback': f'# Revert routing back to {ctx["source_ip"]}:{src_port}',
        },
        'start_destination': {
            'target': 'destination',
            'description': f'Start listener on {ctx["dest_name"]} (port {dst_port})',
            'commands': [
                f'{ssh_dst} "cd /opt/runsheet/cad && nohup /opt/runsheet/runsheet_env/bin/python cad_listener.py '
                f'--port {dst_port} --tenant {slug} --api-url http://127.0.0.1:8001 --timezone {tz} '
                f'> /opt/runsheet/cad/logs/{slug}.log 2>&1 &"',
                f'{ssh_dst} "sleep 2 && ss -tlnp | grep :{dst_port} && echo RUNNING || echo FAILED"',
                f'# === CUTOVER COMPLETE ===',
            ],
            'rollback': f'{ssh_dst} "pkill -f \'cad_listener.py.*--port {dst_port}\'"',
        },
        'verify_live_data': {
            'target': 'destination',
            'description': f'Verify live data on {ctx["dest_name"]}',
            'commands': [
                f'{ssh_dst} "tail -5 /opt/runsheet/cad/logs/{slug}.log"',
                f'curl -s https://{slug}.cadreport.com/api/health',
            ],
            'rollback': '# If verification fails, execute full rollback',
        },
    }

    return commands.get(step_name, {
        'target': 'unknown', 'description': f'Unknown: {step_name}',
        'commands': [], 'rollback': '',
    })
