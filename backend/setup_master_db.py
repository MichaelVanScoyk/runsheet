#!/usr/bin/env python3
"""
Master Database Setup Script

Run this ONCE to set up the multi-tenant infrastructure:
1. Creates cadreport_master database
2. Creates tables
3. Registers glenmoorefc as first tenant

Usage:
    cd /opt/runsheet/backend
    python3 setup_master_db.py
"""

import subprocess
import sys
import os

def run_sql(sql: str, database: str = "postgres"):
    """Run SQL command using psql."""
    result = subprocess.run(
        ["sudo", "-u", "postgres", "psql", "-d", database, "-c", sql],
        capture_output=True,
        text=True
    )
    if result.returncode != 0:
        print(f"Error: {result.stderr}")
        return False
    print(result.stdout)
    return True


def generate_password_hash(password: str) -> str:
    """Generate bcrypt hash for password."""
    import bcrypt
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def main():
    print("=" * 60)
    print("CADReport Master Database Setup")
    print("=" * 60)
    print()
    
    # Check if master database already exists
    print("Checking if cadreport_master database exists...")
    result = subprocess.run(
        ["sudo", "-u", "postgres", "psql", "-lqt"],
        capture_output=True,
        text=True
    )
    
    if "cadreport_master" in result.stdout:
        print("cadreport_master database already exists!")
        response = input("Drop and recreate? (yes/no): ")
        if response.lower() != "yes":
            print("Aborting.")
            return
        
        print("Dropping existing database...")
        run_sql("DROP DATABASE cadreport_master;")
    
    # Create database
    print("\nCreating cadreport_master database...")
    if not run_sql("CREATE DATABASE cadreport_master;"):
        print("Failed to create database")
        return
    
    # Create tables
    print("\nCreating tables...")
    
    tables_sql = """
    CREATE TABLE tenants (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(200) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        database_name VARCHAR(100) NOT NULL,
        neris_fd_id VARCHAR(50),
        neris_state VARCHAR(2) DEFAULT 'PA',
        neris_county VARCHAR(50) DEFAULT 'Chester',
        cad_connection_type VARCHAR(20),
        cad_connection_config JSONB DEFAULT '{}',
        cad_port INTEGER,
        timezone VARCHAR(50) DEFAULT 'America/New_York',
        settings JSONB DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'active',
        trial_ends_at TIMESTAMP WITH TIME ZONE,
        admin_email VARCHAR(255),
        admin_name VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_login_at TIMESTAMP WITH TIME ZONE
    );
    
    CREATE INDEX idx_tenants_slug ON tenants(slug);
    CREATE INDEX idx_tenants_status ON tenants(status);
    
    CREATE TABLE tenant_requests (
        id SERIAL PRIMARY KEY,
        requested_slug VARCHAR(50) NOT NULL,
        department_name VARCHAR(200) NOT NULL,
        contact_name VARCHAR(100) NOT NULL,
        contact_email VARCHAR(255) NOT NULL,
        contact_phone VARCHAR(20),
        county VARCHAR(50),
        state VARCHAR(2) DEFAULT 'PA',
        notes TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        reviewed_by VARCHAR(100),
        reviewed_at TIMESTAMP WITH TIME ZONE,
        rejection_reason TEXT,
        tenant_id INTEGER REFERENCES tenants(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_tenant_requests_status ON tenant_requests(status);
    
    CREATE TABLE tenant_sessions (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        session_token VARCHAR(255) UNIQUE NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        expires_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_tenant_sessions_token ON tenant_sessions(session_token);
    CREATE INDEX idx_tenant_sessions_tenant ON tenant_sessions(tenant_id);
    """
    
    if not run_sql(tables_sql, "cadreport_master"):
        print("Failed to create tables")
        return
    
    print("\nTables created successfully!")
    
    # Generate password hash for glenmoorefc
    print("\nGenerating password hash for glenmoorefc (GMFC4848)...")
    password_hash = generate_password_hash("GMFC4848")
    print(f"Hash: {password_hash}")
    
    # Insert glenmoorefc tenant
    print("\nRegistering glenmoorefc as first tenant...")
    insert_sql = f"""
    INSERT INTO tenants (
        slug, name, password_hash, database_name,
        neris_fd_id, neris_state, neris_county, cad_port, status
    ) VALUES (
        'glenmoorefc',
        'Glen Moore Fire Company',
        '{password_hash}',
        'runsheet_db',
        'FD24027000',
        'PA',
        'Chester',
        19117,
        'active'
    );
    """
    
    if not run_sql(insert_sql, "cadreport_master"):
        print("Failed to insert tenant")
        return
    
    print("\n" + "=" * 60)
    print("Setup Complete!")
    print("=" * 60)
    print()
    print("Master database: cadreport_master")
    print("First tenant: glenmoorefc")
    print("  - Subdomain: glenmoorefc.cadreport.com")
    print("  - Password: GMFC4848")
    print("  - Database: runsheet_db")
    print()
    print("Next steps:")
    print("  1. Restart the backend: cd /opt/runsheet && ./restart.sh")
    print("  2. Test login at /api/tenant/login")
    print()


if __name__ == "__main__":
    main()
