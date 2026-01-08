"""
Email Service for CADReport
Sends transactional emails via Microsoft 365 SMTP
Multi-tenant aware - sends from noreply@cadreport.com with tenant display name
"""

import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Email configuration - load from environment variables
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.office365.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "admin@cadreport.com")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@cadreport.com")
BASE_DOMAIN = os.getenv("BASE_DOMAIN", "cadreport.com")


def _build_tenant_url(tenant_slug: str, path: str) -> str:
    """Build a URL for a specific tenant subdomain"""
    return f"https://{tenant_slug}.{BASE_DOMAIN}{path}"


def _get_base_template(
    tenant_name: str,
    primary_color: str,
    logo_url: Optional[str],
    content: str
) -> str:
    """
    Build the base HTML email template with light background and tenant branding.
    
    Args:
        tenant_name: Display name of the tenant
        primary_color: Hex color for accents (e.g., "#1e5631")
        logo_url: Full URL to tenant's shield logo, or None
        content: The main email content HTML
    """
    # Build logo section
    logo_html = ""
    if logo_url:
        logo_html = f'<img src="{logo_url}" alt="{tenant_name}" style="max-height: 80px; max-width: 200px; margin-bottom: 15px;">'
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{ 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
                line-height: 1.6; 
                color: #1f2937;
                background-color: #f3f4f6;
                margin: 0;
                padding: 0;
            }}
            .wrapper {{
                background-color: #f3f4f6;
                padding: 40px 20px;
            }}
            .container {{ 
                max-width: 600px; 
                margin: 0 auto; 
                background-color: #ffffff;
                border-radius: 8px;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                overflow: hidden;
            }}
            .header {{ 
                background-color: #ffffff;
                border-bottom: 4px solid {primary_color}; 
                padding: 25px 30px;
                text-align: center;
            }}
            .header h2 {{
                margin: 0;
                color: {primary_color};
                font-size: 24px;
            }}
            .content {{
                padding: 30px;
            }}
            .button {{ 
                display: inline-block; 
                padding: 14px 28px; 
                background-color: {primary_color}; 
                color: #ffffff !important; 
                text-decoration: none; 
                border-radius: 6px;
                font-weight: 600;
                margin: 20px 0;
            }}
            .footer {{ 
                background-color: #f9fafb;
                padding: 20px 30px;
                text-align: center;
                font-size: 12px; 
                color: #6b7280;
                border-top: 1px solid #e5e7eb;
            }}
            .link-text {{ 
                word-break: break-all; 
                color: #6b7280; 
                font-size: 12px; 
            }}
            .note {{ 
                background: #fef3c7; 
                padding: 15px; 
                border-radius: 6px; 
                margin: 20px 0; 
                border-left: 4px solid #f59e0b;
                color: #92400e;
            }}
            .info-box {{
                background: #f0fdf4;
                padding: 15px;
                border-radius: 6px;
                margin: 20px 0;
                border-left: 4px solid {primary_color};
            }}
            .gray-box {{
                background: #f3f4f6;
                padding: 15px;
                border-radius: 8px;
                margin: 20px 0;
            }}
        </style>
    </head>
    <body>
        <div class="wrapper">
            <div class="container">
                <div class="header">
                    {logo_html}
                    <h2>{tenant_name}</h2>
                </div>
                <div class="content">
                    {content}
                </div>
                <div class="footer">
                    <p style="margin: 0;">CADReport - Fire Department Incident Management</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """


def _send_email(
    to_email: str,
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
    from_name: str = "CADReport"
) -> bool:
    """
    Send an email via SMTP
    
    Args:
        to_email: Recipient email address
        subject: Email subject
        html_body: HTML content of the email
        text_body: Plain text fallback (optional)
        from_name: Display name for the sender
        
    Returns:
        True if sent successfully, False otherwise
    """
    if not SMTP_PASSWORD:
        logger.error("SMTP_PASSWORD not configured - cannot send email")
        return False
    
    try:
        # Create message
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{from_name} <{FROM_EMAIL}>"
        msg["To"] = to_email
        
        # Add plain text version if provided
        if text_body:
            msg.attach(MIMEText(text_body, "plain"))
        
        # Add HTML version
        msg.attach(MIMEText(html_body, "html"))
        
        # Connect and send
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.sendmail(FROM_EMAIL, to_email, msg.as_string())
        
        logger.info(f"Email sent successfully to {to_email}: {subject}")
        return True
        
    except smtplib.SMTPAuthenticationError as e:
        logger.error(f"SMTP authentication failed: {e}")
        return False
    except smtplib.SMTPException as e:
        logger.error(f"SMTP error sending email: {e}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error sending email: {e}")
        return False


def send_password_reset(
    to_email: str,
    reset_token: str,
    tenant_slug: str,
    tenant_name: str,
    user_name: str = "User",
    primary_color: str = "#1e5631",
    logo_url: Optional[str] = None
) -> bool:
    """Send password reset email"""
    reset_link = _build_tenant_url(tenant_slug, f"/reset-password?token={reset_token}")
    from_name = f"{tenant_name} via CADReport"
    subject = "Reset Your Password"
    
    content = f"""
        <p>Hi {user_name},</p>
        <p>We received a request to reset your password. Click the button below to create a new password:</p>
        <p style="text-align: center;"><a href="{reset_link}" class="button">Reset Password</a></p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request a password reset, you can safely ignore this email.</p>
        <p class="link-text">Or copy this link: {reset_link}</p>
    """
    
    html_body = _get_base_template(tenant_name, primary_color, logo_url, content)
    
    text_body = f"""
{tenant_name}

Hi {user_name},

We received a request to reset your password.
Click the link below to create a new password:

{reset_link}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email.

--
CADReport - Fire Department Incident Management
    """
    
    return _send_email(to_email, subject, html_body, text_body, from_name)


def send_account_verification(
    to_email: str,
    verification_token: str,
    tenant_slug: str,
    tenant_name: str,
    user_name: str = "User",
    primary_color: str = "#1e5631",
    logo_url: Optional[str] = None
) -> bool:
    """Send account activation email for self-registering users."""
    activate_link = _build_tenant_url(tenant_slug, f"/accept-invite?token={verification_token}")
    from_name = f"{tenant_name} via CADReport"
    subject = f"Activate Your {tenant_name} Account"
    
    content = f"""
        <p>Hi {user_name},</p>
        <p>Welcome to {tenant_name}! Click the button below to activate your account and set your password:</p>
        <p style="text-align: center;"><a href="{activate_link}" class="button">Activate Account</a></p>
        <div class="note">
            <p style="margin: 0; font-size: 14px;"><strong>What happens next?</strong></p>
            <p style="margin: 8px 0 0 0; font-size: 13px;">After activation, you'll be able to complete one incident report. An officer or admin will then approve your account for full access.</p>
        </div>
        <p>This link will expire in 24 hours.</p>
        <p class="link-text">Or copy this link: {activate_link}</p>
    """
    
    html_body = _get_base_template(tenant_name, primary_color, logo_url, content)
    
    text_body = f"""
{tenant_name}

Hi {user_name},

Welcome to {tenant_name}! Click the link below to activate your account and set your password:

{activate_link}

What happens next?
After activation, you'll be able to complete one incident report. An officer or admin will then approve your account for full access.

This link will expire in 24 hours.

--
CADReport - Fire Department Incident Management
    """
    
    return _send_email(to_email, subject, html_body, text_body, from_name)


def send_welcome_with_tenant_password(
    to_email: str,
    tenant_slug: str,
    tenant_name: str,
    user_name: str,
    user_display_name: str,
    primary_color: str = "#1e5631",
    logo_url: Optional[str] = None,
    tenant_password: Optional[str] = None
) -> bool:
    """Send welcome email after invitation acceptance."""
    login_link = _build_tenant_url(tenant_slug, "/")
    from_name = f"{tenant_name} via CADReport"
    subject = f"Welcome to {tenant_name} - Account Created"
    
    # Build tenant password section if provided
    password_section = ""
    password_text = ""
    if tenant_password:
        password_section = f"""
            <div class="gray-box">
                <p style="margin: 0 0 10px 0;"><strong>Department Access Code:</strong></p>
                <p style="margin: 0; font-family: monospace; font-size: 18px; letter-spacing: 1px;">{tenant_password}</p>
                <p style="margin: 10px 0 0 0; font-size: 12px; color: #6b7280;">Save this code - you'll need it to log in from new devices or browsers.</p>
            </div>
        """
        password_text = f"\n\nDepartment Access Code: {tenant_password}\nSave this code - you'll need it to log in from new devices or browsers.\n"
    else:
        password_section = """
            <div class="note">
                <p style="margin: 0 0 8px 0; font-weight: bold;">📱 Accessing from Other Devices</p>
                <p style="margin: 0; font-size: 14px;">You're logged in on the browser/device where you accepted your invitation. To access from a different device or browser, you'll need the department access code from your administrator.</p>
            </div>
        """
        password_text = "\n\nAccessing from Other Devices:\nYou're logged in on the browser/device where you accepted your invitation. To access from a different device or browser, you'll need the department access code from your administrator.\n"
    
    content = f"""
        <p>Hi {user_name},</p>
        <p>Your account has been successfully created. You're now set up as <strong>{user_display_name}</strong> in the incident management system.</p>
        
        <h3 style="color: #1f2937; margin-top: 25px;">What's Next?</h3>
        <ul style="color: #4b5563;">
            <li>Access incident run sheets and reports</li>
            <li>Complete incident documentation</li>
            <li>View analytics and response data</li>
        </ul>
        
        {password_section}
        
        <div class="info-box">
            <p style="margin: 0; font-size: 14px;"><strong>🔐 Two Layers of Security</strong></p>
            <p style="margin: 8px 0 0 0; font-size: 13px; color: #374151;">The department access code lets you into the site. Your personal password protects your individual account and actions.</p>
        </div>
        
        <p style="text-align: center;"><a href="{login_link}" class="button">Go to {tenant_name}</a></p>
    """
    
    html_body = _get_base_template(tenant_name, primary_color, logo_url, content)
    
    text_body = f"""
Welcome to {tenant_name}!

Hi {user_name},

Your account has been successfully created. You're now set up as {user_display_name} in the incident management system.

What's Next?
- Access incident run sheets and reports
- Complete incident documentation  
- View analytics and response data
{password_text}
Two Layers of Security:
The department access code lets you into the site. Your personal password protects your individual account and actions.

Go to {tenant_name}: {login_link}

--
CADReport - Fire Department Incident Management
    """
    
    return _send_email(to_email, subject, html_body, text_body, from_name)


def send_invitation(
    to_email: str,
    invite_token: str,
    tenant_slug: str,
    tenant_name: str,
    user_name: str,
    inviter_name: str = "An administrator",
    primary_color: str = "#1e5631",
    logo_url: Optional[str] = None
) -> bool:
    """Send invitation email to a personnel member."""
    invite_link = _build_tenant_url(tenant_slug, f"/accept-invite?token={invite_token}")
    from_name = f"{tenant_name} via CADReport"
    subject = f"You've been invited to {tenant_name}"
    
    content = f"""
        <p>Hi {user_name},</p>
        <p>{inviter_name} has invited you to join <strong>{tenant_name}</strong> on CADReport, our incident management system.</p>
        <p>Click the button below to create your account:</p>
        <p style="text-align: center;"><a href="{invite_link}" class="button">Accept Invitation</a></p>
        <p>This link will expire in 24 hours.</p>
        <p class="link-text">Or copy this link: {invite_link}</p>
    """
    
    html_body = _get_base_template(tenant_name, primary_color, logo_url, content)
    
    text_body = f"""
{tenant_name}

Hi {user_name},

{inviter_name} has invited you to join {tenant_name} on CADReport, our incident management system.

Click the link below to create your account:

{invite_link}

This link will expire in 24 hours.

--
CADReport - Fire Department Incident Management
    """
    
    return _send_email(to_email, subject, html_body, text_body, from_name)


def send_admin_notification(
    to_emails: list,
    tenant_slug: str,
    tenant_name: str,
    notification_type: str,
    subject_line: str,
    message_body: str,
    primary_color: str = "#1e5631",
    logo_url: Optional[str] = None
) -> int:
    """
    Send notification email to admin users.
    No action links - just informational.
    """
    from_name = f"{tenant_name} via CADReport"
    
    content = f"""
        <p style="display: inline-block; padding: 4px 12px; background-color: #fef3c7; color: #92400e; border-radius: 4px; font-size: 12px; font-weight: 600; margin-bottom: 15px;">Admin Notification</p>
        <div style="margin-top: 15px;">
            {message_body}
        </div>
        <p style="margin-top: 25px; font-size: 13px; color: #6b7280;">You're receiving this because you have admin notifications enabled.</p>
    """
    
    html_body = _get_base_template(tenant_name, primary_color, logo_url, content)
    
    # Strip HTML for text version
    import re
    text_message = re.sub('<[^<]+?>', '', message_body)
    
    text_body = f"""
{tenant_name} - Admin Notification

{text_message}

--
You're receiving this because you have admin notifications enabled.
CADReport - Fire Department Incident Management
    """
    
    success_count = 0
    for email in to_emails:
        if _send_email(email, subject_line, html_body, text_body, from_name):
            success_count += 1
    
    return success_count


def send_email_change_verification(
    to_email: str,
    verification_token: str,
    tenant_slug: str,
    tenant_name: str,
    user_name: str,
    primary_color: str = "#1e5631",
    logo_url: Optional[str] = None
) -> bool:
    """Send verification email when a user requests to change their email address."""
    verify_link = _build_tenant_url(tenant_slug, f"/verify-email-change?token={verification_token}")
    from_name = f"{tenant_name} via CADReport"
    subject = "Verify Your New Email Address"
    
    content = f"""
        <p>Hi {user_name},</p>
        <p>You requested to change your email address to this address. Click the button below to confirm:</p>
        <p style="text-align: center;"><a href="{verify_link}" class="button">Verify New Email</a></p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't request this change, you can safely ignore this email.</p>
        <p class="link-text">Or copy this link: {verify_link}</p>
    """
    
    html_body = _get_base_template(tenant_name, primary_color, logo_url, content)
    
    text_body = f"""
{tenant_name}

Hi {user_name},

You requested to change your email address to this address.
Click the link below to confirm:

{verify_link}

This link will expire in 24 hours.

If you didn't request this change, you can safely ignore this email.

--
CADReport - Fire Department Incident Management
    """
    
    return _send_email(to_email, subject, html_body, text_body, from_name)


def send_test_email(
    to_email: str, 
    tenant_slug: str = "test", 
    tenant_name: str = "Test Tenant",
    primary_color: str = "#1e5631",
    logo_url: Optional[str] = None
) -> bool:
    """Send a test email to verify configuration"""
    from_name = f"{tenant_name} via CADReport"
    subject = "CADReport Email Test"
    
    content = f"""
        <p style="color: #16a34a; font-size: 20px; font-weight: bold;">✓ Email Configuration Working</p>
        <p>This is a test email from CADReport.</p>
        <p>If you received this, the email system is configured correctly.</p>
        <div class="gray-box">
            <p style="margin: 0;"><strong>Tenant:</strong> {tenant_name} ({tenant_slug})</p>
            <p style="margin: 5px 0 0 0;"><strong>From:</strong> {FROM_EMAIL}</p>
            <p style="margin: 5px 0 0 0;"><strong>Primary Color:</strong> {primary_color}</p>
            <p style="margin: 5px 0 0 0;"><strong>Logo URL:</strong> {logo_url or 'None'}</p>
        </div>
    """
    
    html_body = _get_base_template(tenant_name, primary_color, logo_url, content)
    
    text_body = f"""
Email Configuration Working

This is a test email from CADReport.
If you received this, the email system is configured correctly.

Tenant: {tenant_name} ({tenant_slug})
From: {FROM_EMAIL}
    """
    
    return _send_email(to_email, subject, html_body, text_body, from_name)


# CLI for testing
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python email_service.py <to_email> [test|reset|verify|welcome|invite]")
        print("\nEnvironment variables needed:")
        print("  SMTP_PASSWORD - Your Microsoft 365 password")
        print("  SMTP_USERNAME - Your login email (default: admin@cadreport.com)")
        print("  FROM_EMAIL - Send-from address (default: noreply@cadreport.com)")
        sys.exit(1)
    
    to = sys.argv[1]
    action = sys.argv[2] if len(sys.argv) > 2 else "test"
    
    # Test tenant info
    tenant_slug = "glenmoorefc"
    tenant_name = "Glen Moore Fire Company"
    primary_color = "#1e5631"
    logo_url = "https://glenmoorefc.cadreport.com/api/branding/logo"
    
    print(f"Sending {action} email to {to}...")
    
    if action == "test":
        success = send_test_email(to, tenant_slug, tenant_name, primary_color, logo_url)
    elif action == "reset":
        success = send_password_reset(to, "test-token-12345", tenant_slug, tenant_name, "Test User", primary_color, logo_url)
    elif action == "verify":
        success = send_account_verification(to, "verify-token-12345", tenant_slug, tenant_name, "Test User", primary_color, logo_url)
    elif action == "welcome":
        success = send_welcome_with_tenant_password(to, tenant_slug, tenant_name, "Test", "Test User", primary_color, logo_url)
    elif action == "invite":
        success = send_invitation(to, "invite-token-12345", tenant_slug, tenant_name, "Test User", "Admin Name", primary_color, logo_url)
    else:
        print(f"Unknown action: {action}")
        sys.exit(1)
    
    if success:
        print("✓ Email sent successfully!")
    else:
        print("✗ Failed to send email. Check logs and environment variables.")
        sys.exit(1)
