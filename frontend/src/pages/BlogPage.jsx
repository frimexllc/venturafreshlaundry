import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { ArrowRight, ArrowLeft, Calendar, Tag, User, Eye, Search } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import { useLocale } from "../context/LocaleContext";

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Imagen por defecto para posts sin imagen destacada
const DEFAULT_POST_IMAGE = "https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=400&h=300&fit=crop"; // Imagen de lavandería

function BlogList() {
  const { t, locale } = useLocale();
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/blog/posts${selectedCategory ? `?category=${selectedCategory}` : ''}`).then(r => {
        if (!r.ok) throw new Error('Error fetching posts');
        return r.json();
      }),
      fetch(`${API_URL}/api/blog/categories`).then(r => {
        if (!r.ok) throw new Error('Error fetching categories');
        return r.json();
      })
    ])
      .then(([postsData, categoriesData]) => {
        setPosts(postsData);
        setCategories(categoriesData);
      })
      .catch(error => {
        console.error('Error loading blog data:', error);
      })
      .finally(() => setLoading(false));
  }, [selectedCategory]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/blog/search?q=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setPosts(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Formato de fecha según idioma
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Manejar error de carga de imagen
  const handleImageError = (e) => {
    e.target.src = DEFAULT_POST_IMAGE;
  };

  return (
    <>
      {/* Hero Section */}
      <section className="pt-24 pb-16 bg-gradient-to-b from-sky-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1
            className="text-4xl sm:text-5xl font-bold text-slate-900 mb-6 mt-12"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {t("Blog", "Blog")}
          </h1>
          <p className="text-xl text-sky-600 font-semibold mb-2">{t("Tips & News", "Consejos y Novedades")}</p>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            {t("Tips, tricks, and advice for your laundry care and more.", "Tips, trucos y consejos para el cuidado de tu ropa y más.")}
          </p>
        </div>
      </section>

      {/* Search and Categories */}
      <section className="py-8 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Search */}
            <div className="flex gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  placeholder={t("Search articles...", "Buscar artículos...")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-sky-500"
                  data-testid="blog-search"
                />
              </div>
              <Button onClick={handleSearch} className="bg-sky-600 hover:bg-sky-700 rounded-full">
                {t("Search", "Buscar")}
              </Button>
            </div>

            {/* Categories */}
            <div className="flex gap-2 flex-wrap justify-center">
              <button
                onClick={() => { setSelectedCategory(null); setSearchQuery(''); }}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  !selectedCategory ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {t("All", "Todos")}
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.slug}
                  onClick={() => { setSelectedCategory(cat.slug); setSearchQuery(''); }}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedCategory === cat.slug ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                  data-testid={`category-${cat.slug}`}
                >
                  {cat.name} ({cat.post_count})
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Blog Posts Grid */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12">
              <img 
                src={DEFAULT_POST_IMAGE} 
                alt="No articles" 
                className="h-24 w-24 rounded-full object-cover mx-auto mb-6 opacity-50"
                onError={handleImageError}
              />
              <h2 className="text-2xl font-bold text-slate-900 mb-4">{t("No articles available", "No hay artículos disponibles")}</h2>
              <p className="text-slate-600">{t("We're working on new content. Check back soon!", "Estamos trabajando en nuevo contenido. ¡Vuelve pronto!")}</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {posts.map((post) => (
                <article 
                  key={post.id} 
                  className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 hover:shadow-lg transition-shadow"
                  data-testid={`blog-post-${post.slug}`}
                >
                  <div className="aspect-video overflow-hidden bg-gradient-to-br from-sky-100 to-sky-50">
                    <img 
                      src={post.featured_image || DEFAULT_POST_IMAGE} 
                      alt={post.title}
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                      onError={handleImageError}
                    />
                  </div>
                  <div className="p-6">
                    <div className="flex items-center gap-4 text-sm text-slate-500 mb-3">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <time dateTime={post.created_at}>
                          {formatDate(post.created_at)}
                        </time>
                      </div>
                      <div className="flex items-center gap-1">
                        <Eye className="h-4 w-4" />
                        <span>{post.views}</span>
                      </div>
                    </div>
                    <span className="inline-block px-3 py-1 bg-sky-100 text-sky-700 text-xs font-medium rounded-full mb-3">
                      {post.category}
                    </span>
                    <h2 className="text-xl font-bold text-slate-900 mb-3">{post.title}</h2>
                    <p className="text-slate-600 mb-4 line-clamp-3">{post.excerpt}</p>
                    <Link to={`/blog/${post.slug}`}>
                      <Button variant="link" className="p-0 h-auto text-sky-600 hover:text-sky-700">
                        {t("Read More", "Leer Más")} <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Newsletter CTA */}
      <section className="py-16 bg-sky-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <img 
            src={DEFAULT_POST_IMAGE} 
            alt="Newsletter" 
            className="h-12 w-12 rounded-full object-cover mx-auto mb-4 opacity-80"
            onError={handleImageError}
          />
          <h2 className="text-3xl font-bold text-white mb-4">{t("Stay Informed", "Mantente Informado")}</h2>
          <p className="text-white/90 text-lg mb-8">
            {t("Subscribe to our newsletter to receive the latest tips and news.", "Suscríbete a nuestro boletín para recibir los últimos consejos y novedades.")}
          </p>
          <Link to="/contact">
            <Button className="bg-white text-sky-600 hover:bg-slate-100 rounded-full px-10 py-3 h-auto text-lg font-semibold">
              {t("Subscribe", "Suscribirme")}
            </Button>
          </Link>
        </div>
      </section>
    </>
  );
}

function BlogPost() {
  const { t, locale } = useLocale();
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/blog/posts/${slug}`)
      .then(res => {
        if (!res.ok) throw new Error('Post not found');
        return res.json();
      })
      .then(setPost)
      .catch(error => {
        console.error('Error loading post:', error);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleImageError = (e) => {
    e.target.src = DEFAULT_POST_IMAGE;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <img 
          src={DEFAULT_POST_IMAGE} 
          alt="Not found" 
          className="h-24 w-24 rounded-full object-cover mb-6 opacity-50"
          onError={handleImageError}
        />
        <h1 className="text-2xl font-bold text-slate-900 mb-4">{t("Article not found", "Artículo no encontrado")}</h1>
        <Link to="/blog">
          <Button className="bg-sky-600 hover:bg-sky-700 rounded-full">
            <ArrowLeft className="mr-2 h-4 w-4" /> {t("Back to Blog", "Volver al Blog")}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <article className="py-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link to="/blog" className="inline-flex items-center text-sky-600 hover:text-sky-700 mb-8">
          <ArrowLeft className="mr-2 h-4 w-4" /> {t("Back to Blog", "Volver al Blog")}
        </Link>

        <header className="mb-8">
          <span className="inline-block px-4 py-1 bg-sky-100 text-sky-700 text-sm font-medium rounded-full mb-4">
            {post.category}
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>
            {post.title}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-slate-500">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>{post.author}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <time dateTime={post.created_at}>
                {formatDate(post.created_at)}
              </time>
            </div>
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              <span>{post.views} {t("views", "vistas")}</span>
            </div>
          </div>
        </header>

        {post.featured_image && (
          <div className="aspect-video rounded-2xl overflow-hidden mb-8">
            <img 
              src={post.featured_image} 
              alt={post.title} 
              className="w-full h-full object-cover"
              onError={handleImageError}
            />
          </div>
        )}

        <div 
          className="prose prose-lg max-w-none prose-headings:font-bold prose-headings:text-slate-900 prose-p:text-slate-600 prose-a:text-sky-600"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {post.tags && post.tags.length > 0 && (
          <div className="mt-8 pt-8 border-t border-slate-200">
            <div className="flex items-center gap-2 flex-wrap">
              <Tag className="h-5 w-5 text-slate-400" />
              {post.tags.map((tag) => (
                <span key={tag} className="px-3 py-1 bg-slate-100 text-slate-600 text-sm rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-12 p-8 bg-sky-50 rounded-2xl text-center">
          <h3 className="text-xl font-bold text-slate-900 mb-2">{t("Enjoyed this article?", "¿Te gustó este artículo?")}</h3>
          <p className="text-slate-600 mb-4">
            {t("Share it with your friends or contact us for more information.", "Compártelo con tus amigos o contáctanos para más información.")}
          </p>
          <Link to="/contact">
            <Button className="bg-sky-600 hover:bg-sky-700 rounded-full">
              {t("Contact Us", "Contáctanos")}
            </Button>
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function BlogPage() {
  const { slug } = useParams();

  return (
    <div className="min-h-screen bg-white">
      <PublicNav />
      {slug ? <BlogPost /> : <BlogList />}
      <PublicFooter />
    </div>
  );
}