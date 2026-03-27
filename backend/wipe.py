from app import db

try:
    db.child("victims").remove()
    db.child("volunteers").remove()
    db.child("matches").remove()
    db.child("alerts").remove()
    print("✅ Firebase database successfully wiped! Ready for pure live data.")
except Exception as e:
    print(f"Error wiping DB: {e}")
