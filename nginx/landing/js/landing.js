// CADReport Landing Page JavaScript

function openLoginModal() {
    document.getElementById('loginModal').classList.add('active');
    document.getElementById('slug').focus();
}

function closeLoginModal(event) {
    if (event.target === document.getElementById('loginModal')) {
        document.getElementById('loginModal').classList.remove('active');
    }
}

async function handleLogin(event) {
    event.preventDefault();
    
    const slugOrEmail = document.getElementById('slug').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');
    
    errorEl.classList.remove('active');
    btn.textContent = 'Logging in...';
    btn.disabled = true;

    const isEmail = slugOrEmail.includes('@');

    try {
        if (isEmail) {
            // Master admin login
            const response = await fetch('/api/master/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: slugOrEmail.toLowerCase(), password }),
                credentials: 'include'
            });

            if (response.ok) {
                // Redirect to admin dashboard
                window.location.href = '/admin.html';
            } else {
                const data = await response.json();
                errorEl.textContent = data.detail || 'Login failed';
                errorEl.classList.add('active');
            }
        } else {
            // Tenant login
            const slug = slugOrEmail.toLowerCase();
            const response = await fetch('/api/tenant/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug, password }),
                credentials: 'include'
            });

            if (response.ok) {
                window.location.href = 'https://' + slug + '.cadreport.com';
            } else {
                const data = await response.json();
                errorEl.textContent = data.detail || 'Login failed';
                errorEl.classList.add('active');
            }
        }
    } catch (err) {
        errorEl.textContent = 'Connection error. Please try again.';
        errorEl.classList.add('active');
    } finally {
        btn.textContent = 'Log In';
        btn.disabled = false;
    }
}

async function handleSignup(event) {
    event.preventDefault();
    
    const errorEl = document.getElementById('signupError');
    const successEl = document.getElementById('signupSuccess');
    const btn = document.getElementById('signupBtn');
    
    errorEl.classList.remove('active');
    successEl.classList.remove('active');
    btn.textContent = 'Submitting...';
    btn.disabled = true;

    const data = {
        requested_slug: document.getElementById('deptSlug').value.toLowerCase().trim(),
        department_name: document.getElementById('deptName').value.trim(),
        contact_name: document.getElementById('contactName').value.trim(),
        contact_email: document.getElementById('contactEmail').value.trim(),
        contact_phone: document.getElementById('contactPhone').value.trim() || null,
        county: document.getElementById('county').value.trim() || null,
        state: 'PA'
    };

    try {
        const response = await fetch('/api/tenant/signup-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            successEl.textContent = 'Request submitted! We\'ll be in touch soon.';
            successEl.classList.add('active');
            document.getElementById('signupForm').reset();
        } else {
            errorEl.textContent = result.detail || 'Submission failed';
            errorEl.classList.add('active');
        }
    } catch (err) {
        errorEl.textContent = 'Connection error. Please try again.';
        errorEl.classList.add('active');
    } finally {
        btn.textContent = 'Submit Request';
        btn.disabled = false;
    }
}

// Close modal with Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        document.getElementById('loginModal').classList.remove('active');
    }
});
