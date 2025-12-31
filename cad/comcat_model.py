"""
ComCat ML Model - Random Forest Comment Categorizer
Created: 2025-12-31
Updated: 2025-12-31 - v2.0: Added operator_type as ML feature

Uses scikit-learn Random Forest with combined features:
- TF-IDF for text (unigrams + bigrams)  
- One-hot encoded operator_type (CALLTAKER, DISPATCHER, UNIT, SYSTEM, UNKNOWN)

The model learns from both the comment text AND who entered it,
allowing it to naturally learn patterns like "calltaker comments 
tend to be caller info" without hardcoded rules.

Usage:
    from cad.comcat_model import ComCatModel
    
    model = ComCatModel()
    model.load()
    
    category, confidence = model.predict("HOUSE ON FIRE", "CALLTAKER")
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
    from sklearn.preprocessing import OneHotEncoder
    from sklearn.compose import ColumnTransformer
    from sklearn.base import BaseEstimator, TransformerMixin
    import numpy as np
    from scipy.sparse import hstack
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

from .comcat_seeds import get_seed_data_v2, VALID_CATEGORIES, CATEGORY_INFO, VALID_OPERATOR_TYPES

logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION
# =============================================================================

# Model file location
MODEL_DIR = Path("/opt/runsheet/data")
MODEL_FILE = MODEL_DIR / "comcat_model_v2.pkl"  # New filename for v2

# Confidence threshold for flagging review
CONFIDENCE_THRESHOLD = 0.50

# Minimum training examples required
MIN_TRAINING_EXAMPLES = 50

# Model hyperparameters
TFIDF_PARAMS = {
    "ngram_range": (1, 2),
    "max_features": 500,
    "stop_words": "english",
    "lowercase": True,
    "strip_accents": "ascii",
}

RF_PARAMS = {
    "n_estimators": 100,
    "max_depth": 15,
    "min_samples_split": 2,
    "min_samples_leaf": 1,
    "random_state": 42,
    "n_jobs": -1,
}


# =============================================================================
# CUSTOM TRANSFORMER FOR COMBINED FEATURES
# =============================================================================

class ComCatFeaturizer:
    """
    Combines TF-IDF text features with one-hot encoded operator_type.
    
    Input: List of (text, operator_type) tuples
    Output: Sparse matrix of combined features
    """
    
    def __init__(self):
        self.tfidf = TfidfVectorizer(**TFIDF_PARAMS)
        self.operator_types = VALID_OPERATOR_TYPES
        self._fitted = False
    
    def fit(self, X, y=None):
        """Fit the TF-IDF vectorizer on texts."""
        texts = [x[0] for x in X]
        self.tfidf.fit(texts)
        self._fitted = True
        return self
    
    def transform(self, X):
        """Transform (text, operator_type) pairs to feature matrix."""
        if not self._fitted:
            raise RuntimeError("Featurizer not fitted")
        
        texts = [x[0] for x in X]
        operator_types = [x[1] for x in X]
        
        # TF-IDF features
        text_features = self.tfidf.transform(texts)
        
        # One-hot encode operator_type
        # Shape: (n_samples, n_operator_types)
        operator_features = np.zeros((len(X), len(self.operator_types)))
        for i, op_type in enumerate(operator_types):
            if op_type in self.operator_types:
                idx = self.operator_types.index(op_type)
                operator_features[i, idx] = 1.0
            else:
                # Unknown operator type - use UNKNOWN index
                idx = self.operator_types.index("UNKNOWN")
                operator_features[i, idx] = 1.0
        
        # Combine sparse text features with dense operator features
        combined = hstack([text_features, operator_features])
        return combined
    
    def fit_transform(self, X, y=None):
        self.fit(X, y)
        return self.transform(X)
    
    def get_feature_names_out(self):
        """Get feature names for interpretation."""
        text_names = list(self.tfidf.get_feature_names_out())
        operator_names = [f"op_{t}" for t in self.operator_types]
        return text_names + operator_names


# =============================================================================
# MODEL CLASS
# =============================================================================

class ComCatModel:
    """
    Random Forest comment categorizer with text + operator_type features.
    
    v2.0: Now considers WHO entered the comment (calltaker, dispatcher, unit)
    alongside WHAT they wrote, learning patterns naturally from corrections.
    """
    
    def __init__(self, model_path: Optional[Path] = None):
        self.model_path = model_path or MODEL_FILE
        self.featurizer: Optional[ComCatFeaturizer] = None
        self.classifier: Optional[RandomForestClassifier] = None
        self.is_trained = False
        self.training_stats: Dict[str, Any] = {}
        self.model_version = "2.0"
        
        if not SKLEARN_AVAILABLE:
            logger.warning("scikit-learn not available - ML features disabled")
    
    def train(self, examples: List[Tuple[str, str, str]], 
              include_seeds: bool = True) -> Dict[str, Any]:
        """
        Train the model on provided examples.
        
        Args:
            examples: List of (text, operator_type, category) tuples
            include_seeds: Whether to include seed examples (default: True)
            
        Returns:
            Training statistics dictionary
        """
        if not SKLEARN_AVAILABLE:
            return {"error": "scikit-learn not available"}
        
        # Combine with seed data if requested
        if include_seeds:
            seed_examples = get_seed_data_v2()
            all_examples = list(seed_examples) + list(examples)
        else:
            all_examples = list(examples)
        
        # Validate categories
        categories = [ex[2] for ex in all_examples]
        invalid = [c for c in categories if c not in VALID_CATEGORIES]
        if invalid:
            raise ValueError(f"Invalid categories: {set(invalid)}")
        
        # Check minimum examples
        if len(all_examples) < MIN_TRAINING_EXAMPLES:
            logger.warning(f"Only {len(all_examples)} examples - model may underperform")
        
        # Prepare data
        X = [(ex[0], ex[1]) for ex in all_examples]  # (text, operator_type)
        y = [ex[2] for ex in all_examples]  # category
        
        # Create and fit featurizer
        self.featurizer = ComCatFeaturizer()
        X_features = self.featurizer.fit_transform(X)
        
        # Train classifier
        self.classifier = RandomForestClassifier(**RF_PARAMS)
        self.classifier.fit(X_features, y)
        self.is_trained = True
        
        # Calculate training stats
        category_counts = {}
        operator_counts = {}
        for ex in all_examples:
            cat = ex[2]
            op = ex[1]
            category_counts[cat] = category_counts.get(cat, 0) + 1
            operator_counts[op] = operator_counts.get(op, 0) + 1
        
        # Cross-validation score
        cv_score = None
        if len(all_examples) >= 20:
            try:
                scores = cross_val_score(
                    self.classifier, X_features, y, cv=5, scoring='accuracy'
                )
                cv_score = float(np.mean(scores))
            except Exception as e:
                logger.warning(f"Cross-validation failed: {e}")
        
        seed_count = len(seed_examples) if include_seeds else 0
        
        self.training_stats = {
            "total_examples": len(all_examples),
            "seed_examples": seed_count,
            "officer_examples": len(examples),
            "category_counts": category_counts,
            "operator_counts": operator_counts,
            "cv_accuracy": cv_score,
            "trained_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
            "model_version": self.model_version,
        }
        
        logger.info(f"Model v{self.model_version} trained on {len(all_examples)} examples (CV: {cv_score})")
        
        return self.training_stats
    
    def train_from_seeds(self) -> Dict[str, Any]:
        """Train using only seed examples."""
        return self.train([], include_seeds=True)
    
    def predict(self, text: str, operator_type: str = "UNKNOWN") -> Tuple[Optional[str], float]:
        """
        Predict category for a comment.
        
        Args:
            text: Comment text
            operator_type: Who entered it (CALLTAKER, DISPATCHER, UNIT, SYSTEM, UNKNOWN)
            
        Returns:
            Tuple of (category, confidence)
        """
        if not self.is_trained or self.featurizer is None or self.classifier is None:
            return None, 0.0
        
        if not SKLEARN_AVAILABLE:
            return None, 0.0
        
        try:
            X = [(text, operator_type)]
            X_features = self.featurizer.transform(X)
            
            proba = self.classifier.predict_proba(X_features)[0]
            max_idx = np.argmax(proba)
            category = self.classifier.classes_[max_idx]
            confidence = float(proba[max_idx])
            
            return category, confidence
            
        except Exception as e:
            logger.error(f"Prediction failed: {e}")
            return None, 0.0
    
    def predict_batch(self, items: List[Tuple[str, str]]) -> List[Tuple[str, float]]:
        """
        Predict categories for multiple comments.
        
        Args:
            items: List of (text, operator_type) tuples
            
        Returns:
            List of (category, confidence) tuples
        """
        if not self.is_trained or self.featurizer is None or self.classifier is None:
            return [(None, 0.0) for _ in items]
        
        if not SKLEARN_AVAILABLE:
            return [(None, 0.0) for _ in items]
        
        try:
            X_features = self.featurizer.transform(items)
            probas = self.classifier.predict_proba(X_features)
            
            results = []
            for proba in probas:
                max_idx = np.argmax(proba)
                category = self.classifier.classes_[max_idx]
                confidence = float(proba[max_idx])
                results.append((category, confidence))
            
            return results
            
        except Exception as e:
            logger.error(f"Batch prediction failed: {e}")
            return [(None, 0.0) for _ in items]
    
    def needs_review(self, confidence: float) -> bool:
        """Check if prediction needs officer review."""
        return confidence < CONFIDENCE_THRESHOLD
    
    def save(self, path: Optional[Path] = None) -> bool:
        """Save model to disk."""
        if not self.is_trained:
            logger.warning("No trained model to save")
            return False
        
        save_path = path or self.model_path
        
        try:
            save_path.parent.mkdir(parents=True, exist_ok=True)
            
            save_data = {
                "featurizer": self.featurizer,
                "classifier": self.classifier,
                "training_stats": self.training_stats,
                "version": self.model_version,
            }
            
            with open(save_path, 'wb') as f:
                pickle.dump(save_data, f)
            
            logger.info(f"Model v{self.model_version} saved to {save_path}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to save model: {e}")
            return False
    
    def load(self, path: Optional[Path] = None) -> bool:
        """Load model from disk, or train from seeds if none exists."""
        load_path = path or self.model_path
        
        if load_path.exists():
            try:
                with open(load_path, 'rb') as f:
                    save_data = pickle.load(f)
                
                self.featurizer = save_data.get("featurizer")
                self.classifier = save_data.get("classifier")
                self.training_stats = save_data.get("training_stats", {})
                self.model_version = save_data.get("version", "1.0")
                self.is_trained = self.featurizer is not None and self.classifier is not None
                
                logger.info(f"Model v{self.model_version} loaded from {load_path}")
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
    
    def get_feature_importance(self, top_n: int = 20) -> Dict[str, Any]:
        """Get feature importances for model interpretation."""
        if not self.is_trained or self.classifier is None or self.featurizer is None:
            return {}
        
        try:
            feature_names = self.featurizer.get_feature_names_out()
            importances = self.classifier.feature_importances_
            
            # Get top features
            top_indices = np.argsort(importances)[-top_n:][::-1]
            top_features = [
                (feature_names[i], float(importances[i]))
                for i in top_indices
            ]
            
            # Separate text vs operator features
            text_features = [(n, i) for n, i in top_features if not n.startswith("op_")]
            operator_features = [(n, i) for n, i in top_features if n.startswith("op_")]
            
            return {
                "top_overall": top_features,
                "top_text": text_features,
                "operator_importance": operator_features,
            }
            
        except Exception as e:
            logger.error(f"Failed to get feature importance: {e}")
            return {}


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

_model_instance: Optional[ComCatModel] = None


def get_model() -> ComCatModel:
    """Get singleton model instance."""
    global _model_instance
    
    if _model_instance is None:
        _model_instance = ComCatModel()
        _model_instance.load()
    
    return _model_instance


def predict_category(text: str, operator_type: str = "UNKNOWN") -> Tuple[Optional[str], float]:
    """Convenience function for single prediction."""
    model = get_model()
    return model.predict(text, operator_type)


def retrain_model(officer_examples: List[Tuple[str, str, str]]) -> Dict[str, Any]:
    """
    Retrain model with officer corrections.
    
    Args:
        officer_examples: List of (text, operator_type, category) tuples
        
    Returns:
        Training statistics
    """
    global _model_instance
    
    if _model_instance is None:
        _model_instance = ComCatModel()
    
    stats = _model_instance.train(officer_examples, include_seeds=True)
    _model_instance.save()
    
    return stats


# =============================================================================
# CLI INTERFACE
# =============================================================================

if __name__ == "__main__":
    import sys
    
    print("ComCat ML Model v2.0 - With Operator Type Features")
    print("=" * 55)
    
    if not SKLEARN_AVAILABLE:
        print("ERROR: scikit-learn not installed")
        sys.exit(1)
    
    model = ComCatModel()
    print("\nTraining from seed data...")
    stats = model.train_from_seeds()
    
    print(f"\nTraining complete:")
    print(f"  Total examples: {stats['total_examples']}")
    print(f"  CV Accuracy: {stats.get('cv_accuracy', 'N/A')}")
    print(f"\nCategory distribution:")
    for cat, count in stats['category_counts'].items():
        print(f"  {cat}: {count}")
    print(f"\nOperator distribution:")
    for op, count in stats.get('operator_counts', {}).items():
        print(f"  {op}: {count}")
    
    # Test predictions with different operator types
    test_cases = [
        ("HOUSE ON FIRE", "CALLTAKER"),
        ("HOUSE ON FIRE", "DISPATCHER"),
        ("PPL INCIDENT #123456", "DISPATCHER"),
        ("PPL INCIDENT #123456", "CALLTAKER"),
        ("Enroute with a crew of 4", "UNIT"),
        ("Command Established", "DISPATCHER"),
        ("HYDRANT SECURED", "DISPATCHER"),
    ]
    
    print("\nTest predictions (same text, different operator):")
    print("-" * 55)
    for text, op_type in test_cases:
        category, confidence = model.predict(text, op_type)
        flag = " ⚠️" if model.needs_review(confidence) else ""
        print(f"  [{op_type:10}] '{text[:35]}'")
        print(f"    -> {category} ({confidence:.1%}){flag}")
    
    # Feature importance
    print("\nFeature importance:")
    importance = model.get_feature_importance(10)
    if importance.get("operator_importance"):
        print("  Operator type features:")
        for name, imp in importance["operator_importance"]:
            print(f"    {name}: {imp:.4f}")
    
    if model.save():
        print(f"\nModel saved to {model.model_path}")
