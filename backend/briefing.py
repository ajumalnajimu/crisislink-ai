"""
CrisisLink AI — Gemini AI Briefings (briefing.py)

Generates role-specific AI situation briefings using Google Gemini API.
Each role (victim, volunteer, authority) gets a tailored prompt and response style.
"""

import os
from typing import Any

import google.generativeai as genai


def configure_gemini() -> None:
    """
    Configure the Gemini API with the key from environment variables.
    Must be called before generating any briefings.
    """
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if api_key:
        genai.configure(api_key=api_key)


def build_context(
    victims: dict[str, dict[str, Any]],
    volunteers: dict[str, dict[str, Any]],
    matches: dict[str, dict[str, Any]],
    alerts: list[dict[str, Any]],
) -> str:
    """
    Build a situation context string from current platform data.

    Args:
        victims: Dict of victim_id -> victim record.
        volunteers: Dict of volunteer_id -> volunteer record.
        matches: Dict of match_id -> match record.
        alerts: List of alert dicts.

    Returns:
        A formatted context string describing the current crisis situation.
    """
    waiting = sum(1 for v in victims.values() if v.get("status") == "waiting")
    matched = sum(1 for v in victims.values() if v.get("status") == "matched")
    available_vols = sum(
        1 for v in volunteers.values() if v.get("status") == "available"
    )
    assigned_vols = sum(
        1 for v in volunteers.values() if v.get("status") == "assigned"
    )

    # Build need breakdown
    need_counts: dict[str, int] = {}
    for v in victims.values():
        need = v.get("need", "unknown")
        need_counts[need] = need_counts.get(need, 0) + 1

    context_lines = [
        "=== CURRENT CRISIS SITUATION ===",
        f"Total victims: {len(victims)} (waiting: {waiting}, matched: {matched})",
        f"Total volunteers: {len(volunteers)} (available: {available_vols}, assigned: {assigned_vols})",
        f"Active matches: {len(matches)}",
        f"Active alerts: {len(alerts)}",
        "",
        "Need breakdown:",
    ]

    for need, count in sorted(need_counts.items()):
        context_lines.append(f"  - {need}: {count}")

    if alerts:
        context_lines.append("")
        context_lines.append("Shortage alerts:")
        for alert in alerts[:5]:
            context_lines.append(f"  - {alert.get('message', 'Unknown alert')}")

    # Include recent match details
    if matches:
        context_lines.append("")
        context_lines.append("Recent matches:")
        for mid, m in list(matches.items())[:5]:
            victim_name = victims.get(m.get("victimId", ""), {}).get("name", "Unknown")
            vol_name = volunteers.get(m.get("volunteerId", ""), {}).get(
                "name", "Unknown"
            )
            context_lines.append(
                f"  - {victim_name} ↔ {vol_name} (score: {m.get('score', 0)}, "
                f"ETA: {m.get('eta', '?')}min)"
            )

    return "\n".join(context_lines)


# Role-specific system prompts
ROLE_PROMPTS: dict[str, str] = {
    "victim": (
        "You are a calm, reassuring AI assistant for disaster victims. "
        "Based on the situation data below, provide a brief update in EXACTLY 2 sentences. "
        "Mention the estimated ETA of help arriving and what the victim should do while waiting. "
        "Be warm and compassionate. Do NOT use bullet points."
    ),
    "volunteer": (
        "You are a direct, action-oriented AI coordinator for disaster volunteers. "
        "Based on the situation data below, list the top 3 priority cases in numbered order. "
        "For each, include the victim's need type, urgency level, and approximate distance. "
        "Be concise and directive. End with one sentence of encouragement."
    ),
    "authority": (
        "You are an AI situation analyst for disaster management authorities. "
        "Based on the situation data below, provide EXACTLY 3 bullet points. "
        "The FIRST bullet must flag the most critical resource gap. "
        "The second bullet should cover current deployment efficiency. "
        "The third bullet should be a forward-looking recommendation. "
        "Use data and numbers. Be precise and professional."
    ),
}


def generate_briefing(
    role: str,
    victims: dict[str, dict[str, Any]],
    volunteers: dict[str, dict[str, Any]],
    matches: dict[str, dict[str, Any]],
    alerts: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Generate an AI briefing for the specified role using Google Gemini.

    Args:
        role: One of 'victim', 'volunteer', or 'authority'.
        victims: Dict of victim_id -> victim record.
        volunteers: Dict of volunteer_id -> volunteer record.
        matches: Dict of match_id -> match record.
        alerts: List of alert dicts.

    Returns:
        Dict with 'role', 'briefing' text, and 'success' boolean.
    """
    if role not in ROLE_PROMPTS:
        return {
            "role": role,
            "briefing": f"Unknown role: {role}. Use victim, volunteer, or authority.",
            "success": False,
        }

    context = build_context(victims, volunteers, matches, alerts)
    system_prompt = ROLE_PROMPTS[role]

    full_prompt = f"{system_prompt}\n\n{context}"

    try:
        configure_gemini()
        model = genai.GenerativeModel("gemini-pro")
        response = model.generate_content(full_prompt)

        briefing_text = response.text if response.text else "Unable to generate briefing at this time."

        return {
            "role": role,
            "briefing": briefing_text,
            "success": True,
        }

    except Exception as e:
        # Fallback briefings when Gemini is unavailable
        fallback = get_fallback_briefing(role, victims, volunteers, matches, alerts)
        return {
            "role": role,
            "briefing": fallback,
            "success": False,
            "error": str(e),
        }


def get_fallback_briefing(
    role: str,
    victims: dict[str, dict[str, Any]],
    volunteers: dict[str, dict[str, Any]],
    matches: dict[str, dict[str, Any]],
    alerts: list[dict[str, Any]],
) -> str:
    """
    Generate a fallback briefing when Gemini API is unavailable.

    Args:
        role: One of 'victim', 'volunteer', or 'authority'.
        victims: Current victim records.
        volunteers: Current volunteer records.
        matches: Current match records.
        alerts: Current alerts.

    Returns:
        A fallback briefing string.
    """
    waiting = sum(1 for v in victims.values() if v.get("status") == "waiting")
    available = sum(
        1 for v in volunteers.values() if v.get("status") == "available"
    )

    if role == "victim":
        avg_eta = "10-15"
        if matches:
            etas = [m.get("eta", 15) for m in matches.values()]
            avg_eta = f"{round(sum(etas) / len(etas))}"
        return (
            f"Help is on the way — estimated arrival in approximately {avg_eta} minutes. "
            f"Please stay in your current safe location and keep your phone charged and accessible."
        )

    elif role == "volunteer":
        priority_victims = sorted(
            [v for v in victims.values() if v.get("status") == "waiting"],
            key=lambda v: v.get("urgency", 0),
            reverse=True,
        )[:3]
        lines = []
        for i, v in enumerate(priority_victims, 1):
            lines.append(
                f"{i}. {v.get('name', 'Unknown')} — {v.get('need', 'unknown')} "
                f"(urgency: {v.get('urgency', '?')}/10)"
            )
        if not lines:
            lines.append("No pending cases at this time.")
        lines.append("Your rapid response is making a real difference. Stay safe.")
        return "\n".join(lines)

    else:  # authority
        alert_text = alerts[0]["message"] if alerts else "No critical gaps detected"
        return (
            f"• Critical gap: {alert_text}\n"
            f"• Deployment: {len(matches)} active matches, "
            f"{available} volunteers available, {waiting} victims waiting\n"
            f"• Recommendation: Monitor incoming requests and pre-position "
            f"resources in under-served quadrants"
        )
