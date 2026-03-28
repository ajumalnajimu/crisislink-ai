"""
CrisisLink AI — Flask Backend (app.py)

Main API server providing endpoints for victim/volunteer management,
AI matching, shortage prediction, Gemini briefings, and demo data seeding.
"""

import os
import time
import random
from typing import Any

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

import pyrebase

from matcher import run_matching, check_reassignment, find_best_match
from predictor import predict_shortages
from briefing import generate_briefing

# Load environment variables
load_dotenv()

# ── Flask App ────────────────────────────────────────────────────────────────

app = Flask(__name__)
CORS(app)  # Allow all origins for demo

# ── Firebase Configuration ───────────────────────────────────────────────────

firebase_config = {
    "apiKey": "demo-key",
    "authDomain": "demo.firebaseapp.com",
    "databaseURL": os.environ.get("FIREBASE_URL", ""),
    "storageBucket": "demo.appspot.com",
}

firebase = pyrebase.initialize_app(firebase_config)
db = firebase.database()


# ── Helper Functions ─────────────────────────────────────────────────────────


def get_all(path: str) -> dict[str, dict[str, Any]]:
    """
    Retrieve all records from a Firebase path.

    Args:
        path: The Firebase database path (e.g., 'victims', 'volunteers').

    Returns:
        Dict of id -> record, or empty dict on error.
    """
    try:
        result = db.child(path).get()
        if result and result.each():
            return {item.key(): item.val() for item in result.each()}
        return {}
    except Exception as e:
        print(f"[Firebase] Error reading {path}: {e}")
        return {}


def push_record(path: str, data: dict[str, Any]) -> str | None:
    """
    Push a new record to a Firebase path.

    Args:
        path: The Firebase database path.
        data: The record data to push.

    Returns:
        The generated key, or None on error.
    """
    try:
        result = db.child(path).push(data)
        return result.get("name")
    except Exception as e:
        print(f"[Firebase] Error pushing to {path}: {e}")
        return None


def update_record(path: str, key: str, data: dict[str, Any]) -> bool:
    """
    Update a record at a Firebase path.

    Args:
        path: The Firebase database path.
        key: The record key to update.
        data: The fields to update.

    Returns:
        True on success, False on error.
    """
    try:
        db.child(path).child(key).update(data)
        return True
    except Exception as e:
        print(f"[Firebase] Error updating {path}/{key}: {e}")
        return False


def set_record(path: str, key: str, data: dict[str, Any]) -> bool:
    """
    Set (overwrite) a record at a Firebase path.

    Args:
        path: The Firebase database path.
        key: The record key to set.
        data: The full record data.

    Returns:
        True on success, False on error.
    """
    try:
        db.child(path).child(key).set(data)
        return True
    except Exception as e:
        print(f"[Firebase] Error setting {path}/{key}: {e}")
        return False


def process_auto_reassignment(extra_victims: dict = None):
    """Helper to process reassignments in the background or during API calls."""
    try:
        victims = get_all("victims")
        if extra_victims:
            victims.update(extra_victims)
            
        volunteers = get_all("volunteers")
        existing_matches = get_all("matches")
        
        reassignments = check_reassignment(victims, volunteers, existing_matches)
        for r in reassignments:
            update_record("victims", r["oldVictimId"], {"status": "waiting"})
            update_record("victims", r["newVictimId"], {"status": "matched"})
            update_record("matches", r["matchId"], {
                "victimId": r["newVictimId"],
                "score": r["newScore"],
                "eta": r["eta"],
                "decisionLog": r["decisionLog"],
                "status": "pending",
                "timestamp": int(time.time() * 1000)
            })
            print(f"[AUTO-REASSIGN] Rerouted {r['volunteerId']} to {r['newVictimId']}!")
        return reassignments
    except Exception as e:
        print(f"[ERROR] Auto-reassign failed: {e}")
        return []

# ── API Routes ───────────────────────────────────────────────────────────────


@app.route("/api/victim", methods=["POST"])
def create_victim() -> tuple:
    """
    Save a new victim report to Firebase and trigger matching.

    Expected JSON body:
        {name, need, urgency, lat, lng, totalPersons, vulnerablePersons,
         essentials, situation, customMessage, audioBase64}

    Returns:
        JSON with the created victim ID and any immediate match.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON body provided"}), 400

        victim = {
            "name": data.get("name", "Unknown"),
            "need": data.get("need", "food"),
            "urgency": int(data.get("urgency", 3)),
            "lat": float(data.get("lat", 12.9716)),
            "lng": float(data.get("lng", 77.5946)),
            "status": "waiting",
            "timestamp": int(time.time() * 1000),
            "totalPersons": int(data.get("totalPersons", 1)),
            "vulnerablePersons": data.get("vulnerablePersons", {}),
            "essentials": data.get("essentials", []),
            "situation": data.get("situation", {}),
            "customMessage": data.get("customMessage", ""),
        }

        # Store audio separately if present (base64 string)
        audio = data.get("audioBase64", "")
        if audio:
            victim["audioBase64"] = audio

        victim_id = push_record("victims", victim)
        if not victim_id:
            return jsonify({"error": "Failed to save victim to database"}), 500

        # Try immediate matching
        volunteers = get_all("volunteers")
        match = find_best_match(victim, victim_id, volunteers)

        if match:
            match_id = push_record("matches", match)
            update_record("victims", victim_id, {"status": "matched"})
            update_record("volunteers", match["volunteerId"], {"status": "assigned"})
            return jsonify({
                "success": True,
                "victimId": victim_id,
                "matched": True,
                "match": match,
                "matchId": match_id,
            }), 201

        # If direct matching failed, try hijacking a volunteer via reassignment
        reassignments = process_auto_reassignment(extra_victims={victim_id: victim})
        if reassignments and any(r["newVictimId"] == victim_id for r in reassignments):
             return jsonify({
                "success": True,
                "victimId": victim_id,
                "matched": True,
                "match": {}, # the client will pull the match dict on next poll
                "matchId": "reassigned",
            }), 201

        return jsonify({
            "success": True,
            "victimId": victim_id,
            "matched": False,
            "message": "Victim saved. No available volunteer match found yet.",
        }), 201

    except Exception as e:
        return jsonify({"error": f"Failed to create victim: {str(e)}"}), 500


@app.route("/api/volunteer", methods=["POST"])
def create_volunteer() -> tuple:
    """
    Register a new volunteer in Firebase.

    Expected JSON body:
        {name, resource, lat, lng}

    Returns:
        JSON with the created volunteer ID.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON body provided"}), 400

        volunteer = {
            "name": data.get("name", "Unknown"),
            "resource": data.get("resource", "food"),
            "lat": float(data.get("lat", 12.9716)),
            "lng": float(data.get("lng", 77.5946)),
            "status": "available",
        }

        volunteer_id = push_record("volunteers", volunteer)
        if not volunteer_id:
            return jsonify({"error": "Failed to save volunteer to database"}), 500

        # Automatically check for waiting victims now that a new unit is online
        victims = get_all("victims")
        if victims:
            new_matches = run_matching(victims, {volunteer_id: volunteer})
            for m in new_matches:
                push_record("matches", m)
                update_record("victims", m["victimId"], {"status": "matched"})
                update_record("volunteers", m["volunteerId"], {"status": "assigned"})

        return jsonify({
            "success": True,
            "volunteerId": volunteer_id,
        }), 201

    except Exception as e:
        return jsonify({"error": f"Failed to create volunteer: {str(e)}"}), 500


@app.route("/api/match", methods=["GET"])
def run_match() -> tuple:
    """
    Run the matching algorithm on all waiting victims and available volunteers.
    Updates Firebase with new matches.

    Returns:
        JSON with list of matches created.
    """
    try:
        victims = get_all("victims")
        volunteers = get_all("volunteers")

        matches = run_matching(victims, volunteers)

        saved_matches = []
        for match in matches:
            match_id = push_record("matches", match)
            if match_id:
                update_record("victims", match["victimId"], {"status": "matched"})
                update_record(
                    "volunteers", match["volunteerId"], {"status": "assigned"}
                )
                match["matchId"] = match_id
                saved_matches.append(match)

        return jsonify({
            "success": True,
            "matchCount": len(saved_matches),
            "matches": saved_matches,
        }), 200

    except Exception as e:
        return jsonify({"error": f"Matching failed: {str(e)}"}), 500


@app.route("/api/alerts", methods=["GET"])
def get_alerts() -> tuple:
    """
    Return predictive shortage alerts based on current victim/volunteer distribution.

    Returns:
        JSON with list of alerts.
    """
    try:
        victims = get_all("victims")
        volunteers = get_all("volunteers")

        alerts = predict_shortages(victims, volunteers)

        # Optionally save alerts to Firebase
        for alert in alerts:
            push_record("alerts", alert)

        return jsonify({
            "success": True,
            "alertCount": len(alerts),
            "alerts": alerts,
        }), 200

    except Exception as e:
        return jsonify({"error": f"Alert generation failed: {str(e)}"}), 500


@app.route("/api/briefing/<role>", methods=["GET"])
def get_briefing(role: str) -> tuple:
    """
    Generate an AI situation briefing for the specified role.

    Args:
        role: One of 'victim', 'volunteer', or 'authority'.

    Returns:
        JSON with the AI-generated briefing text.
    """
    try:
        victims = get_all("victims")
        volunteers = get_all("volunteers")
        matches = get_all("matches")
        alerts = predict_shortages(victims, volunteers)

        result = generate_briefing(role, victims, volunteers, matches, alerts)

        return jsonify(result), 200

    except Exception as e:
        return jsonify({"error": f"Briefing generation failed: {str(e)}"}), 500


@app.route("/api/reassign", methods=["POST"])
def trigger_reassignment() -> tuple:
    """
    Check all active matches for potential reassignments.

    A reassignment occurs when a new victim's score with an assigned volunteer
    exceeds the current match score by 1.5+.

    Returns:
        JSON with list of reassignment actions taken.
    """
    try:
        victims = get_all("victims")
        volunteers = get_all("volunteers")
        existing_matches = get_all("matches")

        reassignments = check_reassignment(victims, volunteers, existing_matches)

        applied: list[dict[str, Any]] = []
        for r in reassignments:
            # Update old victim back to waiting
            update_record("victims", r["oldVictimId"], {"status": "waiting"})

            # Update new victim to matched
            update_record("victims", r["newVictimId"], {"status": "matched"})

            # Update the match record
            update_record("matches", r["matchId"], {
                "victimId": r["newVictimId"],
                "score": r["newScore"],
                "eta": r["eta"],
                "decisionLog": r["decisionLog"],
            })

            applied.append(r)

        return jsonify({
            "success": True,
            "reassignmentCount": len(applied),
            "reassignments": applied,
        }), 200

    except Exception as e:
        return jsonify({"error": f"Reassignment failed: {str(e)}"}), 500


@app.route("/api/match/accept", methods=["POST"])
def accept_match() -> tuple:
    """
    Volunteer accepts the match assignment.

    Expected JSON body:
        {matchId, volunteerId}

    Returns:
        JSON confirmation.
    """
    try:
        data = request.get_json()
        match_id = data.get("matchId")
        volunteer_id = data.get("volunteerId")

        if not match_id or not volunteer_id:
            return jsonify({"error": "matchId and volunteerId required"}), 400

        # Update match status
        update_record("matches", match_id, {"status": "accepted"})
        update_record("volunteers", volunteer_id, {"status": "en_route"})

        return jsonify({"success": True, "message": "Match accepted"}), 200

    except Exception as e:
        return jsonify({"error": f"Accept failed: {str(e)}"}), 500


@app.route("/api/match/cancel", methods=["POST"])
def cancel_match() -> tuple:
    """
    Volunteer declines the match. Victim goes back to waiting.

    Expected JSON body:
        {matchId, volunteerId, victimId}

    Returns:
        JSON confirmation.
    """
    try:
        data = request.get_json()
        match_id = data.get("matchId")
        volunteer_id = data.get("volunteerId")
        victim_id = data.get("victimId")

        if not match_id:
            return jsonify({"error": "matchId required"}), 400

        # Remove the match, reset statuses
        try:
            db.child("matches").child(match_id).remove()
        except Exception:
            pass

        if volunteer_id:
            update_record("volunteers", volunteer_id, {"status": "available"})
        if victim_id:
            update_record("victims", victim_id, {"status": "waiting"})

        # Re-run matching for the freed victim
        victims = get_all("victims")
        volunteers = get_all("volunteers")
        if victim_id and victim_id in victims:
            new_match = find_best_match(victims[victim_id], victim_id, volunteers)
            if new_match:
                new_match_id = push_record("matches", new_match)
                update_record("victims", victim_id, {"status": "matched"})
                update_record("volunteers", new_match["volunteerId"], {"status": "assigned"})

        return jsonify({"success": True, "message": "Match cancelled, victim re-queued"}), 200

    except Exception as e:
        return jsonify({"error": f"Cancel failed: {str(e)}"}), 500


@app.route("/api/victim/<victim_id>", methods=["GET"])
def get_victim(victim_id: str) -> tuple:
    """Fetch a single victim by ID to restore active session."""
    try:
        victim = db.child("victims").child(victim_id).get().val()
        if not victim:
            return jsonify({"success": False, "error": "Victim not found"}), 404
        return jsonify({"success": True, "victim": victim}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to fetch victim: {str(e)}"}), 500


@app.route("/api/volunteer/<volunteer_id>", methods=["GET"])
def get_volunteer(volunteer_id: str) -> tuple:
    """Fetch a single volunteer by ID to restore active session."""
    try:
        volunteer = db.child("volunteers").child(volunteer_id).get().val()
        if not volunteer:
            return jsonify({"success": False, "error": "Volunteer not found"}), 404
        return jsonify({"success": True, "volunteer": volunteer}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to fetch volunteer: {str(e)}"}), 500


@app.route("/api/location/update", methods=["POST"])
def update_location() -> tuple:
    """
    Update live GPS coordinates for a victim or volunteer.

    Expected JSON: { "role": "victim" | "volunteer", "id": "...", "lat": 12.3, "lng": 45.6 }
    """
    try:
        data = request.get_json()
        role = data.get("role")
        user_id = data.get("id")
        lat = float(data.get("lat"))
        lng = float(data.get("lng"))

        if not user_id or role not in ["victim", "volunteer"]:
            return jsonify({"error": "Invalid role or id"}), 400

        node = "victims" if role == "victim" else "volunteers"
        update_record(node, user_id, {"lat": lat, "lng": lng})

        return jsonify({"success": True}), 200

    except Exception as e:
        return jsonify({"error": f"Location update failed: {str(e)}"}), 500


@app.route("/api/victim/escalate", methods=["POST"])
def escalate_victim() -> tuple:
    """
    Victim hits panic button to set urgency to maximum.

    Expected JSON: { "victimId": "..." }
    """
    try:
        data = request.get_json()
        victim_id = data.get("victimId")

        if not victim_id:
            return jsonify({"error": "victimId required"}), 400

        update_record("victims", victim_id, {"urgency": 10, "escalated": True, "need": "medical"})
        
        # Re-read all data AFTER the update so the escalated flag is visible
        victims = get_all("victims")
        volunteers = get_all("volunteers")
        existing_matches = get_all("matches")
        
        # First try normal matching for waiting victims
        matches = run_matching(victims, volunteers)
        for match in matches:
            push_record("matches", match)
            update_record("victims", match["victimId"], {"status": "matched"})
            update_record("volunteers", match["volunteerId"], {"status": "assigned"})
            
        # Force reassignment check — the escalated victim now has max urgency
        reassignments = check_reassignment(victims, volunteers, existing_matches)
        for r in reassignments:
            update_record("victims", r["oldVictimId"], {"status": "waiting"})
            update_record("victims", r["newVictimId"], {"status": "matched"})
            update_record("matches", r["matchId"], {
                "victimId": r["newVictimId"],
                "score": r["newScore"],
                "eta": r["eta"],
                "decisionLog": r["decisionLog"],
                "status": "pending",
                "timestamp": int(time.time() * 1000)
            })
            print(f"[ESCALATION REASSIGN] Rerouted {r['volunteerId']} to {r['newVictimId']}!")

        return jsonify({"success": True, "message": "Emergency escalated!"}), 200

    except Exception as e:
        return jsonify({"error": f"Escalation failed: {str(e)}"}), 500


# ── Health Check ─────────────────────────────────────────────────────────────


@app.route("/api/health", methods=["GET"])
def health_check() -> tuple:
    """
    Health check endpoint to verify the backend is running.

    Returns:
        JSON with status and Firebase connectivity.
    """
    firebase_ok = False
    try:
        db.child("health").set({"ping": int(time.time() * 1000)})
        firebase_ok = True
    except Exception:
        pass

    return jsonify({
        "status": "ok",
        "firebase": "connected" if firebase_ok else "disconnected",
        "timestamp": int(time.time() * 1000),
    }), 200


# ── Data Retrieval (for frontend) ────────────────────────────────────────────


@app.route("/api/victims", methods=["GET"])
def list_victims() -> tuple:
    """
    List all victims from Firebase.

    Returns:
        JSON with dict of victim records.
    """
    try:
        victims = get_all("victims")
        return jsonify({"success": True, "victims": victims}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/volunteers", methods=["GET"])
def list_volunteers() -> tuple:
    """
    List all volunteers from Firebase.

    Returns:
        JSON with dict of volunteer records.
    """
    try:
        volunteers = get_all("volunteers")
        return jsonify({"success": True, "volunteers": volunteers}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/matches", methods=["GET"])
def list_matches() -> tuple:
    """
    List all matches from Firebase.

    Returns:
        JSON with dict of match records.
    """
    try:
        matches = get_all("matches")
        return jsonify({"success": True, "matches": matches}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/matches/<match_id>/complete", methods=["POST"])
def complete_match(match_id: str) -> tuple:
    """Complete a rescue mission, free the volunteer, and mark victim as rescued."""
    try:
        match = db.child("matches").child(match_id).get().val()
        if not match:
            return jsonify({"error": "Match not found"}), 404

        vic_id = match.get("victimId")
        vol_id = match.get("volunteerId")

        db.child("matches").child(match_id).remove()

        if vic_id:
            update_record("victims", vic_id, {"status": "rescued"})
        if vol_id:
            update_record("volunteers", vol_id, {"status": "available"})
            
        print(f"[MISSION COMPLETE] Match {match_id} completed.")
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/victim/<victim_id>/cancel", methods=["POST"])
def cancel_victim(victim_id: str) -> tuple:
    """Cancel a victim request and clean up any pending matches."""
    try:
        vic = db.child("victims").child(victim_id).get().val()
        if not vic:
            return jsonify({"error": "Victim not found"}), 404

        update_record("victims", victim_id, {"status": "cancelled"})
        
        # Cleanup matches associated with victim
        matches = get_all("matches")
        for m_id, m in matches.items():
            if m.get("victimId") == victim_id:
                db.child("matches").child(m_id).remove()
                vol_id = m.get("volunteerId")
                if vol_id:
                    update_record("volunteers", vol_id, {"status": "available"})

        print(f"[CANCELLED] Victim {victim_id} cancelled.")
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Background Worker ────────────────────────────────────────────────────────

def background_timeout_worker() -> None:
    """Periodically checks and cancels matches that are pending for > 2 mins."""
    while True:
        try:
            matches = get_all("matches")
            now = int(time.time() * 1000)
            stale_cutoff = now - (15 * 1000)  # 15 seconds aggressive timeout
            
            for m_id, match in matches.items():
                if match.get("status") == "pending":
                    ts = match.get("timestamp", 0)
                    if ts > 0 and ts < stale_cutoff:
                        vic_id = match.get("victimId")
                        vol_id = match.get("volunteerId")
                        
                        try:
                            db.child("matches").child(m_id).remove()
                        except Exception:
                            pass
                            
                        # Put victim back to waiting
                        if vic_id:
                            update_record("victims", vic_id, {"status": "waiting"})
                        # Mark volunteer as OFFLINE so they don't get matched again
                        if vol_id:
                            update_record("volunteers", vol_id, {"status": "offline"})
                        
                        print(f"[BACKGROUND] Ghost volunteer {vol_id} timed out. Match {m_id} canceled.")
                        
                        # Instantly trigger reassignment for this victim
                        victims = get_all("victims")
                        volunteers = get_all("volunteers")
                        if vic_id and vic_id in victims:
                            new_match = find_best_match(victims[vic_id], vic_id, volunteers)
                            if new_match:
                                push_record("matches", new_match)
                                update_record("victims", vic_id, {"status": "matched"})
                                update_record("volunteers", new_match["volunteerId"], {"status": "assigned"})
                                print(f"[BACKGROUND] Instantly rematched victim {vic_id} to {new_match['volunteerId']}")
                            else:
                                print(f"[BACKGROUND] No available volunteers for {vic_id}, checking reassignment...")
                                process_auto_reassignment()
                                
        except Exception as e:
            print(f"[BACKGROUND] Error in timeout worker: {e}")
            
        time.sleep(5)  # Check every 5 seconds

import threading
threading.Thread(target=background_timeout_worker, daemon=True).start()

# ── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"\n🚀 CrisisLink AI Backend running on http://localhost:{port}")
    print(f"📡 Firebase URL: {os.environ.get('FIREBASE_URL', 'NOT SET')}")
    print(f"🤖 Gemini API: {'configured' if os.environ.get('GEMINI_API_KEY') else 'NOT SET'}\n")
    app.run(debug=True, host="0.0.0.0", port=port)
