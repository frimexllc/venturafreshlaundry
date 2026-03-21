"""Singleton MongoDB connection used by the entire backend."""
from motor.motor_asyncio import AsyncIOMotorClient
import os

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

SKIP_SERVER_NOTIFICATIONS = os.environ.get('SKIP_SERVER_NOTIFICATIONS', 'false').lower() == 'true'
BUSINESS_NAME = os.environ.get("BUSINESS_NAME", "Ventura Fresh Laundry")

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'ventura-fresh-laundry-secret-key-2024')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24
