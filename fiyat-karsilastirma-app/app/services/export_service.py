"""
Export service wrapper - DEPRECATED
This file redirects to the new export_service module.
For backward compatibility only.
"""
import warnings
import sys
from pathlib import Path

# Add deprecated path to sys.path for import
deprecated_path = Path(__file__).parent.parent.parent.parent / 'deprecated' / 'python'
if str(deprecated_path) not in sys.path:
    sys.path.insert(0, str(deprecated_path))

warnings.warn(
    "export_service.py is deprecated. Use export_service/__init__.py instead.",
    DeprecationWarning,
    stacklevel=2
)

# Import from deprecated location
try:
    from export_service import ExportService, ExportServiceFactory
except ImportError:
    # Fallback to new location if deprecated not found
    from .export_service import ExportService, ExportServiceFactory

__all__ = ['ExportService', 'ExportServiceFactory']

