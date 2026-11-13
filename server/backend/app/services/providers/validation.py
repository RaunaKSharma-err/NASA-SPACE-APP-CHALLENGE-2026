"""Resource-agnostic scientific data validation.

Validates datasets against observable properties without assuming any
particular file format, CRS, or NASA schema. All checks produce clear,
actionable error messages.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from app.services.providers.base import DatasetMetadata, ValidationCheck, ValidationResult


@dataclass
class ValidationRule:
    name: str
    enabled: bool = True


@dataclass
class ValidationConfig:
    check_format: bool = True
    check_crs_units: bool = True
    check_bounds: bool = True
    check_units: bool = True
    check_attribution: bool = True
    check_terrain_file: bool = True
    require_verified_status: bool = False


class ResourceValidator:
    """Validates DatasetMetadata resources. Stateless and reusable."""

    def __init__(self, config: Optional[ValidationConfig] = None):
        self.config = config or ValidationConfig()

    def validate(self, dataset: DatasetMetadata) -> ValidationResult:
        checks: dict[str, ValidationCheck] = {}
        errors: list[str] = []
        warnings: list[str] = []

        if self.config.check_format:
            checks["format"] = self._check_format(dataset)
            if not checks["format"].passed:
                errors.append(checks["format"].message)

        if self.config.check_crs_units:
            checks["crs_units"] = self._check_crs_units(dataset)
            if not checks["crs_units"].passed:
                errors.append(checks["crs_units"].message)
            # Projected CRS is valid but requires transformation — warn
            if checks["crs_units"].detail and checks["crs_units"].detail.get("crs_type") == "projected":
                warnings.append("CRS is projected — coordinate transformation required before use as lat/lon")

        if self.config.check_bounds:
            checks["bounds"] = self._check_bounds(dataset)
            if not checks["bounds"].passed:
                errors.append(checks["bounds"].message)

        if self.config.check_units:
            checks["units"] = self._check_units(dataset)
            if not checks["units"].passed:
                warnings.append(checks["units"].message)

        if self.config.check_attribution:
            checks["attribution"] = self._check_attribution(dataset)
            if not checks["attribution"].passed:
                warnings.append(checks["attribution"].message)

        if self.config.check_terrain_file:
            checks["terrain_file"] = self._check_terrain_file(dataset)
            if not checks["terrain_file"].passed:
                warnings.append(checks["terrain_file"].message)

        if self.config.require_verified_status:
            checks["status"] = ValidationCheck(
                passed=dataset.status == "verified",
                message=f"Status is '{dataset.status}'; 'verified' required",
            )
            if not checks["status"].passed:
                warnings.append(checks["status"].message)

        return ValidationResult(
            valid=len(errors) == 0,
            errors=tuple(errors),
            warnings=tuple(warnings),
            checks=checks,
        )

    # ------------------------------------------------------------------ rules

    def _check_format(self, dataset: DatasetMetadata) -> ValidationCheck:
        passed = bool(dataset.format and dataset.format.strip())
        return ValidationCheck(
            passed=passed,
            message=f"Format declared: {dataset.format}" if passed else "No format declared",
            detail=dataset.format,
        )

    def _check_crs_units(self, dataset: DatasetMetadata) -> ValidationCheck:
        # Classify CRS: geographic (degrees/radians) = coordinates are lat/lon;
        # projected (metres) = coordinates are map coordinates, NOT lat/lon.
        # Projected CRS is valid but requires transformation before use.
        # We never silently interpret projected coordinates as latitude/longitude.
        if dataset.crs_units == "degrees" or dataset.crs_units == "radians":
            crs_type = "geographic"
            transformation_required = False
            passed = True
            message = f"CRS is geographic ({dataset.crs_units}); coordinates are usable as lat/lon"
        elif dataset.crs_units == "metres":
            crs_type = "projected"
            transformation_required = True
            passed = True  # projected is valid, just needs transformation
            message = (
                f"CRS is projected ({dataset.crs_units}); coordinates are NOT lat/lon — "
                "coordinate transformation required before use"
            )
        else:
            crs_type = "unknown"
            transformation_required = False
            passed = True
            message = f"CRS units '{dataset.crs_units}' are unrecognized — treat with caution"

        return ValidationCheck(
            passed=passed,
            message=message,
            detail={"crs_type": crs_type, "transformation_required": transformation_required, "units": dataset.crs_units},
        )

    def _check_bounds(self, dataset: DatasetMetadata) -> ValidationCheck:
        passed = self._valid_bounds(dataset)
        return ValidationCheck(
            passed=passed,
            message=(
                "Bounds within valid lat/lon ranges"
                if passed
                else f"Invalid bounds: lon [{dataset.lon_min}, {dataset.lon_max}], "
                f"lat [{dataset.lat_min}, {dataset.lat_max}]"
            ),
            detail={
                "lon_min": dataset.lon_min,
                "lon_max": dataset.lon_max,
                "lat_min": dataset.lat_min,
                "lat_max": dataset.lat_max,
            },
        )

    def _check_units(self, dataset: DatasetMetadata) -> ValidationCheck:
        passed = bool(dataset.value_unit and dataset.value_unit.strip())
        return ValidationCheck(
            passed=passed,
            message=f"Units: {dataset.value_unit}" if passed else "No measurement units declared",
            detail=dataset.value_unit,
        )

    def _check_attribution(self, dataset: DatasetMetadata) -> ValidationCheck:
        passed = bool(dataset.organization and dataset.dataset_title)
        return ValidationCheck(
            passed=passed,
            message=(
                "Source attribution present"
                if passed
                else "Missing source attribution (organization and dataset title)"
            ),
            detail={"organization": dataset.organization, "dataset_title": dataset.dataset_title},
        )

    def _check_terrain_file(self, dataset: DatasetMetadata) -> ValidationCheck:
        # For elevation datasets, a terrain_file is expected on the backend
        passed = True
        message = "Terrain file declared" if dataset.terrain_file else "No terrain file declared"
        if dataset.type == "elevation" and not dataset.terrain_file:
            passed = False
            message = "Elevation dataset declares no terrain_file"
        return ValidationCheck(passed=passed, message=message, detail=dataset.terrain_file)

    def _valid_bounds(self, dataset: DatasetMetadata) -> bool:
        return (
            -180 <= dataset.lon_min <= 360
            and -180 <= dataset.lon_max <= 360
            and -90 <= dataset.lat_min <= 90
            and -90 <= dataset.lat_max <= 90
            and dataset.lon_min <= dataset.lon_max
            and dataset.lat_min <= dataset.lat_max
        )


def quick_validate(dataset: DatasetMetadata) -> ValidationResult:
    """Convenience: validate with default rules."""
    return ResourceValidator().validate(dataset)
