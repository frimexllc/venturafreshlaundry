"""Singleton MongoDB connection used by the entire backend."""
from motor.motor_asyncio import AsyncIOMotorClient
import os

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)

# In production (Atlas), the MONGO_URL contains the authorized database name.
# Use get_default_database() to extract it; fall back to DB_NAME for local dev.
try:
    db = client.get_default_database()
except Exception:
    db = client[os.environ['DB_NAME']]

SKIP_SERVER_NOTIFICATIONS = os.environ.get('SKIP_SERVER_NOTIFICATIONS', 'false').lower() == 'true'
BUSINESS_NAME = os.environ.get("BUSINESS_NAME", "Ventura Fresh Laundry")

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'ventura-fresh-laundry-secret-key-2024')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 168  # 7 days for operator tokens
