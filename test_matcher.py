import time
import sys

# mock db dicts
victims = {
    "v1": {"need": "food", "urgency": 3, "lat": 1.0, "lng": 1.0, "status": "matched"},
    "v_high": {"need": "medical", "urgency": 10, "lat": 1.0, "lng": 1.0, "status": "waiting"}
}

volunteers = {
    "vol1": {"resource": "medical", "lat": 1.0, "lng": 1.0, "status": "en_route"}
}

matches = {
    "m1": {"victimId": "v1", "volunteerId": "vol1", "score": 0.65, "status": "accepted"}
}

sys.path.append("backend")
from matcher import check_reassignment

print("TESTING REASSIGNMENT...")
reassignments = check_reassignment(victims, volunteers, matches)
print(reassignments)
