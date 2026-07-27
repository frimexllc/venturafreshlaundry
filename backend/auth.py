"""Authentication helpers: JWT issuance/verification, password hashing,
and role-based access control dependencies for FastAPI routes.
"""
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from database import JWT_ALGORITHM, JWT_EXPIRATION_HOURS, JWT_SECRET, db
from models import ROLE_ADMIN, ROLE_OPERATOR, ROLE_PERMISSIONS

security = HTTPBearer()


def hash_password(password: str) -> str:
    """Hash a plaintext password for storage."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Check a plaintext password against a stored bcrypt hash."""
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def create_token(user_id: str, email: str, role: str = ROLE_OPERATOR) -> str:
    """Issue a signed JWT for a staff (operator/admin) user."""
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_customer_token(customer_id: str, email: str) -> str:
    """Issue a signed JWT for a customer-portal session (longer lived)."""
    payload = {
        "sub": customer_id,
        "email": email,
        "type": "customer",
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS * 7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and verify a JWT, raising jwt exceptions on failure."""
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Resolve the authenticated staff user from a bearer token.

    NOTE: this backend previously defined `get_current_user` twice. The
    second definition silently shadowed the first, which meant the
    role-fallback logic below (using the role embedded in the token when
    the user document has none) was dead code and never actually ran.
    This is the single, active implementation.
    """
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: Optional[str] = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        # If the stored user document has no role, fall back to the role
        # embedded in the token at issuance time.
        if not user.get("role"):
            role_from_token = payload.get("role", ROLE_OPERATOR)
            user = {**user, "role": role_from_token}

        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_customer(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Resolve the authenticated customer from a bearer token."""
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        customer_id: Optional[str] = payload.get("sub")
        token_type = payload.get("type")
        if not customer_id or token_type != "customer":
            raise HTTPException(status_code=401, detail="Invalid token")

        customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
        if not customer:
            raise HTTPException(status_code=401, detail="Customer not found")
        return customer
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_admin(current_user: dict) -> None:
    """Raise 403 unless the current user is an admin."""
    if current_user.get("role") != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")


def require_role(allowed_roles: List[str]):
    """FastAPI dependency factory: allow admins always, plus any role in
    `allowed_roles`.
    """

    def checker(current_user: dict = Depends(get_current_user)) -> dict:
        user_role = current_user.get("role", ROLE_OPERATOR)
        if user_role == ROLE_ADMIN:
            return current_user
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required roles: {allowed_roles}",
            )
        return current_user

    return checker


def has_permission(current_user: dict, permission: str) -> bool:
    """Check whether a user's role grants a given named permission."""
    user_role = current_user.get("role", ROLE_OPERATOR)
    if user_role == ROLE_ADMIN:
        return True
    permissions = ROLE_PERMISSIONS.get(user_role, [])
    return "all" in permissions or permission in permissions


def require_permission(permission: str):
    """FastAPI dependency factory: require a specific named permission."""

    def checker(current_user: dict = Depends(get_current_user)) -> dict:
        if not has_permission(current_user, permission):
            raise HTTPException(status_code=403, detail=f"Permission denied: {permission}")
        return current_user

    return checker
