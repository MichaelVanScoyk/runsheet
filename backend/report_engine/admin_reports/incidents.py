"""
Incidents Reports

- IncidentsListReport: Incident type/subtype breakdown with frequencies
- IncidentTypeDetailReport: Individual type detail (future)
"""

from datetime import date
from typing import Optional
from sqlalchemy import text

from .base import AdminReport
from .components import (
    stat_grid, data_table, section, two_column, grouped_list,
    format_hours, esc
)


class IncidentsListReport(AdminReport):
    """
    Incidents Type Breakdown Report - List View
    
    Shows incident types grouped by cad_event_type with cad_event_subtype breakdown.
    No category filter - shows all incident types (they self-identify as Fire/EMS).
    """
    
    def get_title(self) -> str:
        return "Incident Type Report"
    
    def get_subtitle(self, data: dict, **params) -> str:
        start_date = params.get('start_date')
        end_date = params.get('end_date')
        return self.format_date_range(start_date, end_date)
    
    def get_data(
        self,
        start_date: date,
        end_date: date
    ) -> dict:
        """
        Fetch incident type breakdown data.
        
        Args:
            start_date: Report start date
            end_date: Report end date
        
        Returns:
            Dict with summary stats and grouped incident types
        """
        # Get type/subtype breakdown
        result = self.db.execute(text("""
            SELECT 
                COALESCE(cad_event_type, 'Unknown') AS event_type,
                COALESCE(cad_event_subtype, 'Unspecified') AS event_subtype,
                COUNT(*) AS count,
                COUNT(CASE WHEN internal_incident_number LIKE 'F%' THEN 1 END) AS fire_count,
                COUNT(CASE WHEN internal_incident_number LIKE 'E%' THEN 1 END) AS ems_count
            FROM incidents
            WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
              AND deleted_at IS NULL
              AND (internal_incident_number LIKE 'F%' OR internal_incident_number LIKE 'E%')
            GROUP BY cad_event_type, cad_event_subtype
            ORDER BY cad_event_type, count DESC
        """), {"start_date": start_date, "end_date": end_date})
        
        # Group by type
        types_grouped = {}
        for row in result:
            event_type = row[0]
            event_subtype = row[1]
            count = row[2]
            fire_count = row[3]
            ems_count = row[4]
            
            if event_type not in types_grouped:
                types_grouped[event_type] = {
                    "name": event_type,
                    "count": 0,
                    "fire_count": 0,
                    "ems_count": 0,
                    "items": []
                }
            
            types_grouped[event_type]["count"] += count
            types_grouped[event_type]["fire_count"] += fire_count
            types_grouped[event_type]["ems_count"] += ems_count
            types_grouped[event_type]["items"].append({
                "name": event_subtype,
                "count": count,
                "fire_count": fire_count,
                "ems_count": ems_count,
            })
        
        # Sort by total count
        incident_types = sorted(
            types_grouped.values(),
            key=lambda x: x["count"],
            reverse=True
        )
        
        # Summary stats
        total_incidents = self.db.execute(text("""
            SELECT 
                COUNT(*) AS total,
                COUNT(CASE WHEN internal_incident_number LIKE 'F%' THEN 1 END) AS fire,
                COUNT(CASE WHEN internal_incident_number LIKE 'E%' THEN 1 END) AS ems,
                COUNT(DISTINCT cad_event_type) AS unique_types
            FROM incidents
            WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
              AND deleted_at IS NULL
              AND (internal_incident_number LIKE 'F%' OR internal_incident_number LIKE 'E%')
        """), {"start_date": start_date, "end_date": end_date}).fetchone()
        
        # Municipality breakdown
        muni_result = self.db.execute(text("""
            SELECT 
                COALESCE(m.display_name, i.municipality_code, 'Unknown') AS municipality,
                COUNT(*) AS count
            FROM incidents i
            LEFT JOIN municipalities m ON i.municipality_code = m.code
            WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
              AND i.deleted_at IS NULL
              AND (i.internal_incident_number LIKE 'F%' OR i.internal_incident_number LIKE 'E%')
            GROUP BY COALESCE(m.display_name, i.municipality_code, 'Unknown')
            ORDER BY count DESC
            LIMIT 10
        """), {"start_date": start_date, "end_date": end_date})
        
        municipalities = [
            {"name": row[0], "count": row[1]}
            for row in muni_result
        ]
        
        # Hourly distribution
        hourly_result = self.db.execute(text("""
            SELECT 
                EXTRACT(HOUR FROM time_dispatched)::int AS hour,
                COUNT(*) AS count
            FROM incidents
            WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
              AND deleted_at IS NULL
              AND time_dispatched IS NOT NULL
              AND (internal_incident_number LIKE 'F%' OR internal_incident_number LIKE 'E%')
            GROUP BY EXTRACT(HOUR FROM time_dispatched)
            ORDER BY hour
        """), {"start_date": start_date, "end_date": end_date})
        
        hourly = {row[0]: row[1] for row in hourly_result}
        
        return {
            "incident_types": incident_types,
            "municipalities": municipalities,
            "hourly_distribution": hourly,
            "summary": {
                "total_incidents": total_incidents[0] or 0,
                "fire_incidents": total_incidents[1] or 0,
                "ems_incidents": total_incidents[2] or 0,
                "unique_types": total_incidents[3] or 0,
            },
            "date_range": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
        }
    
    def render_body(self, data: dict, **params) -> str:
        """Render the incidents type breakdown report body."""
        summary = data.get("summary", {})
        incident_types = data.get("incident_types", [])
        municipalities = data.get("municipalities", [])
        
        # Summary stats section
        stats_html = stat_grid([
            {"value": summary.get("total_incidents", 0), "label": "Total Incidents", "highlight": True},
            {"value": summary.get("fire_incidents", 0), "label": "Fire"},
            {"value": summary.get("ems_incidents", 0), "label": "EMS"},
            {"value": summary.get("unique_types", 0), "label": "Incident Types"},
        ], colors=self.colors)
        
        summary_section = section("Summary", stats_html, colors=self.colors)
        
        # Incident types grouped list
        types_html = grouped_list(incident_types, colors=self.colors)
        types_section = section("Incident Type Breakdown", types_html, colors=self.colors)
        
        # Municipality table
        if municipalities:
            headers = ["Municipality", "Incidents"]
            alignments = ["left", "right"]
            rows = [[m["name"], m["count"]] for m in municipalities]
            
            muni_html = data_table(
                headers=headers,
                rows=rows,
                alignments=alignments,
                colors=self.colors
            )
        else:
            muni_html = '<div class="text-muted text-center">No data</div>'
        
        muni_section = section("Top Municipalities", muni_html, colors=self.colors)
        
        # Two column layout
        content = two_column(types_section, muni_section)
        
        return summary_section + content
    
    def get_pdf_filename(self, **params) -> str:
        start_date = params.get('start_date')
        end_date = params.get('end_date')
        
        return f"incident_types_report_{start_date}_{end_date}.pdf"


class IncidentTypeDetailReport(AdminReport):
    """
    Individual Incident Type Detail Report
    
    Shows comprehensive stats for a specific cad_event_type:
    - Subtype breakdown
    - Geographic distribution
    - Time patterns
    - Response time stats
    - List of actual incidents
    
    Future implementation - scaffolded for now.
    """
    
    def get_title(self) -> str:
        return "Incident Type Detail Report"
    
    def get_subtitle(self, data: dict, **params) -> str:
        type_name = params.get('incident_type', 'Unknown')
        start_date = params.get('start_date')
        end_date = params.get('end_date')
        
        date_str = self.format_date_range(start_date, end_date)
        return f"{type_name} — {date_str}"
    
    def get_data(
        self,
        incident_type: str,
        start_date: date,
        end_date: date
    ) -> dict:
        """
        Fetch detail data for a specific incident type.
        
        Args:
            incident_type: The cad_event_type to filter on
            start_date: Report start date
            end_date: Report end date
        """
        # Subtype breakdown
        subtype_result = self.db.execute(text("""
            SELECT 
                COALESCE(cad_event_subtype, 'Unspecified') AS subtype,
                COUNT(*) AS count
            FROM incidents
            WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
              AND deleted_at IS NULL
              AND cad_event_type = :incident_type
              AND (internal_incident_number LIKE 'F%' OR internal_incident_number LIKE 'E%')
            GROUP BY cad_event_subtype
            ORDER BY count DESC
        """), {
            "incident_type": incident_type,
            "start_date": start_date,
            "end_date": end_date
        })
        
        subtypes = [
            {"name": row[0], "count": row[1]}
            for row in subtype_result
        ]
        
        total_count = sum(s["count"] for s in subtypes)
        
        # Municipality breakdown for this type
        muni_result = self.db.execute(text("""
            SELECT 
                COALESCE(m.display_name, i.municipality_code, 'Unknown') AS municipality,
                COUNT(*) AS count
            FROM incidents i
            LEFT JOIN municipalities m ON i.municipality_code = m.code
            WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
              AND i.deleted_at IS NULL
              AND i.cad_event_type = :incident_type
              AND (i.internal_incident_number LIKE 'F%' OR i.internal_incident_number LIKE 'E%')
            GROUP BY COALESCE(m.display_name, i.municipality_code, 'Unknown')
            ORDER BY count DESC
        """), {
            "incident_type": incident_type,
            "start_date": start_date,
            "end_date": end_date
        })
        
        municipalities = [
            {"name": row[0], "count": row[1]}
            for row in muni_result
        ]
        
        # Response time stats for this type
        response_result = self.db.execute(text("""
            SELECT 
                AVG(EXTRACT(EPOCH FROM (time_first_enroute - time_dispatched)) / 60) AS avg_turnout,
                AVG(EXTRACT(EPOCH FROM (time_first_on_scene - time_dispatched)) / 60) AS avg_response,
                AVG(EXTRACT(EPOCH FROM (time_last_cleared - time_first_on_scene)) / 60) AS avg_on_scene
            FROM incidents
            WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
              AND deleted_at IS NULL
              AND cad_event_type = :incident_type
              AND time_dispatched IS NOT NULL
              AND (internal_incident_number LIKE 'F%' OR internal_incident_number LIKE 'E%')
        """), {
            "incident_type": incident_type,
            "start_date": start_date,
            "end_date": end_date
        }).fetchone()
        
        response_times = {
            "avg_turnout_minutes": round(float(response_result[0] or 0), 1) if response_result[0] else None,
            "avg_response_minutes": round(float(response_result[1] or 0), 1) if response_result[1] else None,
            "avg_on_scene_minutes": round(float(response_result[2] or 0), 1) if response_result[2] else None,
        }
        
        return {
            "incident_type": incident_type,
            "total_count": total_count,
            "subtypes": subtypes,
            "municipalities": municipalities,
            "response_times": response_times,
            "date_range": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
        }
    
    def render_body(self, data: dict, **params) -> str:
        """Render the incident type detail report body."""
        incident_type = data.get("incident_type", "Unknown")
        total_count = data.get("total_count", 0)
        subtypes = data.get("subtypes", [])
        municipalities = data.get("municipalities", [])
        response_times = data.get("response_times", {})
        
        # Summary stats
        summary_stats = stat_grid([
            {"value": total_count, "label": "Total Incidents", "highlight": True},
            {"value": len(subtypes), "label": "Subtypes"},
            {"value": len(municipalities), "label": "Municipalities"},
            {"value": response_times.get("avg_response_minutes") or "-", "label": "Avg Response (min)"},
        ], colors=self.colors)
        
        summary_section = section("Summary", summary_stats, colors=self.colors)
        
        # Subtype breakdown table
        if subtypes:
            headers = ["Subtype", "Count", "%"]
            alignments = ["left", "right", "right"]
            rows = []
            for s in subtypes:
                pct = round((s["count"] / total_count) * 100, 1) if total_count > 0 else 0
                rows.append([s["name"], s["count"], f"{pct}%"])
            
            subtype_html = data_table(
                headers=headers,
                rows=rows,
                alignments=alignments,
                colors=self.colors
            )
        else:
            subtype_html = '<div class="text-muted text-center">No subtypes</div>'
        
        subtype_section = section("Subtype Breakdown", subtype_html, colors=self.colors)
        
        # Municipality table
        if municipalities:
            headers = ["Municipality", "Count"]
            alignments = ["left", "right"]
            rows = [[m["name"], m["count"]] for m in municipalities]
            
            muni_html = data_table(
                headers=headers,
                rows=rows,
                alignments=alignments,
                colors=self.colors
            )
        else:
            muni_html = '<div class="text-muted text-center">No data</div>'
        
        muni_section = section("By Municipality", muni_html, colors=self.colors)
        
        # Response times
        rt_stats = stat_grid([
            {"value": response_times.get("avg_turnout_minutes") or "-", "label": "Avg Turnout (min)"},
            {"value": response_times.get("avg_response_minutes") or "-", "label": "Avg Response (min)"},
            {"value": response_times.get("avg_on_scene_minutes") or "-", "label": "Avg On Scene (min)"},
        ], colors=self.colors)
        
        rt_section = section("Response Times", rt_stats, colors=self.colors)
        
        # Layout
        content = two_column(subtype_section, muni_section)
        
        return summary_section + content + rt_section
    
    def get_pdf_filename(self, **params) -> str:
        incident_type = params.get('incident_type', 'unknown').replace(' ', '_').lower()
        start_date = params.get('start_date')
        end_date = params.get('end_date')
        
        return f"incident_type_{incident_type}_{start_date}_{end_date}.pdf"
