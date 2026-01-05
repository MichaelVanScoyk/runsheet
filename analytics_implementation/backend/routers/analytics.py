"""
Analytics Router for CADReport
Handles natural language queries, saved queries, dashboard stats, and predictions.
"""

import os
import time
import json
import re
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, func
import anthropic

from database import get_db
from models import Incident, IncidentUnit, Apparatus, Personnel
from models_analytics import (
    TenantQueryUsage, SavedQuery, QueryExecutionLog, 
    DataQualityIssue, AnalyticsCache
)
from schemas_analytics import (
    NaturalLanguageQueryRequest, SavedQueryExecuteRequest, QueryResult,
    SavedQueryCreate, SavedQueryUpdate, SavedQueryResponse,
    QueryUsageStatus, QueryType, ResultType,
    DataQualityIssueResponse, DataQualityResolveRequest, DataQualitySummary,
    DashboardStats, TrendData, TrendDataPoint, PredictionResult,
    OutlierScanRequest
)
from auth import get_current_user, get_tenant_id

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

# Configuration
DAILY_QUERY_LIMIT = int(os.getenv("ANALYTICS_DAILY_QUERY_LIMIT", "5"))
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

# Initialize Anthropic client (lazy)
_anthropic_client = None

def get_anthropic_client():
    global _anthropic_client
    if _anthropic_client is None:
        if not ANTHROPIC_API_KEY:
            raise HTTPException(
                status_code=503, 
                detail="Natural language queries not configured. Contact administrator."
            )
        _anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    return _anthropic_client


# ============================================================================
# RATE LIMITING
# ============================================================================

def get_query_usage(db: Session, tenant_id: str) -> TenantQueryUsage:
    """Get or create today's usage record"""
    today = date.today()
    usage = db.query(TenantQueryUsage).filter(
        TenantQueryUsage.tenant_id == tenant_id,
        TenantQueryUsage.usage_date == today
    ).first()
    
    if not usage:
        usage = TenantQueryUsage(
            tenant_id=tenant_id,
            usage_date=today,
            query_count=0
        )
        db.add(usage)
        db.commit()
        db.refresh(usage)
    
    return usage


def check_rate_limit(db: Session, tenant_id: str) -> int:
    """Check if tenant can make a query. Returns remaining queries."""
    usage = get_query_usage(db, tenant_id)
    remaining = DAILY_QUERY_LIMIT - usage.query_count
    if remaining <= 0:
        raise HTTPException(
            status_code=429,
            detail={
                "message": "Daily query limit reached. Use saved queries or try again tomorrow.",
                "queries_used": usage.query_count,
                "daily_limit": DAILY_QUERY_LIMIT,
                "reset_time": "midnight local time"
            }
        )
    return remaining


def increment_query_usage(db: Session, tenant_id: str):
    """Increment the query counter"""
    usage = get_query_usage(db, tenant_id)
    usage.query_count += 1
    db.commit()


@router.get("/usage", response_model=QueryUsageStatus)
def get_usage_status(
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id)
):
    """Get current query usage status"""
    usage = get_query_usage(db, tenant_id)
    return QueryUsageStatus(
        queries_used_today=usage.query_count,
        queries_remaining_today=max(0, DAILY_QUERY_LIMIT - usage.query_count),
        daily_limit=DAILY_QUERY_LIMIT,
        reset_time="midnight local time"
    )


# ============================================================================
# NATURAL LANGUAGE QUERY (Claude Integration)
# ============================================================================

SCHEMA_CONTEXT = """
You are a SQL expert helping generate PostgreSQL queries for a fire department incident management system.

DATABASE SCHEMA:
- incidents: id, tenant_id, internal_incident_number, cad_event_number, alarm_datetime, 
  incident_type, municipality, address, location_name, aid_given (bool), aid_received (bool),
  status, narrative, created_at, updated_at
  
- incident_units: id, incident_id, apparatus_id, dispatch_datetime, enroute_datetime, 
  arrived_datetime, cleared_datetime, created_at
  
- apparatus: id, tenant_id, unit_designator, name, unit_category ('APPARATUS','DIRECT','STATION'),
  neris_type_apparatus, counts_for_response_times (bool), active (bool), display_order
  
- incident_personnel: id, incident_id, personnel_id, apparatus_id, rank_at_time, role_at_incident
  
- personnel: id, tenant_id, first_name, last_name, rank_id, active (bool)

- ranks: id, tenant_id, rank_name, display_order

IMPORTANT RULES:
1. ALWAYS filter by tenant_id = :tenant_id (this is a multi-tenant system)
2. ALWAYS filter by date range: alarm_datetime >= :start_date AND alarm_datetime < :end_date
3. Use EXTRACT() for date parts: EXTRACT(hour FROM alarm_datetime), EXTRACT(dow FROM alarm_datetime)
4. For day names, dow: 0=Sunday, 1=Monday, etc.
5. Response time = arrived_datetime - alarm_datetime (or dispatch_datetime)
6. Turnout time = enroute_datetime - dispatch_datetime  
7. Travel time = arrived_datetime - enroute_datetime
8. Only include apparatus WHERE counts_for_response_times = TRUE for response time queries
9. Use COALESCE for nullable fields to avoid nulls in results
10. Return reasonable column aliases (snake_case)
11. LIMIT results to 1000 rows max for safety
12. Times should be converted to minutes using: EXTRACT(EPOCH FROM interval)/60

Return ONLY the SQL query, no explanation. The query must be a SELECT statement only.
"""

def generate_sql_with_claude(question: str) -> tuple[str, int]:
    """Use Claude to generate SQL from natural language. Returns (sql, tokens_used)."""
    client = get_anthropic_client()
    
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": f"{SCHEMA_CONTEXT}\n\nUser question: {question}\n\nGenerate the SQL query:"
            }
        ]
    )
    
    sql = message.content[0].text.strip()
    
    # Clean up the SQL (remove markdown code blocks if present)
    sql = re.sub(r'^```sql?\s*', '', sql)
    sql = re.sub(r'\s*```$', '', sql)
    sql = sql.strip()
    
    # Basic validation
    if not sql.upper().startswith('SELECT'):
        raise ValueError("Generated query is not a SELECT statement")
    
    # Prevent dangerous operations
    dangerous = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'TRUNCATE', 'ALTER', 'CREATE', 'GRANT']
    sql_upper = sql.upper()
    for word in dangerous:
        if word in sql_upper:
            raise ValueError(f"Generated query contains forbidden operation: {word}")
    
    tokens_used = message.usage.input_tokens + message.usage.output_tokens
    
    return sql, tokens_used


def execute_safe_query(
    db: Session, 
    sql: str, 
    tenant_id: str, 
    start_date: date,
    end_date: date,
    extra_params: Dict[str, Any] = None
) -> tuple[List[Dict], int]:
    """Execute SQL safely with parameters. Returns (results, execution_time_ms)."""
    
    start_time = time.time()
    
    params = {
        'tenant_id': tenant_id,
        'start_date': start_date,
        'end_date': end_date
    }
    if extra_params:
        params.update(extra_params)
    
    try:
        result = db.execute(text(sql), params)
        rows = result.fetchall()
        columns = result.keys()
        
        data = [dict(zip(columns, row)) for row in rows]
        
        # Convert any non-serializable types
        for row in data:
            for key, value in row.items():
                if isinstance(value, datetime):
                    row[key] = value.isoformat()
                elif isinstance(value, date):
                    row[key] = value.isoformat()
                elif isinstance(value, timedelta):
                    row[key] = value.total_seconds() / 60  # Convert to minutes
        
        execution_time_ms = int((time.time() - start_time) * 1000)
        
        return data, execution_time_ms
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Query execution failed: {str(e)}")


@router.post("/query", response_model=QueryResult)
def execute_natural_language_query(
    request: NaturalLanguageQueryRequest,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
    current_user: Personnel = Depends(get_current_user)
):
    """Execute a natural language query using Claude API"""
    
    # Check rate limit
    remaining = check_rate_limit(db, tenant_id)
    
    # Default date range (last 12 months if not specified)
    end_date = request.end_date or date.today()
    start_date = request.start_date or (end_date - timedelta(days=365))
    
    try:
        # Generate SQL with Claude
        generated_sql, tokens_used = generate_sql_with_claude(request.question)
        
        # Execute the query
        data, execution_time_ms = execute_safe_query(
            db, generated_sql, tenant_id, start_date, end_date
        )
        
        # Increment usage AFTER successful execution
        increment_query_usage(db, tenant_id)
        
        # Log the execution
        log_entry = QueryExecutionLog(
            tenant_id=tenant_id,
            personnel_id=current_user.id,
            query_type=QueryType.NATURAL_LANGUAGE,
            natural_language=request.question,
            generated_sql=generated_sql,
            execution_time_ms=execution_time_ms,
            row_count=len(data),
            success=True,
            api_tokens_used=tokens_used
        )
        db.add(log_entry)
        
        # Optionally save the query
        saved_query_id = None
        if request.save_query and request.query_name:
            saved = SavedQuery(
                tenant_id=tenant_id,
                name=request.query_name,
                natural_language=request.question,
                generated_sql=generated_sql,
                result_type=ResultType.TABLE,
                created_by=current_user.id,
                is_shared=False
            )
            db.add(saved)
            db.commit()
            db.refresh(saved)
            saved_query_id = saved.id
        else:
            db.commit()
        
        return QueryResult(
            success=True,
            query_type=QueryType.NATURAL_LANGUAGE,
            result_type=ResultType.TABLE,
            data=data,
            row_count=len(data),
            execution_time_ms=execution_time_ms,
            natural_language=request.question,
            generated_sql=generated_sql,
            queries_remaining_today=remaining - 1,
            saved_query_id=saved_query_id
        )
        
    except ValueError as e:
        # SQL generation/validation error
        log_entry = QueryExecutionLog(
            tenant_id=tenant_id,
            personnel_id=current_user.id,
            query_type=QueryType.NATURAL_LANGUAGE,
            natural_language=request.question,
            success=False,
            error_message=str(e)
        )
        db.add(log_entry)
        db.commit()
        
        raise HTTPException(status_code=400, detail=str(e))
        
    except Exception as e:
        # Log failure but don't count against rate limit
        log_entry = QueryExecutionLog(
            tenant_id=tenant_id,
            personnel_id=current_user.id,
            query_type=QueryType.NATURAL_LANGUAGE,
            natural_language=request.question,
            success=False,
            error_message=str(e)
        )
        db.add(log_entry)
        db.commit()
        
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


# ============================================================================
# SAVED QUERIES (No API cost)
# ============================================================================

@router.get("/queries/saved", response_model=List[SavedQueryResponse])
def list_saved_queries(
    include_system: bool = True,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
    current_user: Personnel = Depends(get_current_user)
):
    """List all available saved queries for this tenant"""
    
    query = db.query(SavedQuery).filter(
        ((SavedQuery.tenant_id == tenant_id) | (SavedQuery.tenant_id == '_system')) if include_system
        else (SavedQuery.tenant_id == tenant_id)
    ).filter(
        (SavedQuery.is_shared == True) | 
        (SavedQuery.created_by == current_user.id) |
        (SavedQuery.is_system == True)
    ).order_by(
        SavedQuery.is_system.desc(),
        SavedQuery.use_count.desc()
    )
    
    results = query.all()
    
    # Add creator names
    response = []
    for sq in results:
        item = SavedQueryResponse(
            id=sq.id,
            name=sq.name,
            description=sq.description,
            natural_language=sq.natural_language,
            result_type=sq.result_type,
            chart_config=sq.chart_config,
            is_shared=sq.is_shared,
            is_system=sq.is_system,
            use_count=sq.use_count,
            last_used_at=sq.last_used_at,
            created_at=sq.created_at,
            created_by_name="System" if sq.is_system else (
                f"{sq.creator.first_name} {sq.creator.last_name}" if sq.creator else None
            )
        )
        response.append(item)
    
    return response


@router.post("/queries/saved/execute", response_model=QueryResult)
def execute_saved_query(
    request: SavedQueryExecuteRequest,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
    current_user: Personnel = Depends(get_current_user)
):
    """Execute a saved query (no API cost!)"""
    
    # Get the saved query
    saved = db.query(SavedQuery).filter(
        SavedQuery.id == request.query_id,
        ((SavedQuery.tenant_id == tenant_id) | (SavedQuery.tenant_id == '_system'))
    ).first()
    
    if not saved:
        raise HTTPException(status_code=404, detail="Saved query not found")
    
    # Check access
    if not saved.is_system and not saved.is_shared and saved.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied to this query")
    
    # Default date range
    end_date = request.end_date or date.today()
    start_date = request.start_date or (end_date - timedelta(days=365))
    
    # Execute
    data, execution_time_ms = execute_safe_query(
        db, saved.generated_sql, tenant_id, start_date, end_date,
        request.parameters
    )
    
    # Update usage stats
    saved.use_count += 1
    saved.last_used_at = datetime.utcnow()
    
    # Log execution
    log_entry = QueryExecutionLog(
        tenant_id=tenant_id,
        personnel_id=current_user.id,
        query_type=QueryType.SYSTEM if saved.is_system else QueryType.SAVED,
        saved_query_id=saved.id,
        generated_sql=saved.generated_sql,
        execution_time_ms=execution_time_ms,
        row_count=len(data),
        success=True
    )
    db.add(log_entry)
    db.commit()
    
    return QueryResult(
        success=True,
        query_type=QueryType.SYSTEM if saved.is_system else QueryType.SAVED,
        result_type=saved.result_type,
        data=data,
        row_count=len(data),
        execution_time_ms=execution_time_ms,
        natural_language=saved.natural_language,
        chart_config=saved.chart_config
    )


@router.post("/queries/saved", response_model=SavedQueryResponse)
def create_saved_query(
    query: SavedQueryCreate,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
    current_user: Personnel = Depends(get_current_user)
):
    """Save a query for reuse"""
    
    saved = SavedQuery(
        tenant_id=tenant_id,
        name=query.name,
        description=query.description,
        natural_language=query.natural_language,
        generated_sql=query.generated_sql,
        result_type=query.result_type,
        chart_config=query.chart_config,
        created_by=current_user.id,
        is_shared=query.is_shared,
        is_system=False
    )
    db.add(saved)
    db.commit()
    db.refresh(saved)
    
    return SavedQueryResponse(
        id=saved.id,
        name=saved.name,
        description=saved.description,
        natural_language=saved.natural_language,
        result_type=saved.result_type,
        chart_config=saved.chart_config,
        is_shared=saved.is_shared,
        is_system=saved.is_system,
        use_count=saved.use_count,
        last_used_at=saved.last_used_at,
        created_at=saved.created_at,
        created_by_name=f"{current_user.first_name} {current_user.last_name}"
    )


@router.delete("/queries/saved/{query_id}")
def delete_saved_query(
    query_id: int,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
    current_user: Personnel = Depends(get_current_user)
):
    """Delete a saved query"""
    
    saved = db.query(SavedQuery).filter(
        SavedQuery.id == query_id,
        SavedQuery.tenant_id == tenant_id
    ).first()
    
    if not saved:
        raise HTTPException(status_code=404, detail="Saved query not found")
    
    if saved.is_system:
        raise HTTPException(status_code=403, detail="Cannot delete system queries")
    
    if saved.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Can only delete your own queries")
    
    db.delete(saved)
    db.commit()
    
    return {"message": "Query deleted"}


# ============================================================================
# DASHBOARD STATS
# ============================================================================

@router.get("/dashboard/stats", response_model=DashboardStats)
def get_dashboard_stats(
    start_date: date = Query(...),
    end_date: date = Query(...),
    compare_start_date: Optional[date] = None,
    compare_end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id)
):
    """Get high-level dashboard statistics"""
    
    # Main period stats
    main_stats = db.execute(text("""
        SELECT 
            COUNT(*) as total_incidents,
            MODE() WITHIN GROUP (ORDER BY EXTRACT(hour FROM alarm_datetime)) as busiest_hour,
            MODE() WITHIN GROUP (ORDER BY EXTRACT(dow FROM alarm_datetime)) as busiest_dow,
            MODE() WITHIN GROUP (ORDER BY incident_type) as most_common_type
        FROM incidents
        WHERE tenant_id = :tenant_id
            AND alarm_datetime >= :start_date
            AND alarm_datetime < :end_date
    """), {
        'tenant_id': tenant_id,
        'start_date': start_date,
        'end_date': end_date
    }).fetchone()
    
    # Response time stats
    response_stats = db.execute(text("""
        SELECT 
            AVG(EXTRACT(EPOCH FROM (iu.arrived_datetime - i.alarm_datetime))/60) as avg_response_mins,
            COUNT(iu.id) as total_responses
        FROM incidents i
        JOIN incident_units iu ON i.id = iu.incident_id
        JOIN apparatus a ON iu.apparatus_id = a.id
        WHERE i.tenant_id = :tenant_id
            AND i.alarm_datetime >= :start_date
            AND i.alarm_datetime < :end_date
            AND iu.arrived_datetime IS NOT NULL
            AND a.counts_for_response_times = TRUE
    """), {
        'tenant_id': tenant_id,
        'start_date': start_date,
        'end_date': end_date
    }).fetchone()
    
    # Comparison period (if provided)
    incidents_change_pct = None
    response_time_change_pct = None
    
    if compare_start_date and compare_end_date:
        compare_stats = db.execute(text("""
            SELECT COUNT(*) as total_incidents
            FROM incidents
            WHERE tenant_id = :tenant_id
                AND alarm_datetime >= :start_date
                AND alarm_datetime < :end_date
        """), {
            'tenant_id': tenant_id,
            'start_date': compare_start_date,
            'end_date': compare_end_date
        }).fetchone()
        
        if compare_stats.total_incidents > 0:
            incidents_change_pct = round(
                ((main_stats.total_incidents - compare_stats.total_incidents) / 
                 compare_stats.total_incidents) * 100, 1
            )
        
        compare_response = db.execute(text("""
            SELECT AVG(EXTRACT(EPOCH FROM (iu.arrived_datetime - i.alarm_datetime))/60) as avg_response_mins
            FROM incidents i
            JOIN incident_units iu ON i.id = iu.incident_id
            JOIN apparatus a ON iu.apparatus_id = a.id
            WHERE i.tenant_id = :tenant_id
                AND i.alarm_datetime >= :start_date
                AND i.alarm_datetime < :end_date
                AND iu.arrived_datetime IS NOT NULL
                AND a.counts_for_response_times = TRUE
        """), {
            'tenant_id': tenant_id,
            'start_date': compare_start_date,
            'end_date': compare_end_date
        }).fetchone()
        
        if compare_response.avg_response_mins and response_stats.avg_response_mins:
            response_time_change_pct = round(
                ((response_stats.avg_response_mins - compare_response.avg_response_mins) / 
                 compare_response.avg_response_mins) * 100, 1
            )
    
    # Day name mapping
    day_names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    busiest_day = day_names[int(main_stats.busiest_dow)] if main_stats.busiest_dow is not None else None
    
    return DashboardStats(
        total_incidents=main_stats.total_incidents or 0,
        incidents_change_pct=incidents_change_pct,
        avg_response_time_mins=round(response_stats.avg_response_mins, 1) if response_stats.avg_response_mins else None,
        response_time_change_pct=response_time_change_pct,
        total_unit_responses=response_stats.total_responses or 0,
        busiest_hour=int(main_stats.busiest_hour) if main_stats.busiest_hour is not None else None,
        busiest_day=busiest_day,
        most_common_type=main_stats.most_common_type
    )


# ============================================================================
# PREDICTIONS
# ============================================================================

@router.get("/predictions", response_model=PredictionResult)
def get_incident_predictions(
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id)
):
    """Predict when the next incident is likely based on historical patterns"""
    
    # Get hourly distribution
    hourly = db.execute(text("""
        SELECT 
            EXTRACT(hour FROM alarm_datetime) as hour,
            COUNT(*) as count
        FROM incidents
        WHERE tenant_id = :tenant_id
            AND alarm_datetime >= NOW() - INTERVAL '2 years'
        GROUP BY EXTRACT(hour FROM alarm_datetime)
        ORDER BY count DESC
    """), {'tenant_id': tenant_id}).fetchall()
    
    # Get day of week distribution
    daily = db.execute(text("""
        SELECT 
            EXTRACT(dow FROM alarm_datetime) as dow,
            COUNT(*) as count
        FROM incidents
        WHERE tenant_id = :tenant_id
            AND alarm_datetime >= NOW() - INTERVAL '2 years'
        GROUP BY EXTRACT(dow FROM alarm_datetime)
        ORDER BY count DESC
    """), {'tenant_id': tenant_id}).fetchall()
    
    # Get monthly distribution (seasonality)
    monthly = db.execute(text("""
        SELECT 
            EXTRACT(month FROM alarm_datetime) as month,
            COUNT(*) as count
        FROM incidents
        WHERE tenant_id = :tenant_id
            AND alarm_datetime >= NOW() - INTERVAL '5 years'
        GROUP BY EXTRACT(month FROM alarm_datetime)
        ORDER BY month
    """), {'tenant_id': tenant_id}).fetchall()
    
    # Calculate probabilities
    total_hourly = sum(h.count for h in hourly)
    busiest_hour = int(hourly[0].hour) if hourly else 12
    busiest_hour_prob = round(hourly[0].count / total_hourly, 3) if hourly else 0
    
    # Determine current period probability
    current_hour = datetime.now().hour
    current_dow = datetime.now().weekday()  # 0=Monday in Python
    
    # Find the next likely busy period
    hour_probs = {int(h.hour): h.count / total_hourly for h in hourly}
    
    # Next 24 hours probability ranking
    next_24_hours = []
    for offset in range(24):
        check_hour = (current_hour + offset) % 24
        prob = hour_probs.get(check_hour, 0)
        next_24_hours.append({
            'hours_from_now': offset,
            'hour': check_hour,
            'probability': round(prob, 3)
        })
    
    # Sort by probability
    busiest_periods = sorted(next_24_hours, key=lambda x: x['probability'], reverse=True)[:5]
    
    # Seasonal patterns
    month_names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    seasonal = {
        month_names[int(m.month) - 1]: m.count for m in monthly
    }
    
    day_names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    day_pattern = {
        day_names[int(d.dow)]: d.count for d in daily
    }
    
    return PredictionResult(
        next_likely_hour=busiest_hour,
        probability=busiest_hour_prob,
        busiest_periods=busiest_periods,
        seasonal_patterns={
            'by_month': seasonal,
            'by_day': day_pattern
        }
    )


# ============================================================================
# DATA QUALITY / OUTLIERS
# ============================================================================

@router.post("/data-quality/scan")
def scan_for_outliers(
    request: OutlierScanRequest,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
    current_user: Personnel = Depends(get_current_user)
):
    """Scan incidents for data quality issues and outliers"""
    
    end_date = request.end_date or date.today()
    start_date = request.start_date or (end_date - timedelta(days=365))
    
    issues_found = []
    
    # 1. Response time outliers (> 3 std deviations)
    stats = db.execute(text("""
        SELECT 
            AVG(EXTRACT(EPOCH FROM (iu.arrived_datetime - i.alarm_datetime))/60) as avg_mins,
            STDDEV(EXTRACT(EPOCH FROM (iu.arrived_datetime - i.alarm_datetime))/60) as std_mins
        FROM incidents i
        JOIN incident_units iu ON i.id = iu.incident_id
        JOIN apparatus a ON iu.apparatus_id = a.id
        WHERE i.tenant_id = :tenant_id
            AND i.alarm_datetime >= :start_date
            AND i.alarm_datetime < :end_date
            AND iu.arrived_datetime IS NOT NULL
            AND a.counts_for_response_times = TRUE
    """), {
        'tenant_id': tenant_id,
        'start_date': start_date,
        'end_date': end_date
    }).fetchone()
    
    if stats.avg_mins and stats.std_mins:
        threshold = stats.avg_mins + (3 * stats.std_mins)
        
        outliers = db.execute(text("""
            SELECT 
                i.id as incident_id,
                i.internal_incident_number,
                a.unit_designator,
                EXTRACT(EPOCH FROM (iu.arrived_datetime - i.alarm_datetime))/60 as response_mins
            FROM incidents i
            JOIN incident_units iu ON i.id = iu.incident_id
            JOIN apparatus a ON iu.apparatus_id = a.id
            WHERE i.tenant_id = :tenant_id
                AND i.alarm_datetime >= :start_date
                AND i.alarm_datetime < :end_date
                AND iu.arrived_datetime IS NOT NULL
                AND a.counts_for_response_times = TRUE
                AND EXTRACT(EPOCH FROM (iu.arrived_datetime - i.alarm_datetime))/60 > :threshold
        """), {
            'tenant_id': tenant_id,
            'start_date': start_date,
            'end_date': end_date,
            'threshold': threshold
        }).fetchall()
        
        for o in outliers:
            issue = DataQualityIssue(
                tenant_id=tenant_id,
                incident_id=o.incident_id,
                issue_type='response_time_outlier',
                severity='warning',
                field_name='response_time',
                current_value=f"{round(o.response_mins, 1)} mins ({o.unit_designator})",
                expected_range=f"< {round(threshold, 1)} mins (3σ)",
                description=f"Response time of {round(o.response_mins, 1)} mins for {o.unit_designator} exceeds 3 standard deviations",
                auto_detected=True
            )
            db.add(issue)
            issues_found.append(issue)
    
    # 2. Time sequence errors (arrived before dispatched, etc.)
    sequence_errors = db.execute(text("""
        SELECT 
            i.id as incident_id,
            i.internal_incident_number,
            a.unit_designator,
            iu.dispatch_datetime,
            iu.enroute_datetime,
            iu.arrived_datetime,
            CASE 
                WHEN iu.enroute_datetime < iu.dispatch_datetime THEN 'enroute_before_dispatch'
                WHEN iu.arrived_datetime < iu.enroute_datetime THEN 'arrived_before_enroute'
                WHEN iu.arrived_datetime < iu.dispatch_datetime THEN 'arrived_before_dispatch'
            END as error_type
        FROM incidents i
        JOIN incident_units iu ON i.id = iu.incident_id
        JOIN apparatus a ON iu.apparatus_id = a.id
        WHERE i.tenant_id = :tenant_id
            AND i.alarm_datetime >= :start_date
            AND i.alarm_datetime < :end_date
            AND (
                (iu.enroute_datetime IS NOT NULL AND iu.enroute_datetime < iu.dispatch_datetime)
                OR (iu.arrived_datetime IS NOT NULL AND iu.arrived_datetime < iu.enroute_datetime)
                OR (iu.arrived_datetime IS NOT NULL AND iu.arrived_datetime < iu.dispatch_datetime)
            )
    """), {
        'tenant_id': tenant_id,
        'start_date': start_date,
        'end_date': end_date
    }).fetchall()
    
    for err in sequence_errors:
        issue = DataQualityIssue(
            tenant_id=tenant_id,
            incident_id=err.incident_id,
            issue_type='time_sequence_error',
            severity='error',
            field_name=err.error_type,
            current_value=f"Unit: {err.unit_designator}",
            description=f"Time sequence error: {err.error_type.replace('_', ' ')} for {err.unit_designator}",
            auto_detected=True
        )
        db.add(issue)
        issues_found.append(issue)
    
    # 3. Extremely fast response times (possibly errors)
    too_fast = db.execute(text("""
        SELECT 
            i.id as incident_id,
            i.internal_incident_number,
            a.unit_designator,
            EXTRACT(EPOCH FROM (iu.arrived_datetime - i.alarm_datetime))/60 as response_mins
        FROM incidents i
        JOIN incident_units iu ON i.id = iu.incident_id
        JOIN apparatus a ON iu.apparatus_id = a.id
        WHERE i.tenant_id = :tenant_id
            AND i.alarm_datetime >= :start_date
            AND i.alarm_datetime < :end_date
            AND iu.arrived_datetime IS NOT NULL
            AND EXTRACT(EPOCH FROM (iu.arrived_datetime - i.alarm_datetime))/60 < 0.5
    """), {
        'tenant_id': tenant_id,
        'start_date': start_date,
        'end_date': end_date
    }).fetchall()
    
    for tf in too_fast:
        issue = DataQualityIssue(
            tenant_id=tenant_id,
            incident_id=tf.incident_id,
            issue_type='suspiciously_fast_response',
            severity='warning',
            field_name='response_time',
            current_value=f"{round(tf.response_mins * 60, 1)} seconds ({tf.unit_designator})",
            expected_range="> 30 seconds",
            description=f"Response time under 30 seconds for {tf.unit_designator} - possibly a data error",
            auto_detected=True
        )
        db.add(issue)
        issues_found.append(issue)
    
    db.commit()
    
    return {
        "issues_found": len(issues_found),
        "scan_period": f"{start_date} to {end_date}",
        "issue_types": {
            "response_time_outlier": sum(1 for i in issues_found if i.issue_type == 'response_time_outlier'),
            "time_sequence_error": sum(1 for i in issues_found if i.issue_type == 'time_sequence_error'),
            "suspiciously_fast_response": sum(1 for i in issues_found if i.issue_type == 'suspiciously_fast_response')
        }
    }


@router.get("/data-quality/issues", response_model=DataQualitySummary)
def get_data_quality_issues(
    include_resolved: bool = False,
    limit: int = 50,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id)
):
    """Get data quality issues for this tenant"""
    
    query = db.query(DataQualityIssue).filter(
        DataQualityIssue.tenant_id == tenant_id
    )
    
    if not include_resolved:
        query = query.filter(DataQualityIssue.resolved_at.is_(None))
    
    issues = query.order_by(
        DataQualityIssue.severity.desc(),
        DataQualityIssue.detected_at.desc()
    ).limit(limit).all()
    
    # Get summary counts
    total = db.query(func.count(DataQualityIssue.id)).filter(
        DataQualityIssue.tenant_id == tenant_id
    ).scalar()
    
    unresolved = db.query(func.count(DataQualityIssue.id)).filter(
        DataQualityIssue.tenant_id == tenant_id,
        DataQualityIssue.resolved_at.is_(None)
    ).scalar()
    
    # By severity
    severity_counts = db.query(
        DataQualityIssue.severity,
        func.count(DataQualityIssue.id)
    ).filter(
        DataQualityIssue.tenant_id == tenant_id,
        DataQualityIssue.resolved_at.is_(None)
    ).group_by(DataQualityIssue.severity).all()
    
    # By type
    type_counts = db.query(
        DataQualityIssue.issue_type,
        func.count(DataQualityIssue.id)
    ).filter(
        DataQualityIssue.tenant_id == tenant_id,
        DataQualityIssue.resolved_at.is_(None)
    ).group_by(DataQualityIssue.issue_type).all()
    
    # Build response
    recent = []
    for issue in issues:
        incident = db.query(Incident).filter(Incident.id == issue.incident_id).first()
        resolver = None
        if issue.resolved_by:
            resolver_person = db.query(Personnel).filter(Personnel.id == issue.resolved_by).first()
            resolver = f"{resolver_person.first_name} {resolver_person.last_name}" if resolver_person else None
        
        recent.append(DataQualityIssueResponse(
            id=issue.id,
            incident_id=issue.incident_id,
            internal_incident_number=incident.internal_incident_number if incident else None,
            issue_type=issue.issue_type,
            severity=issue.severity,
            field_name=issue.field_name,
            current_value=issue.current_value,
            expected_range=issue.expected_range,
            description=issue.description,
            detected_at=issue.detected_at,
            resolved_at=issue.resolved_at,
            resolved_by_name=resolver
        ))
    
    return DataQualitySummary(
        total_issues=total,
        unresolved_issues=unresolved,
        by_severity={s: c for s, c in severity_counts},
        by_type={t: c for t, c in type_counts},
        recent_issues=recent
    )


@router.post("/data-quality/issues/{issue_id}/resolve")
def resolve_data_quality_issue(
    issue_id: int,
    request: DataQualityResolveRequest,
    db: Session = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
    current_user: Personnel = Depends(get_current_user)
):
    """Mark a data quality issue as resolved"""
    
    issue = db.query(DataQualityIssue).filter(
        DataQualityIssue.id == issue_id,
        DataQualityIssue.tenant_id == tenant_id
    ).first()
    
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    
    issue.resolved_at = datetime.utcnow()
    issue.resolved_by = current_user.id
    issue.resolution_notes = request.resolution_notes
    
    db.commit()
    
    return {"message": "Issue resolved", "issue_id": issue_id}
