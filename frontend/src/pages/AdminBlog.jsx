import { useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { BookOpen, Plus, Edit2, Trash2, Search, Eye, EyeOff, X, Tag } from "lucide-react";
import { toast } from "sonner";

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function AdminBlog() {
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('posts');
  const [showModal, setShowModal] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    excerpt: '',
    category: 'tips',
    tags: '',
    author: 'Ventura Fresh Laundry',
    is_published: false
  });

  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: ''
  });
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [postsRes, categoriesRes] = await Promise.all([
        fetch(`${API_URL}/api/blog/posts?published_only=false`),
        fetch(`${API_URL}/api/blog/categories`)
      ]);
      setPosts(await postsRes.json());
      setCategories(await categoriesRes.json());
    } catch (error) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const url = editingPost 
        ? `${API_URL}/api/blog/posts/${editingPost.id}`
        : `${API_URL}/api/blog/posts`;
      
      const payload = {
        ...formData,
        tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean)
      };

      const res = await fetch(url, {
        method: editingPost ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success(editingPost ? 'Post actualizado' : 'Post creado');
        setShowModal(false);
        resetForm();
        loadData();
      } else {
        toast.error('Error al guardar post');
      }
    } catch (error) {
      toast.error('Error de conexión');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este post?')) return;
    try {
      const res = await fetch(`${API_URL}/api/blog/posts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Post eliminado');
        loadData();
      }
    } catch (error) {
      toast.error('Error al eliminar');
    }
  };

  const togglePublished = async (post) => {
    try {
      const res = await fetch(`${API_URL}/api/blog/posts/${post.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_published: !post.is_published })
      });
      if (res.ok) {
        toast.success(post.is_published ? 'Post despublicado' : 'Post publicado');
        loadData();
      }
    } catch (error) {
      toast.error('Error al actualizar');
    }
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/blog/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categoryForm)
      });
      if (res.ok) {
        toast.success('Categoría creada');
        setShowCategoryModal(false);
        setCategoryForm({ name: '', description: '' });
        loadData();
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Error al crear categoría');
      }
    } catch (error) {
      toast.error('Error de conexión');
    }
  };

  const handleDeleteCategory = async (slug) => {
    if (!confirm('¿Eliminar esta categoría? Los posts se moverán a "general"')) return;
    try {
      const res = await fetch(`${API_URL}/api/blog/categories/${slug}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Categoría eliminada');
        loadData();
      }
    } catch (error) {
      toast.error('Error al eliminar');
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      excerpt: '',
      category: 'tips',
      tags: '',
      author: 'Ventura Fresh Laundry',
      is_published: false
    });
    setEditingPost(null);
  };

  const openEdit = (post) => {
    setEditingPost(post);
    setFormData({
      title: post.title,
      content: post.content,
      excerpt: post.excerpt || '',
      category: post.category,
      tags: post.tags?.join(', ') || '',
      author: post.author,
      is_published: post.is_published
    });
    setShowModal(true);
  };

  const filteredPosts = posts.filter(p => 
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gestión de Blog</h1>
          <p className="text-slate-600">Administra posts y categorías del blog</p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'posts' && (
            <Button onClick={() => { resetForm(); setShowModal(true); }} className="bg-sky-600 hover:bg-sky-700" data-testid="add-post-btn">
              <Plus className="h-4 w-4 mr-2" /> Nuevo Post
            </Button>
          )}
          {activeTab === 'categories' && (
            <Button onClick={() => setShowCategoryModal(true)} className="bg-sky-600 hover:bg-sky-700" data-testid="add-category-btn">
              <Plus className="h-4 w-4 mr-2" /> Nueva Categoría
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('posts')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'posts' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <BookOpen className="h-4 w-4 inline mr-2" />
          Posts ({posts.length})
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'categories' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Tag className="h-4 w-4 inline mr-2" />
          Categorías ({categories.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
        </div>
      ) : activeTab === 'posts' ? (
        <>
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar posts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Posts Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Título</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Categoría</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Autor</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Vistas</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Estado</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPosts.map((post) => (
                    <tr key={post.id} data-testid={`admin-post-${post.id}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 line-clamp-1">{post.title}</div>
                        <div className="text-xs text-slate-500">{post.slug}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">
                          {post.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">{post.author}</td>
                      <td className="px-4 py-3 text-sm">{post.views}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => togglePublished(post)}
                          className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${
                            post.is_published ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {post.is_published ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                          {post.is_published ? 'Publicado' : 'Borrador'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {new Date(post.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(post)} className="p-1 text-slate-400 hover:text-sky-600">
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDelete(post.id)} className="p-1 text-slate-400 hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Categories Grid */
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <div key={cat.slug} className="bg-white rounded-xl border border-slate-200 p-4" data-testid={`admin-category-${cat.slug}`}>
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-slate-900">{cat.name}</h3>
                <button onClick={() => handleDeleteCategory(cat.slug)} className="p-1 text-slate-400 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <p className="text-sm text-slate-600 mb-2">{cat.description || 'Sin descripción'}</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">/{cat.slug}</span>
                <span className="px-2 py-1 bg-sky-100 text-sky-700 rounded-full text-xs">
                  {cat.post_count} posts
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Post Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">{editingPost ? 'Editar Post' : 'Nuevo Post'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="title">Título</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="excerpt">Extracto</Label>
                <textarea
                  id="excerpt"
                  value={formData.excerpt}
                  onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  rows={2}
                  placeholder="Breve descripción del post..."
                />
              </div>
              <div>
                <Label htmlFor="content">Contenido (HTML)</Label>
                <textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-sm"
                  rows={10}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category">Categoría</Label>
                  <select
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  >
                    {categories.map(cat => (
                      <option key={cat.slug} value={cat.slug}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="author">Autor</Label>
                  <Input
                    id="author"
                    value={formData.author}
                    onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="tags">Tags (separados por coma)</Label>
                <Input
                  id="tags"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="lavandería, tips, consejos"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_published"
                  checked={formData.is_published}
                  onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
                  className="rounded border-slate-300"
                />
                <Label htmlFor="is_published" className="cursor-pointer">Publicar inmediatamente</Label>
              </div>
              <div className="flex gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)} className="flex-1">
                  Cancelar
                </Button>
                <Button type="submit" className="flex-1 bg-sky-600 hover:bg-sky-700">
                  {editingPost ? 'Actualizar' : 'Crear'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCategoryModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Nueva Categoría</h2>
              <button onClick={() => setShowCategoryModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateCategory} className="space-y-4">
              <div>
                <Label htmlFor="cat_name">Nombre</Label>
                <Input
                  id="cat_name"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="cat_desc">Descripción</Label>
                <textarea
                  id="cat_desc"
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  rows={2}
                />
              </div>
              <div className="flex gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setShowCategoryModal(false)} className="flex-1">
                  Cancelar
                </Button>
                <Button type="submit" className="flex-1 bg-sky-600 hover:bg-sky-700">
                  Crear
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
