"""
CrisisLink AI — Shortage Predictor (predictor.py)

Divides the city into 4 quadrants and predicts resource shortages
by comparing victim demand vs volunteer supply per quadrant.
"""

import time
from typing import Any


# Bangalore city center (demo coordinates)
CENTER_LAT: float = 12.9716
CENTER_LNG: float = 77.5946

# Zone names for each quadrant
ZONE_NAMES: dict[str, str] = {
    "NE": "North-East Bangalore",
    "NW": "North-West Bangalore",
    "SE": "South-East Bangalore",
    "SW": "South-West Bangalore",
}

# Resource types to monitor
RESOURCE_TYPES: list[str] = ["medical", "rescue", "shelter", "food"]

# Depletion rate estimates (minutes per unit consumed)
DEPLETION_RATE_MINUTES: dict[str, float] = {
    "medical": 15.0,
    "rescue": 20.0,
    "shelter": 30.0,
    "food": 25.0,
}


def get_quadrant(lat: float, lng: float) -> str:
    """
    Determine which quadrant a coordinate falls into based on city center.

    Args:
        lat: Latitude of the point.
        lng: Longitude of the point.

    Returns:
        Quadrant string: 'NE', 'NW', 'SE', or 'SW'.
    """
    north = lat >= CENTER_LAT
    east = lng >= CENTER_LNG

    if north and east:
        return "NE"
    elif north and not east:
        return "NW"
    elif not north and east:
        return "SE"
    else:
        return "SW"


def count_by_quadrant_and_type(
    records: dict[str, dict[str, Any]], type_key: str
) -> dict[str, dict[str, int]]:
    """
    Count records grouped by quadrant and resource/need type.

    Args:
        records: Dict of id -> record with lat, lng, and a type field.
        type_key: The key to use for grouping ('need' for victims, 'resource' for volunteers).

    Returns:
        Nested dict: quadrant -> resource_type -> count.
    """
    counts: dict[str, dict[str, int]] = {
        zone: {rt: 0 for rt in RESOURCE_TYPES} for zone in ZONE_NAMES
    }

    for record_id, record in records.items():
        try:
            lat = float(record.get("lat", CENTER_LAT))
            lng = float(record.get("lng", CENTER_LNG))
            resource_type = record.get(type_key, "food").lower()
            quadrant = get_quadrant(lat, lng)

            if resource_type in RESOURCE_TYPES:
                counts[quadrant][resource_type] += 1
        except (ValueError, TypeError):
            continue

    return counts


def predict_shortages(
    victims: dict[str, dict[str, Any]],
    volunteers: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Predict resource shortages across city quadrants.

    Fires an alert when victim_count > volunteer_count × 1.5 for any
    resource type in any quadrant.

    Args:
        victims: Dict of victim_id -> victim record (only 'waiting' counted).
        volunteers: Dict of volunteer_id -> volunteer record (only 'available' counted).

    Returns:
        List of alert dicts with zone, type, message, and timestamp.
    """
    # Filter to only active records
    active_victims = {
        vid: v
        for vid, v in victims.items()
        if v.get("status", "").lower() == "waiting"
    }
    active_volunteers = {
        vid: v
        for vid, v in volunteers.items()
        if v.get("status", "").lower() == "available"
    }

    victim_counts = count_by_quadrant_and_type(active_victims, "need")
    volunteer_counts = count_by_quadrant_and_type(active_volunteers, "resource")

    alerts: list[dict[str, Any]] = []

    for zone in ZONE_NAMES:
        for resource_type in RESOURCE_TYPES:
            v_count = victim_counts[zone][resource_type]
            vol_count = volunteer_counts[zone][resource_type]

            # Alert fires when demand exceeds supply × 1.5
            if v_count > vol_count * 1.5:
                deficit = v_count - vol_count
                depletion_rate = DEPLETION_RATE_MINUTES.get(resource_type, 20.0)
                minutes_to_depletion = round(
                    depletion_rate / max(deficit, 1) * vol_count, 1
                ) if vol_count > 0 else 0.0

                if vol_count == 0 and v_count > 0:
                    message = (
                        f"⚠️ CRITICAL: No {resource_type} volunteers in "
                        f"{ZONE_NAMES[zone]}. {v_count} victim(s) waiting. "
                        f"Immediate deployment needed."
                    )
                else:
                    message = (
                        f"⚠️ {resource_type.capitalize()} shortage in "
                        f"{ZONE_NAMES[zone]}: {v_count} requests vs "
                        f"{vol_count} volunteer(s). Estimated depletion in "
                        f"~{minutes_to_depletion} minutes. Deploy additional "
                        f"{resource_type} resources."
                    )

                alerts.append(
                    {
                        "zone": ZONE_NAMES[zone],
                        "type": resource_type,
                        "message": message,
                        "severity": "critical" if vol_count == 0 else "warning",
                        "victimCount": v_count,
                        "volunteerCount": vol_count,
                        "timestamp": int(time.time() * 1000),
                    }
                )

    # Sort: critical first, then by victim count descending
    alerts.sort(
        key=lambda a: (0 if a["severity"] == "critical" else 1, -a["victimCount"])
    )

    return alerts
