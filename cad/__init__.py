"""
CAD Processing Package for RunSheet

This package handles:
- CAD message parsing (dispatch/clear reports)
- TCP listener for real-time CAD data
- Comment processing and categorization (ComCat)
- ML-based comment classification

Modules:
- cad_parser: Parse Chester County CAD HTML messages
- cad_listener: TCP listener for real-time CAD data
- comment_processor: Process and categorize event comments
- comcat_model: ML model for comment categorization
- comcat_seeds: Seed training data for ML bootstrap
"""

from .comment_processor import (
    process_cad_clear,
    process_clear_report_comments,
    get_filtered_comments,
    get_comments_by_category,
    get_comments_needing_review,
    get_pending_timestamp_mappings,
    get_high_confidence_suggestions,
    get_training_data_from_comments,
    CommentProcessor,
    ParsedComment,
    DetectedTimestamp,
    UnitCrewCount,
    ProcessedComments,
)

__version__ = "2.0.0"
__all__ = [
    # Functions
    "process_cad_clear",
    "process_clear_report_comments",
    "get_filtered_comments",
    "get_comments_by_category",
    "get_comments_needing_review",
    "get_pending_timestamp_mappings",
    "get_high_confidence_suggestions",
    "get_training_data_from_comments",
    # Classes
    "CommentProcessor",
    "ParsedComment",
    "DetectedTimestamp",
    "UnitCrewCount",
    "ProcessedComments",
]
