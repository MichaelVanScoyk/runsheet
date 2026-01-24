"""
Detail Reports (Roll Call Attendance)

- DetailListReport: Summary of DETAIL incidents with personnel attendance
- DetailPersonnelReport: Individual personnel's detail attendance breakdown
"""

from datetime import date
from typing import Optional
from sqlalchemy import text

from .base import AdminReport
from .components import (
    stat_grid, data_table, section, two_column,
    rank_badge, format_hours, esc
)


# Detail type display names
DETAIL_TYPE_NAMES = {
    'MEETING': 'Meeting',
    'WORKNIGHT': 'Work Night',
    'TRAINING': 'Training',
    'DRILL': 'Drill',
    'OTHER': 'Other',
}


class DetailListReport(AdminReport):
    """
    Detail Activity Report - List View
    
    Shows personnel ranked by DETAIL attendance (meetings, worknights, training, drills).
    """
    
    def get_title(self) -> str:
        return "Detail Attendance Report"
    
    def get_subtitle(self, data: dict, **params) -> str:
        start_date = params.get('start_date')
        end_date = params.get('end_date')
        
        return self.format_date_range(start_date, end_date)
    
    def get_data(
        self,
        start_date: date,
        end_date: date,
        limit: int = 50
    ) -> dict:
        """
        Fetch detail attendance data.
        
        Args:
            start_date: Report start date
            end_date: Report end date
            limit: Max personnel to return
        
        Returns:
            Dict with summary stats and personnel list
        """
        
        # Main personnel stats query for DETAIL incidents
        result = self.db.execute(text("""
            WITH detail_incidents AS (
                SELECT 
                    id,
                    detail_type,
                    time_event_start,
                    time_event_end
                FROM incidents
                WHERE COALESCE(incident_date, created_at::date) BETWEEN :start_date AND :end_date
                  AND deleted_at IS NULL
                  AND call_category = 'DETAIL'
                  AND detail_type IS NOT NULL
            ),
            personnel_stats AS (
                SELECT 
                    p.id,
                    p.first_name,
                    p.last_name,
                    r.rank_name,
                    r.abbreviation AS rank_abbrev,
                    COUNT(DISTINCT di.id) AS event_count,
                    COALESCE(SUM(
                        CASE 
                            WHEN di.time_event_start IS NOT NULL AND di.time_event_end IS NOT NULL
                            THEN EXTRACT(EPOCH FROM (di.time_event_end - di.time_event_start)) / 3600.0
                            ELSE 0
                        END
                    ), 0) AS total_hours
                FROM personnel p
                LEFT JOIN ranks r ON p.rank_id = r.id
                LEFT JOIN incident_personnel ip ON ip.personnel_id = p.id
                LEFT JOIN detail_incidents di ON ip.incident_id = di.id
                WHERE p.active = true
                GROUP BY p.id, p.first_name, p.last_name, r.rank_name, r.abbreviation
                HAVING COUNT(DISTINCT di.id) > 0
            )
            SELECT 
                id,
                first_name,
                last_name,
                rank_name,
                rank_abbrev,
                event_count,
                total_hours
            FROM personnel_stats
            ORDER BY event_count DESC, total_hours DESC
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
                "event_count": row[5],
                "total_hours": round(float(row[6] or 0), 1)
            })
        
        # Summary stats
        summary_result = self.db.execute(text("""
            WITH detail_incidents AS (
                SELECT id, detail_type
                FROM incidents i
                WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
                  AND i.deleted_at IS NULL
                  AND i.call_category = 'DETAIL'
                  AND i.detail_type IS NOT NULL
            )
            SELECT 
                COUNT(DISTINCT ip.personnel_id) AS unique_attendees,
                COUNT(ip.id) AS total_attendance_records,
                COUNT(DISTINCT di.id) AS total_events
            FROM incident_personnel ip
            JOIN detail_incidents di ON ip.incident_id = di.id
        """), {"start_date": start_date, "end_date": end_date})
        
        summary_row = summary_result.fetchone()
        
        # Breakdown by detail type
        type_breakdown_result = self.db.execute(text("""
            SELECT 
                i.detail_type,
                COUNT(DISTINCT i.id) AS event_count,
                COUNT(DISTINCT ip.personnel_id) AS unique_attendees
            FROM incidents i
            LEFT JOIN incident_personnel ip ON ip.incident_id = i.id
            WHERE COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
              AND i.deleted_at IS NULL
              AND i.call_category = 'DETAIL'
              AND i.detail_type IS NOT NULL
            GROUP BY i.detail_type
            ORDER BY event_count DESC
        """), {"start_date": start_date, "end_date": end_date})
        
        type_breakdown = []
        for row in type_breakdown_result:
            type_breakdown.append({
                "type": row[0],
                "type_name": DETAIL_TYPE_NAMES.get(row[0], row[0]),
                "event_count": row[1],
                "unique_attendees": row[2],
            })
        
        total_hours = sum(p["total_hours"] for p in personnel)
        
        return {
            "personnel": personnel,
            "summary": {
                "unique_attendees": summary_row[0] or 0,
                "total_attendance_records": summary_row[1] or 0,
                "total_events": summary_row[2] or 0,
                "total_hours": round(total_hours, 1),
            },
            "type_breakdown": type_breakdown,
            "date_range": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
        }
    
    def render_body(self, data: dict, **params) -> str:
        """Render the detail attendance report body."""
        summary = data.get("summary", {})
        personnel = data.get("personnel", [])
        type_breakdown = data.get("type_breakdown", [])
        
        # Summary stats section
        stats_html = stat_grid([
            {"value": summary.get("total_events", 0), "label": "Total Events", "highlight": True},
            {"value": summary.get("unique_attendees", 0), "label": "Unique Attendees"},
            {"value": summary.get("total_attendance_records", 0), "label": "Total Attendance"},
            {"value": format_hours(summary.get("total_hours", 0)), "label": "Total Hours"},
        ], colors=self.colors)
        
        summary_section = section("Summary", stats_html, colors=self.colors)
        
        # Personnel table
        headers = ["#", "Name", "Rank", "Events", "Hours"]
        alignments = ["center", "left", "left", "right", "right"]
        
        rows = []
        for i, p in enumerate(personnel):
            rank_num = i + 1
            badge = rank_badge(rank_num, self.colors)
            rows.append([
                badge,
                p["name"],
                p.get("rank_abbrev") or p.get("rank") or "-",
                p["event_count"],
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
        
        # Type breakdown table
        if type_breakdown:
            type_headers = ["Event Type", "Events", "Attendees"]
            type_alignments = ["left", "right", "right"]
            type_rows = [
                [t["type_name"], t["event_count"], t["unique_attendees"]]
                for t in type_breakdown
            ]
            
            type_table_html = data_table(
                headers=type_headers,
                rows=type_rows,
                alignments=type_alignments,
                colors=self.colors
            )
            
            type_section = section("Breakdown by Event Type", type_table_html, colors=self.colors)
        else:
            type_section = ""
        
        return summary_section + table_section + type_section
    
    def get_pdf_filename(self, **params) -> str:
        start_date = params.get('start_date')
        end_date = params.get('end_date')
        
        return f"detail_attendance_report_{start_date}_{end_date}.pdf"


class DetailPersonnelReport(AdminReport):
    """
    Individual Personnel Detail Attendance Report
    
    Shows comprehensive detail attendance for a single person:
    - Breakdown by detail type (meetings, worknights, training, etc.)
    - Hours per type
    - Monthly attendance trend
    """
    
    def get_title(self) -> str:
        return "Personnel Detail Attendance Report"
    
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
        Fetch individual personnel detail attendance data.
        
        Returns breakdown by detail type with counts and hours.
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
        
        # Get stats by detail type
        type_result = self.db.execute(text("""
            SELECT 
                i.detail_type,
                COUNT(*) AS event_count,
                COALESCE(SUM(
                    CASE 
                        WHEN i.time_event_start IS NOT NULL AND i.time_event_end IS NOT NULL
                        THEN EXTRACT(EPOCH FROM (i.time_event_end - i.time_event_start)) / 3600.0
                        ELSE 0
                    END
                ), 0) AS total_hours
            FROM incidents i
            JOIN incident_personnel ip ON ip.incident_id = i.id
            WHERE ip.personnel_id = :pid
              AND COALESCE(i.incident_date, i.created_at::date) BETWEEN :start_date AND :end_date
              AND i.deleted_at IS NULL
              AND i.call_category = 'DETAIL'
              AND i.detail_type IS NOT NULL
            GROUP BY i.detail_type
            ORDER BY event_count DESC
        """), {
            "pid": personnel_id,
            "start_date": start_date,
            "end_date": end_date
        })
        
        by_type = []
        total_events = 0
        total_hours = 0
        
        for row in type_result:
            event_count = row[1]
            hours = round(float(row[2] or 0), 1)
            
            by_type.append({
                "type": row[0],
                "type_name": DETAIL_TYPE_NAMES.get(row[0], row[0]),
                "event_count": event_count,
                "total_hours": hours,
            })
            
            total_events += event_count
            total_hours += hours
        
        combined = {
            "event_count": total_events,
            "total_hours": round(total_hours, 1),
        }
        
        return {
            "person": person,
            "combined": combined,
            "by_type": by_type,
            "date_range": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
        }
    
    def render_body(self, data: dict, **params) -> str:
        """Render the individual personnel detail attendance report body."""
        if data.get("error"):
            return f'<div class="section"><div class="section-body">{data["error"]}</div></div>'
        
        person = data.get("person", {})
        combined = data.get("combined", {})
        by_type = data.get("by_type", [])
        
        # Combined summary
        summary_stats = stat_grid([
            {"value": combined.get("event_count", 0), "label": "Total Events", "highlight": True},
            {"value": format_hours(combined.get("total_hours", 0)), "label": "Total Hours"},
            {"value": len(by_type), "label": "Event Types"},
        ], colors=self.colors)
        
        summary_section = section("Attendance Summary", summary_stats, colors=self.colors)
        
        # Type breakdown table
        if by_type:
            headers = ["Event Type", "Events Attended", "Hours"]
            alignments = ["left", "right", "right"]
            rows = [
                [t["type_name"], t["event_count"], format_hours(t["total_hours"])]
                for t in by_type
            ]
            
            type_html = data_table(
                headers=headers,
                rows=rows,
                alignments=alignments,
                colors=self.colors
            )
        else:
            type_html = '<div class="text-muted text-center">No detail attendance recorded</div>'
        
        type_section = section("Breakdown by Event Type", type_html, colors=self.colors)
        
        return summary_section + type_section
    
    def get_pdf_filename(self, **params) -> str:
        personnel_id = params.get('personnel_id')
        start_date = params.get('start_date')
        end_date = params.get('end_date')
        
        return f"personnel_{personnel_id}_detail_attendance_{start_date}_{end_date}.pdf"
