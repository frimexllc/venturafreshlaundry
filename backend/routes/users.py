"""User Management admin endpoints"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone
import uuid

from database import db
from auth import get_current_user, hash_password
from models import UserResponse, ROLE_ADMIN, ROLE_OPERATOR, VALID_ROLES, ROLE_PERMISSIONS
from utils import create_audit_log

router = APIRouter(prefix="/api", tags=["User Management"])


def require_admin(user):
    if user.get("role") != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")


class UserUpdateRole(BaseModel):
    role: str


class UserCreateAdmin(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = ROLE_OPERATOR


@router.get("/admin/users")
async def list_users(current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(100)
    return users


@router.post("/admin/users", response_model=UserResponse)
async def create_user_admin(user_data: UserCreateAdmin, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    if user_data.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {VALID_ROLES}")
    existing = await db.users.find_one({"email": user_data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    user = {
        "id": user_id,
        "email": user_data.email.lower(),
        "password_hash": hash_password(user_data.password),
        "name": user_data.name,
        "role": user_data.role,
        "created_at": now
    }
    await db.users.insert_one(user)
    await create_audit_log("USER_CREATED_BY_ADMIN", "user", user_id, current_user["id"], {"role": user_data.role})
    return UserResponse(id=user_id, email=user["email"], name=user["name"], role=user["role"], created_at=now)


@router.put("/admin/users/{user_id}/role")
async def update_user_role(user_id: str, data: UserUpdateRole, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    if data.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {VALID_ROLES}")
    if user_id == current_user["id"] and data.role != ROLE_ADMIN:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    result = await db.users.update_one({"id": user_id}, {"$set": {"role": data.role}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await create_audit_log("USER_ROLE_UPDATED", "user", user_id, current_user["id"], {"new_role": data.role})
    return {"message": f"User role updated to {data.role}"}


@router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await create_audit_log("USER_DELETED", "user", user_id, current_user["id"])
    return {"message": "User deleted"}


@router.get("/admin/roles")
async def get_roles(current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    return {"roles": VALID_ROLES, "permissions": ROLE_PERMISSIONS}
