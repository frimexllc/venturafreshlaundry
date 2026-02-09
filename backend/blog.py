"""
Blog module - Blog posts and categories management
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import uuid

blog_router = APIRouter(prefix="/blog", tags=["Blog"])

# Database reference (set by main app)
db = None

def set_database(database):
    global db
    db = database


# ==================== MODELS ====================

class BlogPostCreate(BaseModel):
    title: str
    slug: Optional[str] = None
    content: str
    excerpt: Optional[str] = None
    featured_image: Optional[str] = None
    category: Optional[str] = "general"
    tags: Optional[List[str]] = []
    author: Optional[str] = "Admin"
    is_published: bool = False

class BlogPostUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    excerpt: Optional[str] = None
    featured_image: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    author: Optional[str] = None
    is_published: Optional[bool] = None

class BlogPostResponse(BaseModel):
    id: str
    title: str
    slug: str
    content: str
    excerpt: Optional[str] = None
    featured_image: Optional[str] = None
    category: str
    tags: List[str]
    author: str
    is_published: bool
    views: int
    created_at: str
    updated_at: str
    published_at: Optional[str] = None

class BlogCategoryCreate(BaseModel):
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None

class BlogCategoryResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: Optional[str] = None
    post_count: int
    created_at: str


# ==================== HELPER FUNCTIONS ====================

def generate_slug(title: str) -> str:
    """Generate a URL-friendly slug from title"""
    import re
    slug = title.lower()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'[\s_]+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    slug = slug.strip('-')
    return slug


async def seed_blog_posts():
    """Seed initial blog posts if none exist"""
    count = await db.blog_posts.count_documents({})
    if count == 0:
        now = datetime.now(timezone.utc).isoformat()
        posts = [
            {
                "id": str(uuid.uuid4()),
                "title": "Consejos para Cuidar tu Ropa",
                "slug": "consejos-para-cuidar-tu-ropa",
                "content": """
                <h2>Mantén tu ropa como nueva</h2>
                <p>La forma en que lavas y cuidas tu ropa puede hacer una gran diferencia en su durabilidad. Aquí te dejamos algunos consejos esenciales:</p>
                
                <h3>1. Lee las etiquetas</h3>
                <p>Siempre revisa las instrucciones de cuidado antes de lavar cualquier prenda. Los símbolos te indican la temperatura adecuada y si la prenda puede ir a la secadora.</p>
                
                <h3>2. Separa por colores</h3>
                <p>Divide tu ropa en: blancos, colores claros, colores oscuros y prendas delicadas. Esto evita que los colores se transfieran.</p>
                
                <h3>3. No sobrecargues la lavadora</h3>
                <p>La ropa necesita espacio para moverse y limpiarse correctamente. Llena la lavadora hasta 3/4 de su capacidad.</p>
                
                <h3>4. Usa la cantidad correcta de detergente</h3>
                <p>Más detergente no significa ropa más limpia. El exceso puede dejar residuos y dañar las fibras.</p>
                """,
                "excerpt": "Descubre cómo mantener tu ropa en perfectas condiciones por más tiempo con estos consejos de expertos.",
                "featured_image": None,
                "category": "tips",
                "tags": ["cuidado de ropa", "lavandería", "consejos"],
                "author": "Ventura Fresh Laundry",
                "is_published": True,
                "views": 0,
                "created_at": now,
                "updated_at": now,
                "published_at": now
            },
            {
                "id": str(uuid.uuid4()),
                "title": "Beneficios del Servicio de Lavandería Profesional",
                "slug": "beneficios-servicio-lavanderia-profesional",
                "content": """
                <h2>Por qué elegir un servicio profesional</h2>
                <p>En el ajetreado mundo actual, el tiempo es oro. Descubre por qué cada vez más personas confían en servicios de lavandería profesional.</p>
                
                <h3>Ahorra tiempo valioso</h3>
                <p>El tiempo que gastas lavando, secando y doblando ropa puede invertirse en familia, trabajo o descanso.</p>
                
                <h3>Resultados superiores</h3>
                <p>El equipo profesional y los productos de calidad garantizan que tu ropa quede impecable.</p>
                
                <h3>Cuidado especializado</h3>
                <p>Las prendas delicadas reciben el tratamiento que necesitan sin riesgo de daño.</p>
                
                <h3>Comodidad total</h3>
                <p>Con nuestro servicio de recogida y entrega, no tienes que preocuparte por nada.</p>
                """,
                "excerpt": "Descubre cómo un servicio de lavandería profesional puede mejorar tu calidad de vida y cuidar mejor tu ropa.",
                "featured_image": None,
                "category": "servicios",
                "tags": ["servicios", "lavandería profesional", "beneficios"],
                "author": "Ventura Fresh Laundry",
                "is_published": True,
                "views": 0,
                "created_at": now,
                "updated_at": now,
                "published_at": now
            },
            {
                "id": str(uuid.uuid4()),
                "title": "Cómo Quitar Manchas Difíciles",
                "slug": "como-quitar-manchas-dificiles",
                "content": """
                <h2>Guía para eliminar manchas comunes</h2>
                <p>Las manchas pueden ser frustrantes, pero con las técnicas correctas puedes salvar tus prendas favoritas.</p>
                
                <h3>Manchas de vino tinto</h3>
                <p>Actúa rápido: aplica sal sobre la mancha para absorber el líquido, luego remoja en agua fría con detergente.</p>
                
                <h3>Manchas de grasa</h3>
                <p>Aplica talco o maicena para absorber la grasa, espera 30 minutos y lava normalmente con agua caliente.</p>
                
                <h3>Manchas de sangre</h3>
                <p>Siempre usa agua fría (nunca caliente) y remoja la prenda antes de lavar.</p>
                
                <h3>Manchas de café</h3>
                <p>Enjuaga inmediatamente con agua fría, aplica un poco de vinagre blanco y lava como de costumbre.</p>
                """,
                "excerpt": "Aprende técnicas efectivas para eliminar las manchas más difíciles de tu ropa.",
                "featured_image": None,
                "category": "tips",
                "tags": ["manchas", "limpieza", "consejos"],
                "author": "Ventura Fresh Laundry",
                "is_published": True,
                "views": 0,
                "created_at": now,
                "updated_at": now,
                "published_at": now
            }
        ]
        await db.blog_posts.insert_many(posts)
        
        # Create categories
        categories = [
            {"id": str(uuid.uuid4()), "name": "Tips", "slug": "tips", "description": "Consejos útiles para el cuidado de la ropa", "post_count": 2, "created_at": now},
            {"id": str(uuid.uuid4()), "name": "Servicios", "slug": "servicios", "description": "Información sobre nuestros servicios", "post_count": 1, "created_at": now},
            {"id": str(uuid.uuid4()), "name": "Noticias", "slug": "noticias", "description": "Noticias y actualizaciones de Ventura Fresh Laundry", "post_count": 0, "created_at": now}
        ]
        await db.blog_categories.insert_many(categories)


# ==================== BLOG POST ENDPOINTS ====================

@blog_router.get("/posts", response_model=List[BlogPostResponse])
async def list_posts(
    category: Optional[str] = None,
    tag: Optional[str] = None,
    published_only: bool = True,
    limit: int = 20,
    offset: int = 0
):
    """List all blog posts"""
    await seed_blog_posts()
    
    query = {}
    if published_only:
        query["is_published"] = True
    if category:
        query["category"] = category
    if tag:
        query["tags"] = tag
    
    posts = await db.blog_posts.find(query, {"_id": 0}).sort("created_at", -1).skip(offset).limit(limit).to_list(limit)
    return posts


@blog_router.get("/posts/{slug_or_id}", response_model=BlogPostResponse)
async def get_post(slug_or_id: str, increment_views: bool = True):
    """Get a blog post by slug or ID"""
    # Try to find by slug first, then by ID
    post = await db.blog_posts.find_one({"slug": slug_or_id}, {"_id": 0})
    if not post:
        post = await db.blog_posts.find_one({"id": slug_or_id}, {"_id": 0})
    
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Increment views
    if increment_views:
        await db.blog_posts.update_one(
            {"id": post["id"]},
            {"$inc": {"views": 1}}
        )
    
    return post


@blog_router.post("/posts", response_model=BlogPostResponse)
async def create_post(post: BlogPostCreate):
    """Create a new blog post (admin only)"""
    now = datetime.now(timezone.utc).isoformat()
    
    # Generate slug if not provided
    slug = post.slug or generate_slug(post.title)
    
    # Check if slug already exists
    existing = await db.blog_posts.find_one({"slug": slug})
    if existing:
        slug = f"{slug}-{str(uuid.uuid4())[:8]}"
    
    post_doc = {
        "id": str(uuid.uuid4()),
        "title": post.title,
        "slug": slug,
        "content": post.content,
        "excerpt": post.excerpt or post.content[:200] + "..." if len(post.content) > 200 else post.content,
        "featured_image": post.featured_image,
        "category": post.category or "general",
        "tags": post.tags or [],
        "author": post.author or "Admin",
        "is_published": post.is_published,
        "views": 0,
        "created_at": now,
        "updated_at": now,
        "published_at": now if post.is_published else None
    }
    
    await db.blog_posts.insert_one(post_doc)
    del post_doc["_id"]
    
    # Update category post count
    if post.is_published:
        await db.blog_categories.update_one(
            {"slug": post.category},
            {"$inc": {"post_count": 1}}
        )
    
    return post_doc


@blog_router.put("/posts/{post_id}", response_model=BlogPostResponse)
async def update_post(post_id: str, post: BlogPostUpdate):
    """Update a blog post (admin only)"""
    existing = await db.blog_posts.find_one({"id": post_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Post not found")
    
    update_data = {k: v for k, v in post.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # Handle publishing status change
    if "is_published" in update_data:
        if update_data["is_published"] and not existing.get("published_at"):
            update_data["published_at"] = datetime.now(timezone.utc).isoformat()
        
        # Update category counts
        if update_data["is_published"] and not existing.get("is_published"):
            await db.blog_categories.update_one(
                {"slug": existing.get("category")},
                {"$inc": {"post_count": 1}}
            )
        elif not update_data["is_published"] and existing.get("is_published"):
            await db.blog_categories.update_one(
                {"slug": existing.get("category")},
                {"$inc": {"post_count": -1}}
            )
    
    await db.blog_posts.update_one({"id": post_id}, {"$set": update_data})
    
    updated = await db.blog_posts.find_one({"id": post_id}, {"_id": 0})
    return updated


@blog_router.delete("/posts/{post_id}")
async def delete_post(post_id: str):
    """Delete a blog post (admin only)"""
    post = await db.blog_posts.find_one({"id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Update category count if post was published
    if post.get("is_published"):
        await db.blog_categories.update_one(
            {"slug": post.get("category")},
            {"$inc": {"post_count": -1}}
        )
    
    await db.blog_posts.delete_one({"id": post_id})
    return {"message": "Post deleted successfully"}


# ==================== CATEGORY ENDPOINTS ====================

@blog_router.get("/categories", response_model=List[BlogCategoryResponse])
async def list_categories():
    """List all blog categories"""
    await seed_blog_posts()
    categories = await db.blog_categories.find({}, {"_id": 0}).to_list(100)
    return categories


@blog_router.get("/categories/{slug}", response_model=BlogCategoryResponse)
async def get_category(slug: str):
    """Get a category by slug"""
    category = await db.blog_categories.find_one({"slug": slug}, {"_id": 0})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@blog_router.post("/categories", response_model=BlogCategoryResponse)
async def create_category(category: BlogCategoryCreate):
    """Create a new category (admin only)"""
    slug = category.slug or generate_slug(category.name)
    
    # Check if slug already exists
    existing = await db.blog_categories.find_one({"slug": slug})
    if existing:
        raise HTTPException(status_code=400, detail="Category with this slug already exists")
    
    category_doc = {
        "id": str(uuid.uuid4()),
        "name": category.name,
        "slug": slug,
        "description": category.description,
        "post_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.blog_categories.insert_one(category_doc)
    del category_doc["_id"]
    return category_doc


@blog_router.delete("/categories/{slug}")
async def delete_category(slug: str):
    """Delete a category (admin only)"""
    category = await db.blog_categories.find_one({"slug": slug})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Move posts from this category to "general"
    await db.blog_posts.update_many(
        {"category": slug},
        {"$set": {"category": "general"}}
    )
    
    await db.blog_categories.delete_one({"slug": slug})
    return {"message": "Category deleted successfully"}


# ==================== SEARCH ENDPOINT ====================

@blog_router.get("/search")
async def search_posts(q: str, limit: int = 10):
    """Search blog posts by title or content"""
    if not q or len(q) < 2:
        raise HTTPException(status_code=400, detail="Search query must be at least 2 characters")
    
    # Simple text search (for more advanced search, consider text indexes)
    query = {
        "$or": [
            {"title": {"$regex": q, "$options": "i"}},
            {"content": {"$regex": q, "$options": "i"}},
            {"tags": {"$regex": q, "$options": "i"}}
        ],
        "is_published": True
    }
    
    posts = await db.blog_posts.find(query, {"_id": 0}).limit(limit).to_list(limit)
    return posts
