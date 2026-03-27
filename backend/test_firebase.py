import pyrebase, os
from dotenv import load_dotenv

load_dotenv()

config = {
    'apiKey': 'dummy',
    'authDomain': 'dummy',
    'databaseURL': os.getenv('FIREBASE_URL'),
    'storageBucket': 'dummy'
}

firebase = pyrebase.initialize_app(config)
db = firebase.database()
db.child('test').set({'hello': 'world'})
print('Write successful')