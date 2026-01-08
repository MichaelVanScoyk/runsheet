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
    user_name: str = "User"
) -> bool:
    """
    Send password reset email
    
    Args:
        to_email: User's email address
        reset_token: Password reset token
        tenant_slug: Tenant subdomain (e.g., "glenmoorefc")
        tenant_name: Tenant display name (e.g., "Glen Moore Fire Company")
        user_name: User's name for personalization
    """
    reset_link = _build_tenant_url(tenant_slug, f"/reset-password?token={reset_token}")
    from_name = f"{tenant_name} via CADReport"
    subject = "Reset Your Password"
    
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ border-bottom: 3px solid #dc2626; padding-bottom: 15px; margin-bottom: 20px; }}
            .button {{ 
                display: inline-block; 
                padding: 12px 24px; 
                background-color: #dc2626; 
                color: white !important; 
                text-decoration: none; 
                border-radius: 6px;
                margin: 20px 0;
            }}
            .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }}
            .link-text {{ word-break: break-all; color: #666; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2 style="margin: 0; color: #dc2626;">{tenant_name}</h2>
            </div>
            <p>Hi {user_name},</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <p><a href="{reset_link}" class="button">Reset Password</a></p>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request a password reset, you can safely ignore this email.</p>
            <p class="link-text">Or copy this link: {reset_link}</p>
            <div class="footer">
                <p>CADReport - Fire Department Incident Management</p>
            </div>
        </div>
    </body>
    </html>
    """
    
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
    user_name: str = "User"
) -> bool:
    """
    Send account activation email for self-registering users.
    
    This is sent when a user finds their name and enters their email.
    Unlike admin invitations, completing this activation does NOT auto-approve.
    They can edit 1 run sheet until an admin approves them.
    
    Args:
        to_email: User's email address
        verification_token: Activation token (uses invite_token field)
        tenant_slug: Tenant subdomain
        tenant_name: Tenant display name
        user_name: User's name for personalization
    """
    # Uses same accept-invite page - it handles both flows
    activate_link = _build_tenant_url(tenant_slug, f"/accept-invite?token={verification_token}")
    from_name = f"{tenant_name} via CADReport"
    subject = f"Activate Your {tenant_name} Account"
    
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ border-bottom: 3px solid #dc2626; padding-bottom: 15px; margin-bottom: 20px; }}
            .button {{ 
                display: inline-block; 
                padding: 12px 24px; 
                background-color: #dc2626; 
                color: white !important; 
                text-decoration: none; 
                border-radius: 6px;
                margin: 20px 0;
            }}
            .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }}
            .link-text {{ word-break: break-all; color: #666; font-size: 12px; }}
            .note {{ background: #fef3c7; padding: 12px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #f59e0b; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2 style="margin: 0; color: #dc2626;">{tenant_name}</h2>
            </div>
            <p>Hi {user_name},</p>
            <p>Welcome to {tenant_name}! Click the button below to activate your account and set your password:</p>
            <p><a href="{activate_link}" class="button">Activate Account</a></p>
            <div class="note">
                <p style="margin: 0; font-size: 14px;"><strong>What happens next?</strong></p>
                <p style="margin: 8px 0 0 0; font-size: 13px;">After activation, you'll be able to complete one incident report. An officer or admin will then approve your account for full access.</p>
            </div>
            <p>This link will expire in 24 hours.</p>
            <p class="link-text">Or copy this link: {activate_link}</p>
            <div class="footer">
                <p>CADReport - Fire Department Incident Management</p>
            </div>
        </div>
    </body>
    </html>
    """
    
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


def send_welcome(
    to_email: str,
    tenant_slug: str,
    tenant_name: str,
    user_name: str,
    temp_password: Optional[str] = None
) -> bool:
    """
    Send welcome email for new users (after verification or admin-created accounts)
    
    Args:
        to_email: User's email address
        tenant_slug: Tenant subdomain
        tenant_name: Tenant display name
        user_name: User's name
        temp_password: Temporary password if account was created by admin
    """
    login_link = _build_tenant_url(tenant_slug, "/login")
    from_name = f"{tenant_name} via CADReport"
    subject = f"Welcome to {tenant_name}"
    
    password_section = ""
    password_text = ""
    if temp_password:
        password_section = f"""
            <p><strong>Your temporary password:</strong> <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px;">{temp_password}</code></p>
            <p style="color: #dc2626;"><strong>Please change your password after your first login.</strong></p>
        """
        password_text = f"\nYour temporary password: {temp_password}\nPlease change your password after your first login.\n"
    
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ border-bottom: 3px solid #dc2626; padding-bottom: 15px; margin-bottom: 20px; }}
            .button {{ 
                display: inline-block; 
                padding: 12px 24px; 
                background-color: #dc2626; 
                color: white !important; 
                text-decoration: none; 
                border-radius: 6px;
                margin: 20px 0;
            }}
            .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2 style="margin: 0; color: #dc2626;">{tenant_name}</h2>
            </div>
            <p>Hi {user_name},</p>
            <p>Your account has been created. You can now access the incident management system.</p>
            {password_section}
            <p><a href="{login_link}" class="button">Log In</a></p>
            <div class="footer">
                <p>CADReport - Fire Department Incident Management</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    text_body = f"""
{tenant_name}

Hi {user_name},

Your account has been created. You can now access the incident management system.
{password_text}
Log in at: {login_link}

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
    tenant_password: Optional[str] = None,
    primary_color: Optional[str] = None
) -> bool:
    """
    Send welcome email after invitation acceptance.
    Includes tenant password if provided so user can log in from other devices.
    
    Args:
        to_email: User's email address
        tenant_slug: Tenant subdomain
        tenant_name: Tenant display name
        user_name: User's first name for greeting
        user_display_name: Full display name
        tenant_password: Optional tenant/department password for future logins
        primary_color: Optional brand color (hex)
    """
    login_link = _build_tenant_url(tenant_slug, "/")
    from_name = f"{tenant_name} via CADReport"
    subject = f"Welcome to {tenant_name} - Account Created"
    
    # Use primary color or default green for success
    color = primary_color if primary_color and primary_color not in ['#ffffff', '#fff', '#f5f5f5', '#e5e5e5', 'white', '#808080', '#888888', 'gray', 'grey'] else '#16a34a'
    
    # Build tenant password section if provided
    password_section = ""
    password_text = ""
    if tenant_password:
        password_section = f"""
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0;"><strong>Department Access Code:</strong></p>
                <p style="margin: 0; font-family: monospace; font-size: 18px; letter-spacing: 1px;">{tenant_password}</p>
                <p style="margin: 10px 0 0 0; font-size: 12px; color: #666;">Save this code - you'll need it to log in from new devices or browsers.</p>
            </div>
        """
        password_text = f"\n\nDepartment Access Code: {tenant_password}\nSave this code - you'll need it to log in from new devices or browsers.\n"
    else:
        password_section = """
            <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
                <p style="margin: 0 0 8px 0; font-weight: bold; color: #92400e;">📱 Accessing from Other Devices</p>
                <p style="margin: 0; color: #78350f; font-size: 14px;">You're logged in on the browser/device where you accepted your invitation. To access from a different device or browser, you'll need the department access code from your administrator.</p>
            </div>
        """
        password_text = "\n\nAccessing from Other Devices:\nYou're logged in on the browser/device where you accepted your invitation. To access from a different device or browser, you'll need the department access code from your administrator.\n"
    
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ border-bottom: 3px solid {color}; padding-bottom: 15px; margin-bottom: 20px; }}
            .button {{ 
                display: inline-block; 
                padding: 12px 24px; 
                background-color: {color}; 
                color: white !important; 
                text-decoration: none; 
                border-radius: 6px;
                margin: 20px 0;
            }}
            .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }}
            .security-note {{ background: #f0fdf4; padding: 12px; border-radius: 6px; margin: 15px 0; border-left: 4px solid {color}; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2 style="margin: 0; color: {color};">✓ Welcome to {tenant_name}!</h2>
            </div>
            <p>Hi {user_name},</p>
            <p>Your account has been successfully created. You're now set up as <strong>{user_display_name}</strong> in the incident management system.</p>
            
            <h3 style="color: #333;">What's Next?</h3>
            <ul>
                <li>Access incident run sheets and reports</li>
                <li>Complete incident documentation</li>
                <li>View analytics and response data</li>
            </ul>
            
            {password_section}
            
            <div class="security-note">
                <p style="margin: 0; font-size: 14px;"><strong>🔐 Two Layers of Security</strong></p>
                <p style="margin: 8px 0 0 0; font-size: 13px;">The department access code lets you into the site. Your personal password protects your individual account and actions.</p>
            </div>
            
            <p><a href="{login_link}" class="button">Go to {tenant_name}</a></p>
            
            <div class="footer">
                <p>CADReport - Fire Department Incident Management</p>
            </div>
        </div>
    </body>
    </html>
    """
    
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
    primary_color: Optional[str] = None
) -> bool:
    """
    Send invitation email to a personnel member.
    
    When they click the link and set their password, they are automatically
    activated AND approved (no further admin action needed).
    
    Args:
        to_email: User's email address
        invite_token: Invitation token
        tenant_slug: Tenant subdomain
        tenant_name: Tenant display name
        user_name: User's name for personalization
        inviter_name: Name of admin who sent the invite
        primary_color: Optional brand color (hex, e.g., "#1e5631")
    """
    invite_link = _build_tenant_url(tenant_slug, f"/accept-invite?token={invite_token}")
    from_name = f"{tenant_name} via CADReport"
    subject = f"You've been invited to {tenant_name}"
    
    # Use primary color or default red
    color = primary_color if primary_color and primary_color not in ['#ffffff', '#fff', '#f5f5f5', '#e5e5e5', 'white', '#808080', '#888888', 'gray', 'grey'] else '#dc2626'
    
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ border-bottom: 3px solid {color}; padding-bottom: 15px; margin-bottom: 20px; }}
            .button {{ 
                display: inline-block; 
                padding: 12px 24px; 
                background-color: {color}; 
                color: white !important; 
                text-decoration: none; 
                border-radius: 6px;
                margin: 20px 0;
            }}
            .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }}
            .link-text {{ word-break: break-all; color: #666; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2 style="margin: 0; color: {color};">{tenant_name}</h2>
            </div>
            <p>Hi {user_name},</p>
            <p>{inviter_name} has invited you to join <strong>{tenant_name}</strong> on CADReport, our incident management system.</p>
            <p>Click the button below to create your account:</p>
            <p><a href="{invite_link}" class="button">Accept Invitation</a></p>
            <p>This link will expire in 24 hours.</p>
            <p class="link-text">Or copy this link: {invite_link}</p>
            <div class="footer">
                <p>CADReport - Fire Department Incident Management</p>
            </div>
        </div>
    </body>
    </html>
    """
    
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
    action_url: Optional[str] = None,
    action_text: str = "View Details"
) -> int:
    """
    Send notification email to admin users.
    
    Args:
        to_emails: List of admin email addresses
        tenant_slug: Tenant subdomain
        tenant_name: Tenant display name
        notification_type: Type of notification (for future filtering)
        subject_line: Email subject
        message_body: Main message content (can include HTML)
        action_url: Optional URL for action button
        action_text: Text for action button
        
    Returns:
        Number of emails successfully sent
    """
    from_name = f"{tenant_name} via CADReport"
    
    action_button = ""
    action_link = ""
    if action_url:
        full_url = _build_tenant_url(tenant_slug, action_url) if not action_url.startswith('http') else action_url
        action_button = f'<p><a href="{full_url}" class="button">{action_text}</a></p>'
        action_link = f"\n{action_text}: {full_url}\n"
    
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ border-bottom: 3px solid #dc2626; padding-bottom: 15px; margin-bottom: 20px; }}
            .notification-badge {{ 
                display: inline-block;
                padding: 4px 8px;
                background-color: #fef3c7;
                color: #92400e;
                border-radius: 4px;
                font-size: 12px;
                margin-bottom: 10px;
            }}
            .button {{ 
                display: inline-block; 
                padding: 12px 24px; 
                background-color: #dc2626; 
                color: white !important; 
                text-decoration: none; 
                border-radius: 6px;
                margin: 20px 0;
            }}
            .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2 style="margin: 0; color: #dc2626;">{tenant_name}</h2>
            </div>
            <span class="notification-badge">Admin Notification</span>
            <div style="margin-top: 15px;">
                {message_body}
            </div>
            {action_button}
            <div class="footer">
                <p>You're receiving this because you have admin notifications enabled.</p>
                <p>CADReport - Fire Department Incident Management</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    # Strip HTML for text version
    import re
    text_message = re.sub('<[^<]+?>', '', message_body)
    
    text_body = f"""
{tenant_name} - Admin Notification

{text_message}
{action_link}
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
    user_name: str
) -> bool:
    """
    Send verification email when a user requests to change their email address.
    
    The link goes to the NEW email address to verify they own it.
    
    Args:
        to_email: The NEW email address to verify
        verification_token: Verification token
        tenant_slug: Tenant subdomain
        tenant_name: Tenant display name
        user_name: User's name for personalization
    """
    verify_link = _build_tenant_url(tenant_slug, f"/verify-email-change?token={verification_token}")
    from_name = f"{tenant_name} via CADReport"
    subject = "Verify Your New Email Address"
    
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ border-bottom: 3px solid #dc2626; padding-bottom: 15px; margin-bottom: 20px; }}
            .button {{ 
                display: inline-block; 
                padding: 12px 24px; 
                background-color: #dc2626; 
                color: white !important; 
                text-decoration: none; 
                border-radius: 6px;
                margin: 20px 0;
            }}
            .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }}
            .link-text {{ word-break: break-all; color: #666; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2 style="margin: 0; color: #dc2626;">{tenant_name}</h2>
            </div>
            <p>Hi {user_name},</p>
            <p>You requested to change your email address to this address. Click the button below to confirm:</p>
            <p><a href="{verify_link}" class="button">Verify New Email</a></p>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't request this change, you can safely ignore this email.</p>
            <p class="link-text">Or copy this link: {verify_link}</p>
            <div class="footer">
                <p>CADReport - Fire Department Incident Management</p>
            </div>
        </div>
    </body>
    </html>
    """
    
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


def send_onboarding_email(
    to_email: str,
    to_name: str,
    subject: str,
    message: str,
    attachments: list = None
) -> bool:
    """
    Send onboarding email with optional document attachments.
    
    Args:
        to_email: Recipient email address
        to_name: Recipient name
        subject: Email subject
        message: Message body (plain text, will be converted to HTML)
        attachments: List of file paths to attach
    """
    from email.mime.base import MIMEBase
    from email import encoders
    
    if not SMTP_PASSWORD:
        logger.error("SMTP_PASSWORD not configured - cannot send email")
        return False
    
    from_name = "CADReport"
    
    # Convert message to HTML (preserve line breaks)
    html_message = message.replace('\n', '<br>')
    
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ border-bottom: 3px solid #1e3a5f; padding-bottom: 15px; margin-bottom: 20px; }}
            .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }}
            .attachments {{ background: #f3f4f6; padding: 15px; border-radius: 8px; margin-top: 20px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2 style="margin: 0; color: #1e3a5f;">CADReport</h2>
            </div>
            <p>Hi {to_name},</p>
            <div style="margin: 20px 0;">
                {html_message}
            </div>
            {f'<div class="attachments"><strong>📎 Attachments:</strong> {len(attachments)} document(s) attached</div>' if attachments else ''}
            <div class="footer">
                <p>CADReport - Fire Department Incident Management</p>
                <p><a href="https://cadreport.com">cadreport.com</a></p>
            </div>
        </div>
    </body>
    </html>
    """
    
    text_body = f"""Hi {to_name},

{message}

{'Attachments: ' + str(len(attachments)) + ' document(s) attached' if attachments else ''}

--
CADReport - Fire Department Incident Management
https://cadreport.com
    """
    
    try:
        # Create message with mixed type to support attachments
        msg = MIMEMultipart('mixed')
        msg['Subject'] = subject
        msg['From'] = f"{from_name} <{FROM_EMAIL}>"
        msg['To'] = to_email
        
        # Create alternative part for text/html
        alt_part = MIMEMultipart('alternative')
        alt_part.attach(MIMEText(text_body, 'plain'))
        alt_part.attach(MIMEText(html_body, 'html'))
        msg.attach(alt_part)
        
        # Add attachments
        if attachments:
            for filepath in attachments:
                try:
                    filename = os.path.basename(filepath)
                    with open(filepath, 'rb') as f:
                        part = MIMEBase('application', 'octet-stream')
                        part.set_payload(f.read())
                    encoders.encode_base64(part)
                    part.add_header('Content-Disposition', f'attachment; filename="{filename}"')
                    msg.attach(part)
                except Exception as e:
                    logger.error(f"Failed to attach {filepath}: {e}")
        
        # Send
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.sendmail(FROM_EMAIL, to_email, msg.as_string())
        
        logger.info(f"Onboarding email sent to {to_email}: {subject}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send onboarding email: {e}")
        return False


def send_lead_notification(
    department_name: str,
    requested_slug: str,
    contact_name: str,
    contact_email: str,
    contact_phone: Optional[str] = None,
    county: Optional[str] = None,
    state: str = "PA"
) -> bool:
    """
    Send notification email to admin when a new signup request is submitted.
    """
    admin_email = "admin@cadreport.com"
    from_name = "CADReport System"
    subject = f"New Signup Request: {department_name}"
    
    phone_line = f"<tr><td style='padding: 8px; border-bottom: 1px solid #e2e8f0;'><strong>Phone:</strong></td><td style='padding: 8px; border-bottom: 1px solid #e2e8f0;'>{contact_phone}</td></tr>" if contact_phone else ""
    phone_text = f"Phone: {contact_phone}\n" if contact_phone else ""
    
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ border-bottom: 3px solid #1e3a5f; padding-bottom: 15px; margin-bottom: 20px; }}
            .badge {{ display: inline-block; padding: 6px 12px; background-color: #fef3c7; color: #92400e; border-radius: 4px; font-size: 14px; font-weight: bold; margin-bottom: 15px; }}
            table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
            .button {{ display: inline-block; padding: 12px 24px; background-color: #1e3a5f; color: white !important; text-decoration: none; border-radius: 6px; margin: 20px 0; }}
            .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2 style="margin: 0; color: #1e3a5f;">New Signup Request</h2>
            </div>
            <span class="badge">🔔 Action Required</span>
            <p>A new department has requested access to CADReport:</p>
            <table>
                <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>Department:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">{department_name}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>Requested URL:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">{requested_slug}.cadreport.com</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>Contact:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">{contact_name}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>Email:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><a href="mailto:{contact_email}">{contact_email}</a></td></tr>
                {phone_line}
                <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>Location:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">{county or 'N/A'} County, {state}</td></tr>
            </table>
            <p><a href="https://cadreport.com/admin.html" class="button">Review in Admin Dashboard</a></p>
            <div class="footer"><p>CADReport System Notification</p></div>
        </div>
    </body>
    </html>
    """
    
    text_body = f"""
New Signup Request

A new department has requested access to CADReport:

Department: {department_name}
Requested URL: {requested_slug}.cadreport.com
Contact: {contact_name}
Email: {contact_email}
{phone_text}Location: {county or 'N/A'} County, {state}

Review in Admin Dashboard: https://cadreport.com/admin.html

--
CADReport System Notification
    """
    
    return _send_email(admin_email, subject, html_body, text_body, from_name)


def send_test_email(to_email: str, tenant_slug: str = "test", tenant_name: str = "Test Tenant") -> bool:
    """Send a test email to verify configuration"""
    from_name = f"{tenant_name} via CADReport"
    subject = "CADReport Email Test"
    
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .success {{ color: #16a34a; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h2 class="success">✓ Email Configuration Working</h2>
            <p>This is a test email from CADReport.</p>
            <p>If you received this, the email system is configured correctly.</p>
            <p><strong>Tenant:</strong> {tenant_name} ({tenant_slug})</p>
            <p><strong>From:</strong> {FROM_EMAIL}</p>
        </div>
    </body>
    </html>
    """
    
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
        print("Usage: python email_service.py <to_email> [test|reset|verify|welcome]")
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
    
    print(f"Sending {action} email to {to}...")
    
    if action == "test":
        success = send_test_email(to, tenant_slug, tenant_name)
    elif action == "reset":
        success = send_password_reset(to, "test-token-12345", tenant_slug, tenant_name, "Test User")
    elif action == "verify":
        success = send_account_verification(to, "verify-token-12345", tenant_slug, tenant_name, "Test User")
    elif action == "welcome":
        success = send_welcome(to, tenant_slug, tenant_name, "Test User", "TempPass123!")
    else:
        print(f"Unknown action: {action}")
        sys.exit(1)
    
    if success:
        print("✓ Email sent successfully!")
    else:
        print("✗ Failed to send email. Check logs and environment variables.")
        sys.exit(1)
