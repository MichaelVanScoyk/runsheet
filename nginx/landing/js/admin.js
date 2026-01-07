// CADReport Admin Dashboard JavaScript

let currentAdmin = null;
let selectedTenantId = null;
let tenantsCache = [];

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', checkSession);

async function checkSession() {
    try {
        const res = await fetch('/api/master/me', { credentials: 'include' });
        if (res.ok) {
            currentAdmin = await res.json();
            document.getElementById('adminName').textContent = currentAdmin.name || currentAdmin.email;
            document.getElementById('adminRole').textContent = currentAdmin.role;
            loadStats();
            loadTenants();
        } else {
            window.location.href = '/';
        }
    } catch (err) {
        window.location.href = '/';
    }
}

// ===== TAB NAVIGATION =====
function switchTab(tabName) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('tab-' + tabName).classList.add('active');
    
    if (tabName === 'admins') loadAdmins();
    if (tabName === 'audit') loadAuditLog();
    if (tabName === 'database') loadDatabaseTab();
    if (tabName === 'users') loadUsersTenantSelect();
}

// ===== STATS =====
async function loadStats() {
    try {
        const res = await fetch('/api/master/system/stats', { credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            const stats = data.tenants || {};
            document.getElementById('adminStats').innerHTML = `
                <div class="admin-stat">
                    <div class="admin-stat-value">${stats.active || 0}</div>
                    <div class="admin-stat-label">Active</div>
                </div>
                <div class="admin-stat">
                    <div class="admin-stat-value pending">${stats.pending || 0}</div>
                    <div class="admin-stat-label">Pending</div>
                </div>
                <div class="admin-stat">
                    <div class="admin-stat-value">${stats.suspended || 0}</div>
                    <div class="admin-stat-label">Suspended</div>
                </div>
                <div class="admin-stat">
                    <div class="admin-stat-value">${stats.total || 0}</div>
                    <div class="admin-stat-label">Total</div>
                </div>
            `;
        }
    } catch (err) {
        console.error('Failed to load stats:', err);
    }
}

// ===== TENANTS =====
async function loadTenants() {
    const filter = document.getElementById('tenantFilter').value;
    const url = filter ? `/api/master/tenants?status=${filter}` : '/api/master/tenants';
    
    try {
        const res = await fetch(url, { credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            tenantsCache = data.tenants || [];
            renderTenantsList();
        }
    } catch (err) {
        console.error('Failed to load tenants:', err);
    }
}

function renderTenantsList() {
    const list = document.getElementById('tenantsList');
    if (tenantsCache.length === 0) {
        list.innerHTML = '<div class="empty-state">No tenants found</div>';
        return;
    }
    
    list.innerHTML = tenantsCache.map(t => `
        <div class="tenant-card status-${(t.status || '').toLowerCase()} ${selectedTenantId === t.id ? 'selected' : ''}" onclick="selectTenant(${t.id})">
            <div class="tenant-name">${t.name || t.slug}</div>
            <div class="tenant-slug">${t.slug}.cadreport.com</div>
            <span class="tenant-status ${(t.status || '').toLowerCase()}">${t.status}</span>
        </div>
    `).join('');
}

async function selectTenant(id) {
    selectedTenantId = id;
    renderTenantsList();
    
    try {
        const res = await fetch(`/api/master/tenants/${id}`, { credentials: 'include' });
        if (!res.ok) return;
        const tenant = await res.json();
        
        const detail = document.getElementById('tenantDetail');
        detail.style.display = 'block';
        
        let actions = '';
        if (tenant.status === 'PENDING') {
            actions = `
                <button onclick="approveTenant(${id})" class="btn btn-success btn-small">✓ Approve</button>
                <button onclick="rejectTenant(${id})" class="btn btn-danger btn-small">✕ Reject</button>
            `;
        } else if (tenant.status === 'ACTIVE') {
            actions = `
                <button onclick="resetTenantPassword(${id})" class="btn btn-outline btn-small">🔑 Reset Password</button>
                <button onclick="suspendTenant(${id})" class="btn btn-warning btn-small">⏸ Suspend</button>
            `;
        } else if (tenant.status === 'SUSPENDED') {
            actions = `<button onclick="reactivateTenant(${id})" class="btn btn-primary btn-small">▶ Reactivate</button>`;
        }
        
        document.getElementById('tenantDetailContent').innerHTML = `
            <div class="detail-row"><label>Name:</label><input type="text" id="edit-name" value="${tenant.name || ''}"></div>
            <div class="detail-row"><label>Subdomain:</label><span>${tenant.slug}.cadreport.com</span></div>
            <div class="detail-row"><label>Status:</label><span class="tenant-status ${(tenant.status || '').toLowerCase()}">${tenant.status}</span></div>
            <div class="detail-row"><label>Contact:</label><input type="text" id="edit-contact" value="${tenant.contact_name || ''}"></div>
            <div class="detail-row"><label>Email:</label><input type="email" id="edit-email" value="${tenant.contact_email || ''}"></div>
            <div class="detail-row"><label>Phone:</label><input type="tel" id="edit-phone" value="${tenant.contact_phone || ''}"></div>
            <div class="detail-row"><label>County:</label><input type="text" id="edit-county" value="${tenant.county || ''}"></div>
            <div class="detail-row"><label>CAD Port:</label><span>${tenant.cad_port || 'Not assigned'}</span></div>
            <div class="detail-row"><label>Database:</label><span>${tenant.database_name || 'Not created'}</span></div>
            <div class="detail-row"><label>Created:</label><span>${tenant.created_at ? new Date(tenant.created_at).toLocaleString() : '-'}</span></div>
            ${tenant.notes ? `<div class="detail-row"><label>Notes:</label><span>${tenant.notes}</span></div>` : ''}
            <div id="tenantActionError"></div>
            <div class="detail-actions">
                <button onclick="saveTenantDetails(${id})" class="btn btn-primary btn-small">💾 Save Changes</button>
                ${actions}
            </div>
        `;
    } catch (err) {
        console.error('Failed to load tenant:', err);
    }
}

async function saveTenantDetails(id) {
    const data = {
        name: document.getElementById('edit-name').value,
        contact_name: document.getElementById('edit-contact').value,
        contact_email: document.getElementById('edit-email').value,
        contact_phone: document.getElementById('edit-phone').value,
        county: document.getElementById('edit-county').value,
    };
    try {
        const res = await fetch(`/api/master/tenants/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            credentials: 'include'
        });
        if (res.ok) {
            loadTenants();
            showTenantMessage('Tenant updated successfully', 'success');
        } else {
            const err = await res.json();
            showTenantMessage(err.detail || 'Failed to update', 'error');
        }
    } catch (err) {
        showTenantMessage('Connection error', 'error');
    }
}

async function resetTenantPassword(id) {
    const newPassword = prompt('Enter new password for this department:');
    if (!newPassword || newPassword.length < 6) {
        alert('Password must be at least 6 characters');
        return;
    }
    try {
        const res = await fetch(`/api/master/tenants/${id}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPassword }),
            credentials: 'include'
        });
        if (res.ok) {
            showTenantMessage('Password reset successfully', 'success');
        } else {
            const err = await res.json();
            showTenantMessage(err.detail || 'Failed to reset password', 'error');
        }
    } catch (err) {
        showTenantMessage('Connection error', 'error');
    }
}

async function approveTenant(id) {
    if (!confirm('Approve this tenant?')) return;
    try {
        const res = await fetch(`/api/master/tenants/${id}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
            credentials: 'include'
        });
        if (res.ok) {
            loadTenants();
            loadStats();
            document.getElementById('tenantDetail').style.display = 'none';
            selectedTenantId = null;
        } else {
            const data = await res.json();
            showTenantMessage(data.detail || 'Failed to approve', 'error');
        }
    } catch (err) {
        showTenantMessage('Connection error', 'error');
    }
}

async function rejectTenant(id) {
    if (!confirm('Reject this tenant request?')) return;
    try {
        const res = await fetch(`/api/master/tenants/${id}/reject`, {
            method: 'POST',
            credentials: 'include'
        });
        if (res.ok) {
            loadTenants();
            loadStats();
            document.getElementById('tenantDetail').style.display = 'none';
            selectedTenantId = null;
        } else {
            const data = await res.json();
            showTenantMessage(data.detail || 'Failed to reject', 'error');
        }
    } catch (err) {
        showTenantMessage('Connection error', 'error');
    }
}

async function suspendTenant(id) {
    const reason = prompt('Reason for suspension:');
    if (!reason) return;
    try {
        const res = await fetch(`/api/master/tenants/${id}/suspend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason }),
            credentials: 'include'
        });
        if (res.ok) {
            loadTenants();
            loadStats();
            selectTenant(id);
        } else {
            const data = await res.json();
            showTenantMessage(data.detail || 'Failed to suspend', 'error');
        }
    } catch (err) {
        showTenantMessage('Connection error', 'error');
    }
}

async function reactivateTenant(id) {
    try {
        const res = await fetch(`/api/master/tenants/${id}/reactivate`, {
            method: 'POST',
            credentials: 'include'
        });
        if (res.ok) {
            loadTenants();
            loadStats();
            selectTenant(id);
        } else {
            const data = await res.json();
            showTenantMessage(data.detail || 'Failed to reactivate', 'error');
        }
    } catch (err) {
        showTenantMessage('Connection error', 'error');
    }
}

function showTenantMessage(msg, type) {
    const el = document.getElementById('tenantActionError');
    el.innerHTML = `<div class="form-${type === 'success' ? 'success' : 'error'} active">${msg}</div>`;
    if (type === 'success') {
        setTimeout(() => el.innerHTML = '', 3000);
    }
}

// ===== CREATE TENANT =====
async function createTenant(event) {
    event.preventDefault();
    const errorEl = document.getElementById('createTenantError');
    const successEl = document.getElementById('createTenantSuccess');
    errorEl.classList.remove('active');
    successEl.classList.remove('active');
    
    const data = {
        name: document.getElementById('newTenantName').value,
        slug: document.getElementById('newTenantSlug').value.toLowerCase(),
        password: document.getElementById('newTenantPassword').value,
        cad_port: document.getElementById('newTenantPort').value || null,
        contact_name: document.getElementById('newTenantContact').value || null,
        contact_email: document.getElementById('newTenantEmail').value || null,
        county: document.getElementById('newTenantCounty').value || 'Chester',
        state: document.getElementById('newTenantState').value || 'PA',
    };
    
    try {
        const res = await fetch('/api/master/tenants', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            credentials: 'include'
        });
        if (res.ok) {
            const result = await res.json();
            successEl.textContent = `Tenant created: ${result.slug}.cadreport.com`;
            successEl.classList.add('active');
            document.getElementById('createTenantForm').reset();
            document.getElementById('newTenantCounty').value = 'Chester';
            document.getElementById('newTenantState').value = 'PA';
            loadStats();
            loadTenants();
        } else {
            const err = await res.json();
            errorEl.textContent = err.detail || 'Failed to create tenant';
            errorEl.classList.add('active');
        }
    } catch (err) {
        errorEl.textContent = 'Connection error';
        errorEl.classList.add('active');
    }
}

// ===== ADMINS =====
async function loadAdmins() {
    try {
        const res = await fetch('/api/master/admins', { credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            const list = document.getElementById('adminsList');
            if (!data.admins || data.admins.length === 0) {
                list.innerHTML = '<div class="empty-state">No admins found</div>';
                return;
            }
            list.innerHTML = data.admins.map(a => `
                <div class="admin-card">
                    <div class="admin-card-info">
                        <span class="admin-card-name">${a.name || 'Unnamed'}</span>
                        <span class="admin-card-email">${a.email}</span>
                    </div>
                    <div>
                        <span class="admin-card-role">${a.role}</span>
                        ${a.active ? '' : ' <span class="text-danger">(Disabled)</span>'}
                    </div>
                </div>
            `).join('');
        }
    } catch (err) {
        console.error('Failed to load admins:', err);
    }
}

async function createAdmin(event) {
    event.preventDefault();
    const errorEl = document.getElementById('createAdminError');
    const successEl = document.getElementById('createAdminSuccess');
    errorEl.classList.remove('active');
    successEl.classList.remove('active');
    
    const data = {
        name: document.getElementById('newAdminName').value,
        email: document.getElementById('newAdminEmail').value.toLowerCase(),
        password: document.getElementById('newAdminPassword').value,
        role: document.getElementById('newAdminRole').value,
    };
    
    try {
        const res = await fetch('/api/master/admins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            credentials: 'include'
        });
        if (res.ok) {
            successEl.textContent = 'Admin created successfully';
            successEl.classList.add('active');
            document.getElementById('createAdminForm').reset();
            loadAdmins();
        } else {
            const err = await res.json();
            errorEl.textContent = err.detail || 'Failed to create admin';
            errorEl.classList.add('active');
        }
    } catch (err) {
        errorEl.textContent = 'Connection error';
        errorEl.classList.add('active');
    }
}

// ===== AUDIT LOG =====
async function loadAuditLog() {
    try {
        const res = await fetch('/api/master/audit-log?limit=100', { credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            const body = document.getElementById('auditLogBody');
            if (!data.entries || data.entries.length === 0) {
                body.innerHTML = '<tr><td colspan="6" class="empty-state">No audit log entries</td></tr>';
                return;
            }
            body.innerHTML = data.entries.map(e => `
                <tr>
                    <td>${e.created_at ? new Date(e.created_at).toLocaleString() : '-'}</td>
                    <td>${e.admin_email || '-'}</td>
                    <td><span class="badge">${e.action}</span></td>
                    <td>${e.target_name || e.target_type || '-'}</td>
                    <td class="text-muted small">${e.details ? JSON.stringify(e.details) : '-'}</td>
                    <td class="small">${e.ip_address || '-'}</td>
                </tr>
            `).join('');
        }
    } catch (err) {
        console.error('Failed to load audit log:', err);
    }
}

// ===== USERS MANAGEMENT =====
function loadUsersTenantSelect() {
    const select = document.getElementById('usersTenantSelect');
    select.innerHTML = '<option value="">Choose a department...</option>';
    tenantsCache.forEach(t => {
        if (t.status === 'ACTIVE') {
            select.innerHTML += `<option value="${t.id}">${t.name} (${t.slug})</option>`;
        }
    });
}

async function loadTenantUsers() {
    const tenantId = document.getElementById('usersTenantSelect').value;
    const body = document.getElementById('usersBody');
    const countEl = document.getElementById('usersCount');
    
    if (!tenantId) {
        body.innerHTML = '<tr><td colspan="6" class="empty-state">Select a tenant to view users</td></tr>';
        countEl.textContent = '';
        return;
    }
    
    body.innerHTML = '<tr><td colspan="6" class="empty-state">Loading...</td></tr>';
    
    try {
        const res = await fetch(`/api/master/tenants/${tenantId}/users`, { credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            if (!data.users || data.users.length === 0) {
                body.innerHTML = '<tr><td colspan="6" class="empty-state">No users found</td></tr>';
                countEl.textContent = '0 users';
                return;
            }
            countEl.textContent = `${data.users.length} user${data.users.length !== 1 ? 's' : ''}`;
            body.innerHTML = data.users.map(u => `
                <tr>
                    <td>${u.name || '-'}</td>
                    <td>${u.email || '-'}</td>
                    <td><span class="badge">${u.role || 'USER'}</span></td>
                    <td><span class="status-badge ${u.active ? 'active' : 'inactive'}">${u.active ? 'Active' : 'Disabled'}</span></td>
                    <td>${u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}</td>
                    <td>
                        ${u.active 
                            ? `<button onclick="disableUser(${tenantId}, ${u.id})" class="btn btn-danger btn-small">Disable</button>` 
                            : `<button onclick="enableUser(${tenantId}, ${u.id})" class="btn btn-primary btn-small">Enable</button>`}
                    </td>
                </tr>
            `).join('');
        } else {
            body.innerHTML = '<tr><td colspan="6" class="empty-state text-danger">Failed to load users</td></tr>';
        }
    } catch (err) {
        console.error('Failed to load users:', err);
        body.innerHTML = '<tr><td colspan="6" class="empty-state text-danger">Connection error</td></tr>';
    }
}

async function disableUser(tenantId, userId) {
    if (!confirm('Disable this user?')) return;
    try {
        const res = await fetch(`/api/master/tenants/${tenantId}/users/${userId}/disable`, {
            method: 'POST',
            credentials: 'include'
        });
        if (res.ok) {
            loadTenantUsers();
        } else {
            const err = await res.json();
            alert('Failed: ' + (err.detail || 'Unknown error'));
        }
    } catch (err) {
        alert('Connection error');
    }
}

async function enableUser(tenantId, userId) {
    try {
        const res = await fetch(`/api/master/tenants/${tenantId}/users/${userId}/enable`, {
            method: 'POST',
            credentials: 'include'
        });
        if (res.ok) {
            loadTenantUsers();
        } else {
            const err = await res.json();
            alert('Failed: ' + (err.detail || 'Unknown error'));
        }
    } catch (err) {
        alert('Connection error');
    }
}

// ===== DATABASE MANAGEMENT =====
async function loadDatabaseTab() {
    loadDbStatus();
    loadBackups();
    loadRestoreTenantSelect();
}

async function loadDbStatus() {
    try {
        const res = await fetch('/api/master/databases', { credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            const body = document.getElementById('dbStatusBody');
            if (!data.databases || data.databases.length === 0) {
                body.innerHTML = '<tr><td colspan="6" class="empty-state">No tenant databases</td></tr>';
                return;
            }
            body.innerHTML = data.databases.map(db => `
                <tr>
                    <td>${db.tenant_name}</td>
                    <td><code>${db.database_name || 'Not set'}</code></td>
                    <td><span class="status-badge ${db.exists ? 'active' : 'inactive'}">${db.exists ? 'Exists' : 'Missing'}</span></td>
                    <td>${db.size || '-'}</td>
                    <td>${db.last_backup ? new Date(db.last_backup).toLocaleString() : 'Never'}</td>
                    <td>
                        ${!db.exists ? `<button onclick="provisionDb(${db.tenant_id})" class="btn btn-primary btn-small">Provision</button>` : ''}
                        ${db.exists ? `<button onclick="backupDb(${db.tenant_id})" class="btn btn-outline btn-small">Backup</button>` : ''}
                    </td>
                </tr>
            `).join('');
        }
    } catch (err) {
        console.error('Failed to load db status:', err);
    }
}

async function loadBackups() {
    try {
        const res = await fetch('/api/master/backups', { credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            const body = document.getElementById('backupsBody');
            if (!data.backups || data.backups.length === 0) {
                body.innerHTML = '<tr><td colspan="5" class="empty-state">No backups found</td></tr>';
                return;
            }
            body.innerHTML = data.backups.map(b => `
                <tr>
                    <td>${b.tenant_name}</td>
                    <td><code>${b.filename}</code></td>
                    <td>${b.size}</td>
                    <td>${new Date(b.created_at).toLocaleString()}</td>
                    <td>
                        <button onclick="downloadBackup('${b.filename}')" class="btn btn-outline btn-small">Download</button>
                        <button onclick="restoreBackup(${b.tenant_id}, '${b.filename}')" class="btn btn-warning btn-small">Restore</button>
                        <button onclick="deleteBackup('${b.filename}')" class="btn btn-danger btn-small">Delete</button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (err) {
        console.error('Failed to load backups:', err);
    }
}

function loadRestoreTenantSelect() {
    const select = document.getElementById('restoreTenant');
    select.innerHTML = '<option value="">Select tenant...</option>';
    tenantsCache.forEach(t => {
        if (t.status === 'ACTIVE') {
            select.innerHTML += `<option value="${t.id}">${t.name} (${t.slug})</option>`;
        }
    });
}

async function provisionDb(tenantId) {
    if (!confirm('Provision database for this tenant?')) return;
    try {
        const res = await fetch(`/api/master/tenants/${tenantId}/provision`, {
            method: 'POST',
            credentials: 'include'
        });
        if (res.ok) {
            alert('Database provisioned successfully');
            loadDbStatus();
        } else {
            const err = await res.json();
            alert('Failed: ' + (err.detail || 'Unknown error'));
        }
    } catch (err) {
        alert('Connection error');
    }
}

async function backupDb(tenantId) {
    try {
        const res = await fetch(`/api/master/tenants/${tenantId}/backup`, {
            method: 'POST',
            credentials: 'include'
        });
        if (res.ok) {
            const data = await res.json();
            alert(`Backup created: ${data.filename}`);
            loadBackups();
            loadDbStatus();
        } else {
            const err = await res.json();
            alert('Failed: ' + (err.detail || 'Unknown error'));
        }
    } catch (err) {
        alert('Connection error');
    }
}

function downloadBackup(filename) {
    window.open(`/api/master/backups/${filename}/download`, '_blank');
}

async function deleteBackup(filename) {
    if (!confirm(`Delete backup ${filename}?`)) return;
    try {
        const res = await fetch(`/api/master/backups/${filename}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        if (res.ok) {
            loadBackups();
            loadDbStatus();
        } else {
            const err = await res.json();
            alert('Failed: ' + (err.detail || 'Unknown error'));
        }
    } catch (err) {
        alert('Connection error');
    }
}

async function restoreBackup(tenantId, filename) {
    if (!confirm(`⚠️ WARNING: This will OVERWRITE all data!\n\nRestore ${filename}?`)) return;
    if (!confirm('Are you SURE? This cannot be undone!')) return;
    
    try {
        const res = await fetch(`/api/master/tenants/${tenantId}/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename }),
            credentials: 'include'
        });
        if (res.ok) {
            alert('Database restored successfully');
            loadDbStatus();
        } else {
            const err = await res.json();
            alert('Failed: ' + (err.detail || 'Unknown error'));
        }
    } catch (err) {
        alert('Connection error');
    }
}

async function restoreFromFile() {
    const tenantId = document.getElementById('restoreTenant').value;
    const fileInput = document.getElementById('restoreFile');
    const errorEl = document.getElementById('restoreError');
    const successEl = document.getElementById('restoreSuccess');
    
    errorEl.classList.remove('active');
    successEl.classList.remove('active');
    
    if (!tenantId) {
        errorEl.textContent = 'Please select a tenant';
        errorEl.classList.add('active');
        return;
    }
    if (!fileInput.files.length) {
        errorEl.textContent = 'Please select a backup file';
        errorEl.classList.add('active');
        return;
    }
    
    if (!confirm('⚠️ WARNING: This will OVERWRITE all data!')) return;
    if (!confirm('Are you SURE? This cannot be undone!')) return;
    
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    
    try {
        const res = await fetch(`/api/master/tenants/${tenantId}/restore-upload`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        if (res.ok) {
            successEl.textContent = 'Database restored successfully';
            successEl.classList.add('active');
            fileInput.value = '';
            loadDbStatus();
        } else {
            const err = await res.json();
            errorEl.textContent = err.detail || 'Restore failed';
            errorEl.classList.add('active');
        }
    } catch (err) {
        errorEl.textContent = 'Connection error';
        errorEl.classList.add('active');
    }
}

// ===== LOGOUT =====
async function adminLogout() {
    try {
        await fetch('/api/master/logout', { method: 'POST', credentials: 'include' });
    } catch (err) {}
    window.location.href = '/';
}
