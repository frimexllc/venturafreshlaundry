# routes/auth_routes.py
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid

from database import db
from models import UserCreate, UserLogin, UserResponse, TokenResponse
from auth import hash_password, verify_password, create_token, get_current_user
from utils import create_audit_log

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    """Create the very first (admin) account on a brand-new deployment.

    SECURITY: this endpoint used to be open to anyone, with no auth
    required, and silently granted the "operator" role to every
    registrant after the first. On a system that already has users
    (i.e. this one, in production) that meant *anyone* who found the
    login page could create themselves a working operator account with
    real access to orders, customers, and payment data — no invitation,
    no approval. There is no legitimate reason for that on a running
    system: admins already have a proper, authenticated way to create
    accounts at POST /api/admin/users (see routes/users.py).

    This endpoint is now only usable for the one-time bootstrap of a
    fresh deployment with zero users. Once any user exists, it refuses
    and points to the admin-only flow instead.
    """
    user_count = await db.users.count_documents({})
    if user_count > 0:
        raise HTTPException(
            status_code=403,
            detail=(
                "Self-registration is disabled. Ask an administrator to "
                "create your account from User Management."
            ),
        )

    existing = await db.users.find_one({"email": user_data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "email": user_data.email.lower(),
        "password_hash": hash_password(user_data.password),
        "name": user_data.name,
        "role": "admin",  # first user on a fresh deployment only
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user)
    await create_audit_log("USER_CREATED", "user", user_id, user_id)

    token = create_token(user_id, user["email"])
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(id=user_id, email=user["email"], name=user["name"], role=user["role"], created_at=user["created_at"])
    )

@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email.lower()}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_token(user["id"], user["email"], user.get("role", "operator"))  # ← pasar rol
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(
            id=user["id"], email=user["email"],
            name=user["name"], role=user["role"],
            created_at=user["created_at"]
        )
    )

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        name=current_user["name"],
        role=current_user["role"],
        created_at=current_user["created_at"]
    )