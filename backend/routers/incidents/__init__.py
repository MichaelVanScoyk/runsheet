"""
Incidents module - modular components for incident management.

New incident-related code goes here as separate modules.
Legacy code remains in routers/incidents.py until refactored.

Modules:
    av_alerts: Audio/Visual alert broadcasting for browser notifications
"""

from .av_alerts import emit_av_alert

__all__ = ['emit_av_alert']
