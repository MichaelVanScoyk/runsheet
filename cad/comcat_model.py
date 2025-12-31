"""
ComCat ML Model - Random Forest Comment Categorizer
Created: 2025-12-31

Uses scikit-learn Random Forest with TF-IDF features to categorize
CAD event comments. The model is bootstrapped with seed examples and
continuously improved through officer corrections.

Architecture:
- TF-IDF vectorizer for text features (unigrams + bigrams)
- Random Forest classifier (100 trees)
- Model persisted as pickle file
- Retrainable with new data

Usage:
    from cad.comcat_model import ComCatModel
    
    model = ComCatModel()
    model.load()  # Load existing model or train from seeds
    
    category, confidence = model.predict("HOUSE ON FIRE")
    # -> ("CALLER", 0.92)
"""

import logging
from pathlib import Path
from typing import Tuple, Optional, List, Dict, Any
import pickle

# scikit-learn imports - will fail gracefully if not installed
try:
    from sklearn.pipeline import Pipeline
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import cross_val_score
    import numpy as np
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

from .comcat_seeds import get_seed_data, VALID_CATEGORIES, CATEGORY_INFO

logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION
# =============================================================================

# Model file location
MODEL_DIR = Path("/opt/runsheet/data")
MODEL_FILE = MODEL_DIR / "comcat_model.pkl"

# Confidence threshold for flagging review
# Comments below this confidence should be flagged for officer review
CONFIDENCE_THRESHOLD = 0.50

# Minimum training examples required before using ML
# Below this, fall back to pattern matching only
MIN_TRAINING_EXAMPLES = 50

# Model hyperparameters
TFIDF_PARAMS = {
    "ngram_range": (1, 2),      # Unigrams and bigrams
    "max_features": 500,        # Limit vocabulary size
    "stop_words": "english",    # Remove common words
    "lowercase": True,
    "strip_accents": "ascii",
}

RF_PARAMS = {
    "n_estimators": 100,        # Number of trees
    "max_depth": 15,            # Limit tree depth to prevent overfitting
    "min_samples_split": 2,
    "min_samples_leaf": 1,
    "random_state": 42,         # Reproducible results
    "n_jobs": -1,               # Use all CPU cores
}


# =============================================================================
# MODEL CLASS
# =============================================================================

class ComCatModel:
    """
    Random Forest-based comment categorizer with TF-IDF features.
    
    The model can be trained on seed data immediately, then improved
    over time as officers correct categorizations.
    """
    
    def __init__(self, model_path: Optional[Path] = None):
        """
        Initialize the model.
        
        Args:
            model_path: Custom path for model file (default: /opt/runsheet/data/comcat_model.pkl)
        """
        self.model_path = model_path or MODEL_FILE
        self.pipeline: Optional[Pipeline] = None
        self.is_trained = False
        self.training_stats: Dict[str, Any] = {}
        
        if not SKLEARN_AVAILABLE:
            logger.warning("scikit-learn not available - ML features disabled")
    
    def _create_pipeline(self) -> Pipeline:
        """Create a fresh sklearn pipeline."""
        if not SKLEARN_AVAILABLE:
            raise RuntimeError("scikit-learn is required for ML features")
        
        return Pipeline([
            ('tfidf', TfidfVectorizer(**TFIDF_PARAMS)),
            ('clf', RandomForestClassifier(**RF_PARAMS))
        ])
    
    def train(self, texts: List[str], categories: List[str], 
              include_seeds: bool = True) -> Dict[str, Any]:
        """
        Train the model on provided examples.
        
        Args:
            texts: List of comment texts
            categories: List of category labels (must match texts length)
            include_seeds: Whether to include seed examples (default: True)
            
        Returns:
            Training statistics dictionary
        """
        if not SKLEARN_AVAILABLE:
            return {"error": "scikit-learn not available"}
        
        # Validate inputs
        if len(texts) != len(categories):
            raise ValueError(f"texts ({len(texts)}) and categories ({len(categories)}) must match")
        
        # Combine with seed data if requested
        if include_seeds:
            seed_texts, seed_categories = get_seed_data()
            all_texts = list(seed_texts) + list(texts)
            all_categories = list(seed_categories) + list(categories)
        else:
            all_texts = list(texts)
            all_categories = list(categories)
        
        # Validate categories
        invalid = [c for c in all_categories if c not in VALID_CATEGORIES]
        if invalid:
            raise ValueError(f"Invalid categories: {set(invalid)}")
        
        # Check minimum examples
        if len(all_texts) < MIN_TRAINING_EXAMPLES:
            logger.warning(f"Only {len(all_texts)} examples - model may underperform")
        
        # Create and train pipeline
        self.pipeline = self._create_pipeline()
        self.pipeline.fit(all_texts, all_categories)
        self.is_trained = True
        
        # Calculate training stats
        category_counts = {}
        for cat in all_categories:
            category_counts[cat] = category_counts.get(cat, 0) + 1
        
        # Cross-validation score (if enough examples)
        cv_score = None
        if len(all_texts) >= 20:
            try:
                scores = cross_val_score(self.pipeline, all_texts, all_categories, cv=5)
                cv_score = float(np.mean(scores))
            except Exception as e:
                logger.warning(f"Cross-validation failed: {e}")
        
        self.training_stats = {
            "total_examples": len(all_texts),
            "seed_examples": len(seed_texts) if include_seeds else 0,
            "officer_examples": len(texts),
            "category_counts": category_counts,
            "cv_accuracy": cv_score,
            "trained_at": __import__("datetime").datetime.utcnow().isoformat() + "Z"
        }
        
        logger.info(f"Model trained on {len(all_texts)} examples (CV accuracy: {cv_score})")
        
        return self.training_stats
    
    def train_from_seeds(self) -> Dict[str, Any]:
        """
        Train the model using only seed examples.
        Call this to bootstrap the model before any officer corrections exist.
        
        Returns:
            Training statistics dictionary
        """
        return self.train([], [], include_seeds=True)
    
    def predict(self, text: str) -> Tuple[Optional[str], float]:
        """
        Predict category for a single comment.
        
        Args:
            text: Comment text to categorize
            
        Returns:
            Tuple of (category, confidence) or (None, 0.0) if model not trained
        """
        if not self.is_trained or self.pipeline is None:
            return None, 0.0
        
        if not SKLEARN_AVAILABLE:
            return None, 0.0
        
        try:
            # Get probability distribution
            proba = self.pipeline.predict_proba([text])[0]
            
            # Find highest probability class
            max_idx = np.argmax(proba)
            category = self.pipeline.classes_[max_idx]
            confidence = float(proba[max_idx])
            
            return category, confidence
            
        except Exception as e:
            logger.error(f"Prediction failed: {e}")
            return None, 0.0
    
    def predict_batch(self, texts: List[str]) -> List[Tuple[str, float]]:
        """
        Predict categories for multiple comments.
        
        Args:
            texts: List of comment texts
            
        Returns:
            List of (category, confidence) tuples
        """
        if not self.is_trained or self.pipeline is None:
            return [(None, 0.0) for _ in texts]
        
        if not SKLEARN_AVAILABLE:
            return [(None, 0.0) for _ in texts]
        
        try:
            # Get all probabilities at once
            probas = self.pipeline.predict_proba(texts)
            
            results = []
            for proba in probas:
                max_idx = np.argmax(proba)
                category = self.pipeline.classes_[max_idx]
                confidence = float(proba[max_idx])
                results.append((category, confidence))
            
            return results
            
        except Exception as e:
            logger.error(f"Batch prediction failed: {e}")
            return [(None, 0.0) for _ in texts]
    
    def needs_review(self, confidence: float) -> bool:
        """
        Check if a prediction confidence warrants officer review.
        
        Args:
            confidence: Model confidence score (0.0-1.0)
            
        Returns:
            True if confidence is below threshold
        """
        return confidence < CONFIDENCE_THRESHOLD
    
    def save(self, path: Optional[Path] = None) -> bool:
        """
        Save the trained model to disk.
        
        Args:
            path: Optional custom path (default: configured model path)
            
        Returns:
            True if successful
        """
        if not self.is_trained or self.pipeline is None:
            logger.warning("No trained model to save")
            return False
        
        save_path = path or self.model_path
        
        try:
            # Ensure directory exists
            save_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Save model and stats
            save_data = {
                "pipeline": self.pipeline,
                "training_stats": self.training_stats,
                "version": "1.0"
            }
            
            with open(save_path, 'wb') as f:
                pickle.dump(save_data, f)
            
            logger.info(f"Model saved to {save_path}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to save model: {e}")
            return False
    
    def load(self, path: Optional[Path] = None) -> bool:
        """
        Load a trained model from disk.
        If no saved model exists, trains from seed data.
        
        Args:
            path: Optional custom path (default: configured model path)
            
        Returns:
            True if model is ready (loaded or trained from seeds)
        """
        load_path = path or self.model_path
        
        # Try to load existing model
        if load_path.exists():
            try:
                with open(load_path, 'rb') as f:
                    save_data = pickle.load(f)
                
                self.pipeline = save_data.get("pipeline")
                self.training_stats = save_data.get("training_stats", {})
                self.is_trained = self.pipeline is not None
                
                logger.info(f"Model loaded from {load_path}")
                return self.is_trained
                
            except Exception as e:
                logger.error(f"Failed to load model: {e}")
        
        # No saved model - train from seeds
        if SKLEARN_AVAILABLE:
            logger.info("No saved model found - training from seed data")
            self.train_from_seeds()
            self.save()
            return self.is_trained
        
        return False
    
    def get_feature_importance(self, top_n: int = 20) -> Dict[str, List[Tuple[str, float]]]:
        """
        Get most important features (words) for each category.
        Useful for understanding what the model learned.
        
        Args:
            top_n: Number of top features per category
            
        Returns:
            Dictionary of category -> [(word, importance), ...]
        """
        if not self.is_trained or self.pipeline is None:
            return {}
        
        if not SKLEARN_AVAILABLE:
            return {}
        
        try:
            vectorizer = self.pipeline.named_steps['tfidf']
            classifier = self.pipeline.named_steps['clf']
            
            feature_names = vectorizer.get_feature_names_out()
            
            # Random Forest doesn't have per-class importances,
            # but we can look at overall feature importance
            importances = classifier.feature_importances_
            
            # Get top features overall
            top_indices = np.argsort(importances)[-top_n:][::-1]
            top_features = [
                (feature_names[i], float(importances[i]))
                for i in top_indices
            ]
            
            return {"overall": top_features}
            
        except Exception as e:
            logger.error(f"Failed to get feature importance: {e}")
            return {}


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

# Global model instance - lazy loaded
_model_instance: Optional[ComCatModel] = None


def get_model() -> ComCatModel:
    """
    Get the singleton model instance.
    Loads/trains model on first access.
    
    Returns:
        ComCatModel instance ready for predictions
    """
    global _model_instance
    
    if _model_instance is None:
        _model_instance = ComCatModel()
        _model_instance.load()
    
    return _model_instance


def predict_category(text: str) -> Tuple[Optional[str], float]:
    """
    Convenience function to predict category for a comment.
    
    Args:
        text: Comment text
        
    Returns:
        Tuple of (category, confidence)
    """
    model = get_model()
    return model.predict(text)


def retrain_model(officer_examples: List[Tuple[str, str]]) -> Dict[str, Any]:
    """
    Retrain the model with new officer-corrected examples.
    
    Args:
        officer_examples: List of (text, category) tuples from officer corrections
        
    Returns:
        Training statistics
    """
    global _model_instance
    
    if _model_instance is None:
        _model_instance = ComCatModel()
    
    texts = [ex[0] for ex in officer_examples]
    categories = [ex[1] for ex in officer_examples]
    
    stats = _model_instance.train(texts, categories, include_seeds=True)
    _model_instance.save()
    
    return stats


# =============================================================================
# CLI INTERFACE
# =============================================================================

if __name__ == "__main__":
    import sys
    
    print("ComCat ML Model - Random Forest Comment Categorizer")
    print("=" * 50)
    
    if not SKLEARN_AVAILABLE:
        print("ERROR: scikit-learn not installed")
        print("Install with: pip install scikit-learn")
        sys.exit(1)
    
    # Train from seeds
    model = ComCatModel()
    print("\nTraining from seed data...")
    stats = model.train_from_seeds()
    
    print(f"\nTraining complete:")
    print(f"  Total examples: {stats['total_examples']}")
    print(f"  CV Accuracy: {stats.get('cv_accuracy', 'N/A')}")
    print(f"\nCategory distribution:")
    for cat, count in stats['category_counts'].items():
        print(f"  {cat}: {count}")
    
    # Test predictions
    test_comments = [
        "HOUSE ON FIRE",
        "Command Established for set Fire Incident Command Times",
        "HYDRANT SECURED",
        "Enroute with a crew of 4",
        "BELFOR ON SCENE",
        "CHECKING FOR EXTENSION",
        "SOMETHING RANDOM",
    ]
    
    print("\nTest predictions:")
    print("-" * 50)
    for comment in test_comments:
        category, confidence = model.predict(comment)
        flag = " ⚠️ REVIEW" if model.needs_review(confidence) else ""
        print(f"  '{comment[:40]}...'")
        print(f"    -> {category} ({confidence:.1%}){flag}")
    
    # Save model
    print("\nSaving model...")
    if model.save():
        print(f"  Saved to {model.model_path}")
    else:
        print("  Failed to save (check permissions)")
