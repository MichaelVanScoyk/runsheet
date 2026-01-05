"""
Analytics Schemas (Pydantic) for CADReport
Add these to your existing schemas.py or create a new schemas_analytics.py
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Any, Dict
from datetime import datetime, date
from enum import Enum


class QueryType(str, Enum):
    NATURAL_LANGUAGE = "natural_language"
    SAVED = "saved"
    SYSTEM = "system"


class ResultType(str, Enum):
    TABLE = "table"
    CHART = "chart"
    SINGLE_VALUE = "single_value"


class ChartType(str, Enum):
    BAR = "bar"
    LINE = "line"
    PIE = "pie"
    AREA = "area"
    MULTI_LINE = "multiLine"


class Severity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


# ============================================================================
# Query Execution
# ============================================================================

class NaturalLanguageQueryRequest(BaseModel):
    """Request to execute a natural language query"""
    question: str = Field(..., min_length=5, max_length=500)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    save_query: bool = False
    query_name: Optional[str] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "question": "What are our busiest hours for incidents?",
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
                "save_query": False
            }
        }


class SavedQueryExecuteRequest(BaseModel):
    """Request to execute a saved query"""
    query_id: int
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    parameters: Optional[Dict[str, Any]] = None


class QueryResult(BaseModel):
    """Result from executing any query"""
    success: bool
    query_type: QueryType
    result_type: ResultType
    data: List[Dict[str, Any]]
    row_count: int
    execution_time_ms: int
    natural_language: Optional[str] = None
    generated_sql: Optional[str] = None
    chart_config: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    queries_remaining_today: Optional[int] = None
    saved_query_id: Optional[int] = None


# ============================================================================
# Saved Queries
# ============================================================================

class SavedQueryCreate(BaseModel):
    """Create a new saved query"""
    name: str = Field(..., min_length=3, max_length=255)
    description: Optional[str] = None
    natural_language: str
    generated_sql: str
    result_type: ResultType = ResultType.TABLE
    chart_config: Optional[Dict[str, Any]] = None
    is_shared: bool = False


class SavedQueryUpdate(BaseModel):
    """Update a saved query"""
    name: Optional[str] = None
    description: Optional[str] = None
    is_shared: Optional[bool] = None
    chart_config: Optional[Dict[str, Any]] = None


class SavedQueryResponse(BaseModel):
    """Response for saved query"""
    id: int
    name: str
    description: Optional[str]
    natural_language: str
    result_type: ResultType
    chart_config: Optional[Dict[str, Any]]
    is_shared: bool
    is_system: bool
    use_count: int
    last_used_at: Optional[datetime]
    created_at: datetime
    created_by_name: Optional[str] = None
    
    class Config:
        from_attributes = True


# ============================================================================
# Rate Limiting
# ============================================================================

class QueryUsageStatus(BaseModel):
    """Current query usage status for tenant"""
    queries_used_today: int
    queries_remaining_today: int
    daily_limit: int
    reset_time: str  # When the count resets


# ============================================================================
# Data Quality
# ============================================================================

class DataQualityIssueResponse(BaseModel):
    """Data quality issue"""
    id: int
    incident_id: int
    internal_incident_number: Optional[str]
    issue_type: str
    severity: Severity
    field_name: Optional[str]
    current_value: Optional[str]
    expected_range: Optional[str]
    description: str
    detected_at: datetime
    resolved_at: Optional[datetime]
    resolved_by_name: Optional[str]
    
    class Config:
        from_attributes = True


class DataQualityResolveRequest(BaseModel):
    """Resolve a data quality issue"""
    resolution_notes: Optional[str] = None


class DataQualitySummary(BaseModel):
    """Summary of data quality issues"""
    total_issues: int
    unresolved_issues: int
    by_severity: Dict[str, int]
    by_type: Dict[str, int]
    recent_issues: List[DataQualityIssueResponse]


# ============================================================================
# Analytics Dashboard
# ============================================================================

class DateRangeRequest(BaseModel):
    """Standard date range for analytics"""
    start_date: date
    end_date: date
    compare_start_date: Optional[date] = None  # For comparison
    compare_end_date: Optional[date] = None


class DashboardStats(BaseModel):
    """High-level dashboard statistics"""
    total_incidents: int
    incidents_change_pct: Optional[float]  # vs comparison period
    avg_response_time_mins: Optional[float]
    response_time_change_pct: Optional[float]
    total_unit_responses: int
    busiest_hour: Optional[int]
    busiest_day: Optional[str]
    most_common_type: Optional[str]


class TrendDataPoint(BaseModel):
    """Single data point in a trend"""
    label: str
    value: float
    comparison_value: Optional[float] = None


class TrendData(BaseModel):
    """Trend data for charts"""
    title: str
    chart_type: ChartType
    data: List[TrendDataPoint]
    x_label: Optional[str] = None
    y_label: Optional[str] = None


class PredictionResult(BaseModel):
    """Incident prediction result"""
    next_likely_hour: int
    probability: float
    busiest_periods: List[Dict[str, Any]]
    seasonal_patterns: Dict[str, Any]
    model_accuracy: Optional[float] = None


# ============================================================================
# Outlier Detection
# ============================================================================

class OutlierScanRequest(BaseModel):
    """Request to scan for outliers"""
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    include_resolved: bool = False


class OutlierConfig(BaseModel):
    """Configuration for outlier detection"""
    response_time_std_threshold: float = 3.0  # Standard deviations
    min_response_time_mins: float = 0.5
    max_response_time_mins: float = 60.0
    check_time_sequences: bool = True  # arrived before dispatched, etc.
    check_missing_data: bool = True
