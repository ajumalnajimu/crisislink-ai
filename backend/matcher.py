"""
CrisisLink AI — Matching Algorithm (matcher.py)

AI-powered victim-volunteer matching using urgency, distance, and resource type.
Uses Haversine formula for distance calculation and a weighted scoring model.
"""

import math
from typing import Any


# Urgency bonus by need type (added to victim's own urgency value)
URGENCY_BONUS: dict[str, int] = {
    "medical": 2,
    "rescue": 1,
    "shelter": 0,
    "food": 0,
}

# Situation difficulty multipliers for ETA
SITUATION_MULTIPLIERS: dict[str, float] = {
    "waterRising": 2.5,
    "buildingCollapse": 2.0,
    "fireNearby": 1.8,
    "trapped": 1.5,
}

# Reassignment threshold: new score must exceed current by this much
REASSIGNMENT_THRESHOLD: float = 0.05


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculate the great-circle distance between two points on Earth using the
    Haversine formula.

    Args:
        lat1: Latitude of point 1 in degrees.
        lng1: Longitude of point 1 in degrees.
        lat2: Latitude of point 2 in degrees.
        lng2: Longitude of point 2 in degrees.

    Returns:
        Distance in kilometers.
    """
    R = 6371.0  # Earth radius in km
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def calculate_score(
    victim: dict[str, Any], volunteer: dict[str, Any]
) -> tuple[float, str, float]:
    """
    Calculate a matching score between a victim and a volunteer.

    Score = (urgency/10 × 0.5) + (distance_score × 0.3) + (resource_match × 0.2)
    Urgency is boosted by vulnerable persons and situation flags.

    Args:
        victim: Victim record with keys: need, urgency, lat, lng, situation, vulnerablePersons.
        volunteer: Volunteer record with keys: resource, lat, lng.

    Returns:
        Tuple of (score, decision_log_string, eta_minutes).
    """
    # --- Urgency component (boosted by vulnerable persons) ---
    need = victim.get("need", "food").lower()
    urgency_raw = int(victim.get("urgency", 3))
    
    if need == "sos":
        effective_urgency = 10
        need_bonus = 0
        vuln_boost = 0
    else:
        need_bonus = URGENCY_BONUS.get(need, 0)
        # Boost urgency for vulnerable persons
        vulnerable = victim.get("vulnerablePersons", {})
        vuln_boost = 0
        if vulnerable.get("childPresent"):
            vuln_boost += 2
        if vulnerable.get("elderlyPresent"):
            vuln_boost += 2
        if vulnerable.get("patientPresent"):
            vuln_boost += 3
        # Use the ACTUAL victim urgency value + need bonus + vuln boost
        effective_urgency = min(urgency_raw + need_bonus + vuln_boost, 10)

    # Escalated victims always get maximum urgency
    if victim.get("escalated"):
        effective_urgency = 10

    urgency_component = (effective_urgency / 10) * 0.5

    # --- Distance component ---
    distance_km = haversine(
        float(victim.get("lat", 0)),
        float(victim.get("lng", 0)),
        float(volunteer.get("lat", 0)),
        float(volunteer.get("lng", 0)),
    )
    distance_score = max(0.0, 1 - distance_km / 10)
    distance_component = distance_score * 0.3

    # --- Resource match component ---
    if need == "sos":
        resource_match = 1.0  # SOS accepts ANY volunteer with perfect match score
    else:
        resource_match = (
            1.0
            if volunteer.get("resource", "").lower() == need
            else 0.3
        )
    resource_component = resource_match * 0.2

    # --- Total score ---
    score = round(urgency_component + distance_component + resource_component, 4)

    # --- ETA estimate with situation-aware difficulty ---
    base_speed_kmh = 40.0  # Driving speed
    situation = victim.get("situation", {})
    max_multiplier = 1.0
    active_situations = []
    
    if isinstance(situation, dict):
        for sit_key, mult in SITUATION_MULTIPLIERS.items():
            if situation.get(sit_key):
                active_situations.append(sit_key)
                max_multiplier = max(max_multiplier, mult)
    
    effective_speed = base_speed_kmh / max_multiplier
    eta_minutes = round(distance_km / effective_speed * 60, 1)
    if eta_minutes < 1:
        eta_minutes = 1.0

    sit_info = f", situations={active_situations}, speed_mult={max_multiplier}x" if active_situations else ""
    decision_log = (
        f"Score {score}: urgency={effective_urgency}/10 (raw={urgency_raw}, need_bonus=+{need_bonus}, vuln_boost=+{vuln_boost}, ×0.5={urgency_component:.2f}), "
        f"dist={distance_km:.2f}km (score={distance_score:.2f}, ×0.3={distance_component:.2f}), "
        f"resource={'MATCH' if resource_match == 1.0 else 'PARTIAL'} (×0.2={resource_component:.2f}), "
        f"ETA≈{eta_minutes}min{sit_info}"
    )

    return score, decision_log, eta_minutes


def find_best_match(
    victim: dict[str, Any],
    victim_id: str,
    volunteers: dict[str, dict[str, Any]],
    existing_matches: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    """
    Find the best available volunteer for a given victim.

    Only considers volunteers with status='available'.

    Args:
        victim: The victim record.
        victim_id: The victim's Firebase key.
        volunteers: Dict of volunteer_id -> volunteer record.
        existing_matches: Dict of match_id -> match record (optional).

    Returns:
        A match dict with victimId, volunteerId, score, eta, decisionLog,
        or None if no volunteer is available.
    """
    best_score = -1.0
    best_volunteer_id = None
    best_decision_log = ""
    best_eta = 0.0

    for vol_id, vol in volunteers.items():
        if vol.get("status", "").lower() != "available":
            continue

        score, decision_log, eta = calculate_score(victim, vol)

        if score > best_score:
            best_score = score
            best_volunteer_id = vol_id
            best_decision_log = decision_log
            best_eta = eta

    if best_volunteer_id is None:
        return None

    import time
    return {
        "victimId": victim_id,
        "volunteerId": best_volunteer_id,
        "score": best_score,
        "eta": best_eta,
        "decisionLog": best_decision_log,
        "status": "pending",
        "timestamp": int(time.time() * 1000),
    }


def run_matching(
    victims: dict[str, dict[str, Any]],
    volunteers: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Run the matching algorithm across all waiting victims and available volunteers.

    Args:
        victims: Dict of victim_id -> victim record.
        volunteers: Dict of volunteer_id -> volunteer record.

    Returns:
        List of match dicts.
    """
    matches: list[dict[str, Any]] = []
    matched_volunteer_ids: set[str] = set()

    # Sort victims by urgency (highest first) for greedy matching
    sorted_victims = sorted(
        victims.items(),
        key=lambda item: int(item[1].get("urgency", 1)) + URGENCY_BONUS.get(
            item[1].get("need", "food").lower(), 0
        ),
        reverse=True,
    )

    for victim_id, victim in sorted_victims:
        if victim.get("status", "").lower() != "waiting":
            continue

        # Filter out already-matched volunteers
        available_vols = {
            vid: v
            for vid, v in volunteers.items()
            if v.get("status", "").lower() == "available"
            and vid not in matched_volunteer_ids
        }

        match = find_best_match(victim, victim_id, available_vols)
        if match:
            matches.append(match)
            matched_volunteer_ids.add(match["volunteerId"])

    return matches


def check_reassignment(
    victims: dict[str, dict[str, Any]],
    volunteers: dict[str, dict[str, Any]],
    existing_matches: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Check if any current matches should be reassigned due to higher-priority victims.

    A reassignment triggers when:
      new_score > current_score + REASSIGNMENT_THRESHOLD (1.5)

    Args:
        victims: Dict of victim_id -> victim record.
        volunteers: Dict of volunteer_id -> volunteer record.
        existing_matches: Dict of match_id -> match record.

    Returns:
        List of reassignment dicts with old and new match info.
    """
    reassignments: list[dict[str, Any]] = []

    # Find unmatched waiting victims
    matched_victim_ids = {m.get("victimId") for m in existing_matches.values()}
    unmatched_victims = {
        vid: v
        for vid, v in victims.items()
        if vid not in matched_victim_ids and v.get("status", "").lower() == "waiting"
    }

    for new_victim_id, new_victim in unmatched_victims.items():
        for match_id, current_match in existing_matches.items():
            current_volunteer_id = current_match.get("volunteerId", "")
            current_score = current_match.get("score", 0)

            volunteer = volunteers.get(current_volunteer_id)
            if not volunteer:
                continue

            new_score, new_decision_log, new_eta = calculate_score(new_victim, volunteer)

            if new_score > current_score + REASSIGNMENT_THRESHOLD:
                reassignments.append(
                    {
                        "matchId": match_id,
                        "oldVictimId": current_match.get("victimId"),
                        "newVictimId": new_victim_id,
                        "volunteerId": current_volunteer_id,
                        "oldScore": current_score,
                        "newScore": new_score,
                        "eta": new_eta,
                        "decisionLog": (
                            f"REASSIGNED: {new_decision_log} | "
                            f"Previous assignment score was {current_score:.4f}, "
                            f"improvement of {new_score - current_score:.4f} "
                            f"(threshold={REASSIGNMENT_THRESHOLD})"
                        ),
                    }
                )

    return reassignments
