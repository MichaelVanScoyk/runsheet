"""
Personnel Reports

- PersonnelListReport: Ranked list of personnel by activity
- PersonnelDetailReport: Individual personnel detail (future)
"""

from datetime import date
from typing import Optional
from sqlalchemy import text

from .base import AdminReport
from .components import (
    stat_grid, data_table, section, two_column,
    rank_badge, format_hours, esc
)


class PersonnelListReport(AdminReport):
    """
    Personnel Activity Report - List View
    
    Shows ranked list of personnel by response count within a date range.
    Supports category filtering (Fire/EMS).
    """
    
    def get_title(self) -> str:
        return "Personnel Activity Report"
    
    def get_subtitle(self, data: dict, **params) -> str:
        start_date = params.get('start_date')
        end_date = params.get('end_date')
        category = params.get('category')
        
        date_str = self.format_date_range(start_date, end_date)
        cat_str = f" ({self.format_category(category)})" if category else ""
        
        return f"{date_str}{cat_str}"
    
    def get_data(
        self,
        start_date: date,
        end_date: date,
        category: Optional[str] = None,
        limit: int = 50
    ) -> dict:
        """
        Fetch personnel activity data.
        
        Args:
            start_date: Report start date
            end_date: Report end date
            category: 'FIRE', 'EMS', or None for all
            limit: Max personnel to return
        
        Returns:
            Dict with summary stats and personnel list
        """
        prefix_filter = self.build_prefix_filter(category, alias='i')
        
        # Main personnel stats query
        result = self.db.execute(text(f"""
            WITH filtered_incidents AS (
                SELECT 
                    id,
                    time_dispatched,
                    time_last_cleared,
                    time_first_on_scene
                FROM incidents
                WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
                  AND deleted_at IS NULL
                  AND time_dispatched IS NOT NULL
                  {prefix_filter.replace('i.', '')}
            ),
            personnel_stats AS (
                SELECT 
                    p.id,
                    p.first_name,
                    p.last_name,
                    r.rank_name,
                    r.abbreviation AS rank_abbrev,
                    COUNT(DISTINCT fi.id) AS incident_count,
                    COALESCE(SUM(
                        EXTRACT(EPOCH FROM (
                            COALESCE(fi.time_last_cleared, fi.time_first_on_scene) - fi.time_dispatched
                        )) / 3600.0
                    ), 0) AS total_hours
                FROM personnel p
                LEFT JOIN ranks r ON p.rank_id = r.id
                LEFT JOIN incident_personnel ip ON ip.personnel_id = p.id
                LEFT JOIN filtered_incidents fi ON ip.incident_id = fi.id
                WHERE p.active = true
                GROUP BY p.id, p.first_name, p.last_name, r.rank_name, r.abbreviation
                HAVING COUNT(DISTINCT fi.id) > 0
            )
            SELECT 
                id,
                first_name,
                last_name,
                rank_name,
                rank_abbrev,
                incident_count,
                total_hours
            FROM personnel_stats
            ORDER BY incident_count DESC, total_hours DESC
            LIMIT :limit
        """), {
            "start_date": start_date,
            "end_date": end_date,
            "limit": limit
        })
        
        personnel = []
        for row in result:
            personnel.append({
                "id": row[0],
                "first_name": row[1],
                "last_name": row[2],
                "name": f"{row[1]} {row[2]}",
                "rank": row[3],
                "rank_abbrev": row[4],
                "incident_count": row[5],
                "total_hours": round(float(row[6] or 0), 1)
            })
        
        # Summary stats
        summary_result = self.db.execute(text(f"""
            WITH filtered_incidents AS (
                SELECT id
                FROM incidents i
                WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
                  AND i.deleted_at IS NULL
                  {prefix_filter}
            )
            SELECT 
                COUNT(DISTINCT ip.personnel_id) AS unique_responders,
                COUNT(ip.id) AS total_responses,
                (SELECT COUNT(*) FROM filtered_incidents) AS total_incidents
            FROM incident_personnel ip
            JOIN filtered_incidents fi ON ip.incident_id = fi.id
        """), {"start_date": start_date, "end_date": end_date})
        
        summary_row = summary_result.fetchone()
        
        total_hours = sum(p["total_hours"] for p in personnel)
        
        return {
            "personnel": personnel,
            "summary": {
                "unique_responders": summary_row[0] or 0,
                "total_responses": summary_row[1] or 0,
                "total_incidents": summary_row[2] or 0,
                "total_hours": round(total_hours, 1),
            },
            "date_range": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
            "category": category,
        }
    
    def render_body(self, data: dict, **params) -> str:
        """Render the personnel list report body."""
        summary = data.get("summary", {})
        personnel = data.get("personnel", [])
        
        # Summary stats section
        stats_html = stat_grid([
            {"value": summary.get("unique_responders", 0), "label": "Active Responders", "highlight": True},
            {"value": summary.get("total_responses", 0), "label": "Total Responses"},
            {"value": summary.get("total_incidents", 0), "label": "Incidents"},
            {"value": format_hours(summary.get("total_hours", 0)), "label": "Total Hours"},
        ], colors=self.colors)
        
        summary_section = section("Summary", stats_html, colors=self.colors)
        
        # Personnel table
        headers = ["#", "Name", "Rank", "Calls", "Hours"]
        alignments = ["center", "left", "left", "right", "right"]
        
        rows = []
        for i, p in enumerate(personnel):
            rank_num = i + 1
            badge = rank_badge(rank_num, self.colors)
            rows.append([
                badge,
                p["name"],
                p.get("rank_abbrev") or p.get("rank") or "-",
                p["incident_count"],
                format_hours(p["total_hours"]),
            ])
        
        # Highlight top 3
        highlight_rows = [0, 1, 2] if len(rows) >= 3 else list(range(len(rows)))
        
        table_html = data_table(
            headers=headers,
            rows=rows,
            alignments=alignments,
            highlight_rows=highlight_rows,
            colors=self.colors
        )
        
        table_section = section("Personnel Rankings", table_html, colors=self.colors)
        
        return summary_section + table_section
    
    def get_pdf_filename(self, **params) -> str:
        start_date = params.get('start_date')
        end_date = params.get('end_date')
        category = params.get('category', 'all')
        
        return f"personnel_report_{category.lower() if category else 'all'}_{start_date}_{end_date}.pdf"


class PersonnelDetailReport(AdminReport):
    """
    Individual Personnel Detail Report
    
    Shows comprehensive stats for a single person:
    - Activity summary (combined + by category)
    - Apparatus breakdown
    - Role breakdown (Driver, Officer, FF)
    - Monthly trend
    
    Future implementation - scaffolded for now.
    """
    
    def get_title(self) -> str:
        return "Personnel Detail Report"
    
    def get_subtitle(self, data: dict, **params) -> str:
        person_name = data.get("person", {}).get("name", "Unknown")
        start_date = params.get('start_date')
        end_date = params.get('end_date')
        
        date_str = self.format_date_range(start_date, end_date)
        return f"{person_name} — {date_str}"
    
    def get_data(
        self,
        personnel_id: int,
        start_date: date,
        end_date: date
    ) -> dict:
        """
        Fetch individual personnel detail data.
        
        Returns combined stats with Fire/EMS breakdown.
        """
        # Get person info
        person_result = self.db.execute(text("""
            SELECT p.id, p.first_name, p.last_name, r.rank_name, r.abbreviation
            FROM personnel p
            LEFT JOIN ranks r ON p.rank_id = r.id
            WHERE p.id = :pid
        """), {"pid": personnel_id})
        
        person_row = person_result.fetchone()
        if not person_row:
            return {"person": None, "error": "Personnel not found"}
        
        person = {
            "id": person_row[0],
            "first_name": person_row[1],
            "last_name": person_row[2],
            "name": f"{person_row[1]} {person_row[2]}",
            "rank": person_row[3],
            "rank_abbrev": person_row[4],
        }
        
        # Get stats by category
        stats_result = self.db.execute(text("""
            WITH person_incidents AS (
                SELECT 
                    i.id,
                    i.internal_incident_number,
                    i.time_dispatched,
                    i.time_last_cleared,
                    i.time_first_on_scene,
                    CASE 
                        WHEN i.internal_incident_number LIKE 'F%' THEN 'FIRE'
                        WHEN i.internal_incident_number LIKE 'E%' THEN 'EMS'
                        ELSE 'OTHER'
                    END AS category
                FROM incidents i
                JOIN incident_personnel ip ON ip.incident_id = i.id
                WHERE ip.personnel_id = :pid
                  AND COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
                  AND i.deleted_at IS NULL
                  AND (i.internal_incident_number LIKE 'F%' OR i.internal_incident_number LIKE 'E%')
            )
            SELECT 
                category,
                COUNT(*) AS incident_count,
                COALESCE(SUM(
                    EXTRACT(EPOCH FROM (
                        COALESCE(time_last_cleared, time_first_on_scene) - time_dispatched
                    )) / 3600.0
                ), 0) AS total_hours
            FROM person_incidents
            WHERE time_dispatched IS NOT NULL
            GROUP BY category
        """), {
            "pid": personnel_id,
            "start_date": start_date,
            "end_date": end_date
        })
        
        fire_stats = {"incident_count": 0, "total_hours": 0}
        ems_stats = {"incident_count": 0, "total_hours": 0}
        
        for row in stats_result:
            if row[0] == 'FIRE':
                fire_stats = {"incident_count": row[1], "total_hours": round(float(row[2] or 0), 1)}
            elif row[0] == 'EMS':
                ems_stats = {"incident_count": row[1], "total_hours": round(float(row[2] or 0), 1)}
        
        combined = {
            "incident_count": fire_stats["incident_count"] + ems_stats["incident_count"],
            "total_hours": round(fire_stats["total_hours"] + ems_stats["total_hours"], 1),
        }
        
        # Get apparatus breakdown
        apparatus_result = self.db.execute(text("""
            SELECT 
                a.name,
                a.unit_designator,
                COUNT(*) AS times_assigned
            FROM incident_personnel ip
            JOIN incident_units iu ON ip.incident_unit_id = iu.id
            JOIN incidents i ON ip.incident_id = i.id
            JOIN apparatus a ON iu.apparatus_id = a.id
            WHERE ip.personnel_id = :pid
              AND COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
              AND i.deleted_at IS NULL
              AND (i.internal_incident_number LIKE 'F%' OR i.internal_incident_number LIKE 'E%')
            GROUP BY a.id, a.name, a.unit_designator
            ORDER BY times_assigned DESC
        """), {
            "pid": personnel_id,
            "start_date": start_date,
            "end_date": end_date
        })
        
        apparatus = [
            {"name": row[0], "unit": row[1], "count": row[2]}
            for row in apparatus_result
        ]
        
        return {
            "person": person,
            "combined": combined,
            "fire": fire_stats,
            "ems": ems_stats,
            "apparatus": apparatus,
            "date_range": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
        }
    
    def render_body(self, data: dict, **params) -> str:
        """Render the individual personnel detail report body."""
        if data.get("error"):
            return f'<div class="section"><div class="section-body">{data["error"]}</div></div>'
        
        person = data.get("person", {})
        combined = data.get("combined", {})
        fire = data.get("fire", {})
        ems = data.get("ems", {})
        apparatus = data.get("apparatus", [])
        
        # Combined summary
        summary_stats = stat_grid([
            {"value": combined.get("incident_count", 0), "label": "Total Calls", "highlight": True},
            {"value": format_hours(combined.get("total_hours", 0)), "label": "Total Hours"},
            {"value": fire.get("incident_count", 0), "label": "Fire Calls"},
            {"value": ems.get("incident_count", 0), "label": "EMS Calls"},
        ], colors=self.colors)
        
        summary_section = section("Activity Summary", summary_stats, colors=self.colors)
        
        # Apparatus breakdown table
        if apparatus:
            headers = ["Apparatus", "Times Assigned"]
            alignments = ["left", "right"]
            rows = [[a["name"], a["count"]] for a in apparatus]
            
            apparatus_html = data_table(
                headers=headers,
                rows=rows,
                alignments=alignments,
                colors=self.colors
            )
        else:
            apparatus_html = '<div class="text-muted text-center">No apparatus assignments</div>'
        
        apparatus_section = section("Apparatus Breakdown", apparatus_html, colors=self.colors)
        
        return summary_section + apparatus_section
    
    def get_pdf_filename(self, **params) -> str:
        personnel_id = params.get('personnel_id')
        start_date = params.get('start_date')
        end_date = params.get('end_date')
        
        return f"personnel_{personnel_id}_detail_{start_date}_{end_date}.pdf"
