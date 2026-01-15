"""
Units/Apparatus Reports

- UnitsListReport: All units with response counts (Fire/EMS breakdown)
- UnitsDetailReport: Individual unit detail (future)
"""

from datetime import date
from typing import Optional
from sqlalchemy import text

from .base import AdminReport
from .components import (
    stat_grid, data_table, section, two_column,
    format_hours, esc
)


class UnitsListReport(AdminReport):
    """
    Units Activity Report - List View
    
    Shows all apparatus/units with response counts.
    Includes Fire/EMS breakdown columns (no category filter - shows all).
    """
    
    def get_title(self) -> str:
        return "Unit Activity Report"
    
    def get_subtitle(self, data: dict, **params) -> str:
        start_date = params.get('start_date')
        end_date = params.get('end_date')
        return self.format_date_range(start_date, end_date)
    
    def get_data(
        self,
        start_date: date,
        end_date: date,
        include_virtual: bool = False
    ) -> dict:
        """
        Fetch unit activity data.
        
        Args:
            start_date: Report start date
            end_date: Report end date
            include_virtual: Include DIRECT/STATION units (default: False, APPARATUS only)
        
        Returns:
            Dict with summary stats and unit list with Fire/EMS breakdown
        """
        category_filter = "" if include_virtual else "AND a.unit_category = 'APPARATUS'"
        
        # Main unit stats query with Fire/EMS breakdown
        result = self.db.execute(text(f"""
            WITH filtered_incidents AS (
                SELECT 
                    id,
                    CASE 
                        WHEN internal_incident_number LIKE 'F%' THEN 'FIRE'
                        WHEN internal_incident_number LIKE 'E%' THEN 'EMS'
                        ELSE 'OTHER'
                    END AS category
                FROM incidents
                WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
                  AND deleted_at IS NULL
                  AND (internal_incident_number LIKE 'F%' OR internal_incident_number LIKE 'E%')
            ),
            unit_stats AS (
                SELECT 
                    a.id,
                    a.unit_designator,
                    a.name,
                    a.unit_category,
                    a.neris_unit_type,
                    COUNT(DISTINCT fi.id) AS total_incidents,
                    COUNT(DISTINCT CASE WHEN fi.category = 'FIRE' THEN fi.id END) AS fire_incidents,
                    COUNT(DISTINCT CASE WHEN fi.category = 'EMS' THEN fi.id END) AS ems_incidents,
                    COUNT(iu.id) AS total_responses
                FROM apparatus a
                LEFT JOIN incident_units iu ON iu.apparatus_id = a.id
                LEFT JOIN filtered_incidents fi ON iu.incident_id = fi.id
                WHERE a.active = true
                  {category_filter}
                GROUP BY a.id, a.unit_designator, a.name, a.unit_category, a.neris_unit_type, a.display_order
                ORDER BY a.display_order, total_incidents DESC
            )
            SELECT * FROM unit_stats
        """), {"start_date": start_date, "end_date": end_date})
        
        units = []
        for row in result:
            units.append({
                "id": row[0],
                "unit_designator": row[1],
                "name": row[2],
                "category": row[3],
                "neris_type": row[4],
                "total_incidents": row[5],
                "fire_incidents": row[6],
                "ems_incidents": row[7],
                "total_responses": row[8],
            })
        
        # Summary stats
        total_incidents = self.db.execute(text("""
            SELECT 
                COUNT(*) AS total,
                COUNT(CASE WHEN internal_incident_number LIKE 'F%' THEN 1 END) AS fire,
                COUNT(CASE WHEN internal_incident_number LIKE 'E%' THEN 1 END) AS ems
            FROM incidents
            WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
              AND deleted_at IS NULL
              AND (internal_incident_number LIKE 'F%' OR internal_incident_number LIKE 'E%')
        """), {"start_date": start_date, "end_date": end_date}).fetchone()
        
        total_responses = sum(u["total_responses"] for u in units)
        active_units = len([u for u in units if u["total_incidents"] > 0])
        
        return {
            "units": units,
            "summary": {
                "total_incidents": total_incidents[0] or 0,
                "fire_incidents": total_incidents[1] or 0,
                "ems_incidents": total_incidents[2] or 0,
                "total_responses": total_responses,
                "active_units": active_units,
                "total_units": len(units),
            },
            "date_range": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
        }
    
    def render_body(self, data: dict, **params) -> str:
        """Render the units list report body."""
        summary = data.get("summary", {})
        units = data.get("units", [])
        
        # Summary stats section
        stats_html = stat_grid([
            {"value": summary.get("active_units", 0), "label": "Active Units", "highlight": True},
            {"value": summary.get("total_incidents", 0), "label": "Total Incidents"},
            {"value": summary.get("fire_incidents", 0), "label": "Fire"},
            {"value": summary.get("ems_incidents", 0), "label": "EMS"},
        ], colors=self.colors)
        
        summary_section = section("Summary", stats_html, colors=self.colors)
        
        # Units table with Fire/EMS breakdown columns
        headers = ["Unit", "Name", "Total", "Fire", "EMS"]
        alignments = ["left", "left", "right", "right", "right"]
        
        rows = []
        for u in units:
            # Only show units with activity
            if u["total_incidents"] > 0:
                rows.append([
                    u["unit_designator"],
                    u["name"],
                    u["total_incidents"],
                    u["fire_incidents"],
                    u["ems_incidents"],
                ])
        
        table_html = data_table(
            headers=headers,
            rows=rows,
            alignments=alignments,
            colors=self.colors
        )
        
        table_section = section("Unit Activity", table_html, colors=self.colors)
        
        return summary_section + table_section
    
    def get_pdf_filename(self, **params) -> str:
        start_date = params.get('start_date')
        end_date = params.get('end_date')
        
        return f"unit_report_{start_date}_{end_date}.pdf"


class UnitsDetailReport(AdminReport):
    """
    Individual Unit Detail Report
    
    Shows comprehensive stats for a single unit:
    - Activity summary (combined + by category)
    - Personnel breakdown (who rode this unit most)
    - Incident type breakdown
    - Response time stats for this unit
    
    Future implementation - scaffolded for now.
    """
    
    def get_title(self) -> str:
        return "Unit Detail Report"
    
    def get_subtitle(self, data: dict, **params) -> str:
        unit_name = data.get("unit", {}).get("name", "Unknown")
        start_date = params.get('start_date')
        end_date = params.get('end_date')
        
        date_str = self.format_date_range(start_date, end_date)
        return f"{unit_name} — {date_str}"
    
    def get_data(
        self,
        unit_id: int,
        start_date: date,
        end_date: date
    ) -> dict:
        """
        Fetch individual unit detail data.
        
        Returns combined stats with Fire/EMS breakdown.
        """
        # Get unit info
        unit_result = self.db.execute(text("""
            SELECT id, unit_designator, name, unit_category, neris_unit_type
            FROM apparatus
            WHERE id = :uid
        """), {"uid": unit_id})
        
        unit_row = unit_result.fetchone()
        if not unit_row:
            return {"unit": None, "error": "Unit not found"}
        
        unit = {
            "id": unit_row[0],
            "unit_designator": unit_row[1],
            "name": unit_row[2],
            "category": unit_row[3],
            "neris_type": unit_row[4],
        }
        
        # Get stats by category
        stats_result = self.db.execute(text("""
            WITH unit_incidents AS (
                SELECT 
                    i.id,
                    i.internal_incident_number,
                    CASE 
                        WHEN i.internal_incident_number LIKE 'F%' THEN 'FIRE'
                        WHEN i.internal_incident_number LIKE 'E%' THEN 'EMS'
                        ELSE 'OTHER'
                    END AS category
                FROM incidents i
                JOIN incident_units iu ON iu.incident_id = i.id
                WHERE iu.apparatus_id = :uid
                  AND COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
                  AND i.deleted_at IS NULL
                  AND (i.internal_incident_number LIKE 'F%' OR i.internal_incident_number LIKE 'E%')
            )
            SELECT 
                category,
                COUNT(*) AS incident_count
            FROM unit_incidents
            GROUP BY category
        """), {
            "uid": unit_id,
            "start_date": start_date,
            "end_date": end_date
        })
        
        fire_count = 0
        ems_count = 0
        
        for row in stats_result:
            if row[0] == 'FIRE':
                fire_count = row[1]
            elif row[0] == 'EMS':
                ems_count = row[1]
        
        combined = {
            "incident_count": fire_count + ems_count,
        }
        
        # Get personnel breakdown (who rode this unit most)
        personnel_result = self.db.execute(text("""
            SELECT 
                p.first_name || ' ' || p.last_name AS name,
                r.abbreviation AS rank,
                COUNT(*) AS times_assigned
            FROM incident_personnel ip
            JOIN incident_units iu ON ip.incident_unit_id = iu.id
            JOIN incidents i ON ip.incident_id = i.id
            JOIN personnel p ON ip.personnel_id = p.id
            LEFT JOIN ranks r ON p.rank_id = r.id
            WHERE iu.apparatus_id = :uid
              AND COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
              AND i.deleted_at IS NULL
              AND (i.internal_incident_number LIKE 'F%' OR i.internal_incident_number LIKE 'E%')
            GROUP BY p.id, p.first_name, p.last_name, r.abbreviation
            ORDER BY times_assigned DESC
            LIMIT 15
        """), {
            "uid": unit_id,
            "start_date": start_date,
            "end_date": end_date
        })
        
        personnel = [
            {"name": row[0], "rank": row[1], "count": row[2]}
            for row in personnel_result
        ]
        
        # Get incident type breakdown
        types_result = self.db.execute(text("""
            SELECT 
                COALESCE(i.cad_event_type, 'Unknown') AS incident_type,
                COUNT(*) AS count
            FROM incidents i
            JOIN incident_units iu ON iu.incident_id = i.id
            WHERE iu.apparatus_id = :uid
              AND COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
              AND i.deleted_at IS NULL
              AND (i.internal_incident_number LIKE 'F%' OR i.internal_incident_number LIKE 'E%')
            GROUP BY i.cad_event_type
            ORDER BY count DESC
        """), {
            "uid": unit_id,
            "start_date": start_date,
            "end_date": end_date
        })
        
        incident_types = [
            {"type": row[0], "count": row[1]}
            for row in types_result
        ]
        
        return {
            "unit": unit,
            "combined": combined,
            "fire_count": fire_count,
            "ems_count": ems_count,
            "personnel": personnel,
            "incident_types": incident_types,
            "date_range": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
        }
    
    def render_body(self, data: dict, **params) -> str:
        """Render the individual unit detail report body."""
        if data.get("error"):
            return f'<div class="section"><div class="section-body">{data["error"]}</div></div>'
        
        unit = data.get("unit", {})
        combined = data.get("combined", {})
        fire_count = data.get("fire_count", 0)
        ems_count = data.get("ems_count", 0)
        personnel = data.get("personnel", [])
        incident_types = data.get("incident_types", [])
        
        # Summary stats
        summary_stats = stat_grid([
            {"value": combined.get("incident_count", 0), "label": "Total Incidents", "highlight": True},
            {"value": fire_count, "label": "Fire"},
            {"value": ems_count, "label": "EMS"},
            {"value": len(personnel), "label": "Unique Personnel"},
        ], colors=self.colors)
        
        summary_section = section("Activity Summary", summary_stats, colors=self.colors)
        
        # Personnel breakdown table
        if personnel:
            headers = ["Name", "Rank", "Times"]
            alignments = ["left", "left", "right"]
            rows = [[p["name"], p["rank"] or "-", p["count"]] for p in personnel]
            
            personnel_html = data_table(
                headers=headers,
                rows=rows,
                alignments=alignments,
                highlight_rows=[0, 1, 2] if len(rows) >= 3 else list(range(len(rows))),
                colors=self.colors
            )
        else:
            personnel_html = '<div class="text-muted text-center">No personnel assignments</div>'
        
        personnel_section = section("Top Personnel", personnel_html, colors=self.colors)
        
        # Incident types table
        if incident_types:
            headers = ["Incident Type", "Count"]
            alignments = ["left", "right"]
            rows = [[t["type"], t["count"]] for t in incident_types]
            
            types_html = data_table(
                headers=headers,
                rows=rows,
                alignments=alignments,
                colors=self.colors
            )
        else:
            types_html = '<div class="text-muted text-center">No incidents</div>'
        
        types_section = section("Incident Types", types_html, colors=self.colors)
        
        # Two column layout for personnel and types
        content = two_column(personnel_section, types_section)
        
        return summary_section + content
    
    def get_pdf_filename(self, **params) -> str:
        unit_id = params.get('unit_id')
        start_date = params.get('start_date')
        end_date = params.get('end_date')
        
        return f"unit_{unit_id}_detail_{start_date}_{end_date}.pdf"
