import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, ArrowLeft, Calendar, Tag, User, Eye, Search, Sparkles, ChevronDown } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import { useLocale } from "../context/LocaleContext";

const API_URL = process.env.REACT_APP_BACKEND_URL;
const DEFAULT_POST_IMAGE = "https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=800&h=600&fit=crop";

// ─── IntersectionObserver hook ────────────────────────────────────────────────
function useInView(threshold = 0.1) {
  const ref = useRef(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, v];
}

// ─── Reveal ───────────────────────────────────────────────────────────────────
const ORIGINS = {
  up:    "opacity-0 translate-y-10",
  left:  "opacity-0 translate-x-8",
  right: "opacity-0 -translate-x-8",
  scale: "opacity-0 scale-95",
  blur:  "opacity-0 blur-sm scale-97",
};
const Reveal = ({ children, delay = 0, dir = "up", dur = 700, className = "" }) => {
  const [ref, v] = useInView();
  return (
    <div ref={ref} className={`${className} transition-all ease-out ${v ? "opacity-100 translate-y-0 translate-x-0 scale-100 blur-0" : ORIGINS[dir]}`}
      style={{ transitionDuration: `${dur}ms`, transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
};

// ─── Magnetic wrapper ─────────────────────────────────────────────────────────
const Mag = ({ children, className = "", strength = 0.32, as: Tag = "div", ...p }) => {
  const ref = useRef(null);
  const onMove = useCallback((e) => {
    const r = ref.current.getBoundingClientRect();
    ref.current.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * strength}px,${(e.clientY - r.top - r.height / 2) * strength}px)`;
  }, [strength]);
  const onLeave = useCallback(() => { ref.current.style.transform = "translate(0,0)"; }, []);
  return (
    <Tag ref={ref} className={className}
      style={{ transition: "transform 500ms cubic-bezier(0.34,1.56,0.64,1)" }}
      onMouseMove={onMove} onMouseLeave={onLeave} {...p}>
      {children}
    </Tag>
  );
};

// ─── 3-D Tilt ────────────────────────────────────────────────────────────────
const Tilt = ({ children, className = "", depth = 5 }) => {
  const ref = useRef(null);
  const [s, setS] = useState({});
  const onMove = useCallback((e) => {
    const r = ref.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * depth * 2;
    const y = ((e.clientY - r.top) / r.height - 0.5) * -depth * 2;
    setS({ transform: `perspective(900px) rotateX(${y}deg) rotateY(${x}deg) translateZ(6px)`, transition: "transform 80ms linear" });
  }, [depth]);
  const onLeave = useCallback(() => setS({ transform: "perspective(900px) rotateX(0) rotateY(0) translateZ(0)", transition: "transform 600ms cubic-bezier(0.34,1.56,0.64,1)" }), []);
  return <div ref={ref} style={s} className={className} onMouseMove={onMove} onMouseLeave={onLeave}>{children}</div>;
};

// ─── Custom Cursor ────────────────────────────────────────────────────────────
function useCursor() {
  const ring = useRef(null); const dot = useRef(null);
  const p = useRef({ x: -200, y: -200 }); const l = useRef({ x: -200, y: -200 }); const raf = useRef(null);
  useEffect(() => {
    const fn = (e) => { p.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", fn, { passive: true });
    const loop = () => {
      l.current.x += (p.current.x - l.current.x) * 0.1;
      l.current.y += (p.current.y - l.current.y) * 0.1;
      if (ring.current) ring.current.style.transform = `translate(${l.current.x - 18}px,${l.current.y - 18}px)`;
      if (dot.current)  dot.current.style.transform  = `translate(${p.current.x - 3}px,${p.current.y - 3}px)`;
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => { window.removeEventListener("mousemove", fn); cancelAnimationFrame(raf.current); };
  }, []);
  return { ring, dot };
}

// ─── Marquee ─────────────────────────────────────────────────────────────────
const Marquee = ({ items }) => (
  <div className="overflow-hidden py-3 border-y border-primary/10 bg-sky-50/50">
    <div className="flex gap-12 whitespace-nowrap" style={{ animation: "mq 30s linear infinite" }}>
      {[...items, ...items, ...items].map((it, i) => (
        <span key={i} className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary/45 flex items-center gap-3">
          <span className="w-1 h-1 rounded-full bg-primary/30 inline-block" />{it}
        </span>
      ))}
    </div>
  </div>
);

// ─── Post Card ────────────────────────────────────────────────────────────────
const PostCard = ({ post, formatDate, delay }) => {
  const [h, setH] = useState(false);
  return (
    <Reveal delay={delay} dir="up" dur={750}>
      <Tilt depth={4}>
        <article
          className={`relative bg-white rounded-2xl overflow-hidden h-full flex flex-col border transition-all duration-350
            ${h ? "border-primary/25 shadow-2xl shadow-sky-100/60 -translate-y-1" : "border-slate-100 shadow-lg"}`}
          onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
          data-testid={`blog-post-${post.slug}`}>

          {/* top accent line */}
          <div className={`absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-primary to-transparent transition-opacity duration-500 z-10 ${h ? "opacity-100" : "opacity-0"}`} />

          {/* Image */}
          <div className="aspect-video overflow-hidden relative">
            <img
              src={post.featured_image || DEFAULT_POST_IMAGE}
              alt={post.title}
              className={`w-full h-full object-cover transition-transform duration-600 ${h ? "scale-108" : "scale-100"}`}
              onError={e => { e.target.src = DEFAULT_POST_IMAGE; }}
            />
            <div className={`absolute inset-0 bg-gradient-to-t from-slate-900/30 to-transparent transition-opacity duration-400 ${h ? "opacity-100" : "opacity-0"}`} />
            {/* Category badge floating on image */}
            <div className="absolute bottom-3 left-4">
              <span className="px-3 py-1 bg-white/90 backdrop-blur-sm text-primary text-[10px] font-black uppercase tracking-widest rounded-full shadow-sm">
                {post.category}
              </span>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 flex flex-col flex-grow relative">
            <div className={`absolute inset-0 bg-gradient-to-br from-sky-50/50 to-transparent transition-opacity duration-500 ${h ? "opacity-100" : "opacity-0"}`} />

            {/* Meta */}
            <div className="relative flex items-center gap-4 text-xs text-slate-400 mb-3">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                <time dateTime={post.created_at}>{formatDate(post.created_at)}</time>
              </span>
              <span className="flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5" />
                {post.views}
              </span>
            </div>

            <h2 className={`relative text-xl font-bold mb-2 leading-snug transition-colors duration-200 ${h ? "text-primary" : "text-slate-900"}`}>
              {post.title}
            </h2>
            <p className="relative text-slate-500 text-sm leading-relaxed line-clamp-3 flex-grow mb-5">
              {post.excerpt}
            </p>

            <Link to={`/blog/${post.slug}`} className="relative mt-auto">
              <div className={`inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider transition-colors duration-200 ${h ? "text-primary" : "text-sky-500"}`}>
                <span>Read more</span>
                <ArrowRight className={`h-4 w-4 transition-transform duration-200 ${h ? "translate-x-1" : ""}`} />
              </div>
            </Link>
          </div>
        </article>
      </Tilt>
    </Reveal>
  );
};

// ─── BLOG LIST ────────────────────────────────────────────────────────────────
function BlogList() {
  const { t, locale } = useLocale();
  const { ring, dot } = useCursor();
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [scrollY, setScrollY] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    let tick = false;
    const fn = () => { if (!tick) { requestAnimationFrame(() => { setScrollY(window.pageYOffset); tick = false; }); tick = true; } };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API_URL}/api/blog/posts${selectedCategory ? `?category=${selectedCategory}` : ""}`).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch(`${API_URL}/api/blog/categories`).then(r => { if (!r.ok) throw new Error(); return r.json(); })
    ])
      .then(([p, c]) => { setPosts(p); setCategories(c); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedCategory]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/blog/search?q=${encodeURIComponent(searchQuery)}`);
      if (!r.ok) throw new Error();
      setPosts(await r.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const formatDate = (d) => new Date(d).toLocaleDateString(locale === "es" ? "es-ES" : "en-US", { year: "numeric", month: "long", day: "numeric" });

  const marqueeItems = [
    t("Blog", "Blog"), t("Laundry Tips", "Consejos de Lavandería"),
    t("News", "Novedades"), t("How-To Guides", "Guías Prácticas"),
    t("Ventura Fresh", "Ventura Fresh"), t("Fresh Content", "Contenido Fresco"),
  ];

  return (<>
    {/* Cursor */}
    <div className="pointer-events-none fixed inset-0 z-[9999] hidden lg:block">
      <div ref={ring} className="absolute w-9 h-9 rounded-full border border-primary/50 will-change-transform" style={{ top: 0, left: 0 }} />
      <div ref={dot}  className="absolute w-1.5 h-1.5 rounded-full bg-primary will-change-transform" style={{ top: 0, left: 0 }} />
    </div>

    {/* ══ HERO ══════════════════════════════════════════════════════════ */}
    <section className="relative min-h-[65vh] flex items-end justify-center overflow-hidden">
      <div className="absolute inset-0 will-change-transform"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1455390582262-044cdead277a?w=1920&h=1080&fit=crop')", backgroundSize: "cover", backgroundPosition: "center", transform: `translateY(${scrollY * 0.22}px) scale(1.08)` }} />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/92 via-slate-900/60 to-slate-800/25" />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,0.5) 100%)" }} />
      <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: "repeating-linear-gradient(0deg,#000 0px,#000 1px,transparent 1px,transparent 4px)" }} />

      <div className="relative z-10 text-center px-6 pb-20 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/8 backdrop-blur-md border border-white/15 mb-7"
          style={{ animation: "fadeUp 0.8s 0.1s both ease-out" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[11px] text-white/75 font-bold uppercase tracking-[0.18em]">{t("Tips & News", "Consejos y Novedades")}</span>
        </div>
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-light text-white leading-[1.05]  mb-4 tracking-tight"
          style={{ animation: "fadeUp 0.9s 0.25s both ease-out" }}>
          {t("Stories &", "Historias y")}
          <span className="block" style={{ WebkitTextStroke: "1.5px rgba(255,255,255,0.8)", color: "transparent" }}>
            {t("insights.", "consejos.")}
          </span>
        </h1>
        <p className="text-lg sm:text-xl text-white/70 max-w-xl mx-auto" style={{ animation: "fadeUp 0.9s 0.4s both ease-out" }}>
          {t("Tips, tricks, and advice for your laundry care and more.", "Tips, trucos y consejos para el cuidado de tu ropa y más.")}
        </p>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-20">
        <svg viewBox="0 0 1440 90" preserveAspectRatio="none" className="w-full h-12 sm:h-16 lg:h-20">
          <path d="M0,45 C300,0 600,90 1440,45 L1440,90 L0,90 Z" fill="white" />
        </svg>
      </div>
    </section>

    {/* ══ MARQUEE ═══════════════════════════════════════════════════════ */}
    <Marquee items={marqueeItems} />

    {/* ══ SEARCH + FILTER BAR ═══════════════════════════════════════════ */}
    <section className="py-10 bg-white border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
        <div className="flex flex-col md:flex-row gap-5 items-center justify-between">
          {/* Search */}
          <div className="flex gap-2 w-full md:w-auto">
            <div className={`relative flex-1 md:w-80 transition-all duration-300 ${searchFocused ? "md:w-96" : ""}`}>
              <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200 ${searchFocused ? "text-primary" : "text-slate-400"}`} />
              <input
                type="text"
                placeholder={t("Search articles...", "Buscar artículos...")}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-full text-sm focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all duration-300 bg-slate-50 focus:bg-white"
                data-testid="blog-search"
              />
            </div>
            <button onClick={handleSearch}
              className="group flex items-center gap-1.5 px-5 py-2.5 bg-primary text-white rounded-full text-sm font-bold uppercase tracking-wider shadow-md shadow-primary/20 hover:bg-primary/90 hover:shadow-lg transition-all duration-300 active:scale-95 overflow-hidden relative">
              <span className="relative z-10">{t("Search", "Buscar")}</span>
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            </button>
          </div>

          {/* Categories */}
          <div className="flex gap-2 flex-wrap justify-center">
            <button
              onClick={() => { setSelectedCategory(null); setSearchQuery(""); }}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-200 ${!selectedCategory ? "bg-primary text-white shadow-md shadow-primary/20" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {t("All", "Todos")}
            </button>
            {categories.map(cat => (
              <button key={cat.slug}
                onClick={() => { setSelectedCategory(cat.slug); setSearchQuery(""); }}
                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-200 ${selectedCategory === cat.slug ? "bg-primary text-white shadow-md shadow-primary/20" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                data-testid={`category-${cat.slug}`}>
                {cat.name} <span className="opacity-60">({cat.post_count})</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>

    {/* ══ POSTS GRID ════════════════════════════════════════════════════ */}
    <section className="py-20 sm:py-24 relative overflow-hidden bg-white">
      <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1545173168-9f1947eebb7f?w=1920&h=1080&fit=crop')", backgroundSize: "cover", backgroundPosition: "center", transform: `translateY(${scrollY * 0.08}px)` }} />
      <div className="relative z-10 max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">
        <Reveal dir="blur">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-primary/50 mb-3">{t("Latest Posts", "Últimos Artículos")}</p>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 text-center mb-12 leading-tight">
            {t("Fresh", "Contenido")}
            <em className="block text-primary font-extralight not-">{t("content.", "fresco.")}</em>
          </h2>
        </Reveal>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <Reveal dir="scale">
            <div className="text-center py-20">
              <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Search className="h-9 w-9 text-slate-300" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-3">{t("No articles available", "No hay artículos disponibles")}</h3>
              <p className="text-slate-400 max-w-sm mx-auto">{t("We're working on new content. Check back soon!", "Estamos trabajando en nuevo contenido. ¡Vuelve pronto!")}</p>
            </div>
          </Reveal>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post, i) => (
              <PostCard key={post.id} post={post} formatDate={date => new Date(date).toLocaleDateString(locale === "es" ? "es-ES" : "en-US", { year: "numeric", month: "long", day: "numeric" })} delay={i * 90} />
            ))}
          </div>
        )}
      </div>
    </section>

    {/* ══ DARK CTA / NEWSLETTER ═════════════════════════════════════════ */}
    <section className="relative py-28 overflow-hidden">
      <div className="absolute inset-0 will-change-transform"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?w=1920&h=1080&fit=crop')", backgroundSize: "cover", backgroundPosition: "center", transform: `translateY(${scrollY * 0.18}px) scale(1.1)` }} />
      <div className="absolute inset-0 bg-gradient-to-br from-sky-950/92 to-sky-900/88" />
      <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.8) 1px,transparent 1px)", backgroundSize: "28px 28px" }} />

      <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
        <Reveal dir="scale" dur={900}>
          <div>
            <Sparkles className="w-7 h-7 text-sky-400/60 mx-auto mb-5" />
            <h2 className="text-4xl sm:text-5xl font-bold text-white  mb-4 leading-tight">
              {t("Stay", "Mantente")}
              <span className="block font-extralight">{t("Informed.", "Informado.")}</span>
            </h2>
            <div className="w-16 h-px bg-gradient-to-r from-transparent via-primary to-transparent mx-auto mb-6" />
            <p className="text-white/60 text-lg mb-10">
              {t("Subscribe to receive the latest tips and news about laundry care.", "Suscríbete para recibir los últimos consejos y novedades sobre el cuidado de tu ropa.")}
            </p>
            <Link to="/contact">
              <Mag as="div" strength={0.25}
                className="inline-flex items-center gap-2 overflow-hidden relative bg-white text-primary rounded-full px-10 py-4 text-[13px] font-bold uppercase tracking-widest shadow-xl cursor-pointer hover:-translate-y-0.5 transition-transform duration-300 active:scale-95 group">
                <span className="relative z-10 flex items-center gap-2">
                  ✉️ {t("Subscribe Now", "Suscribirme Ahora")}
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                </span>
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/8 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              </Mag>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  </>);
}

// ─── BLOG POST (single) ───────────────────────────────────────────────────────
function BlogPost() {
  const { t, locale } = useLocale();
  const { slug } = useParams();
  const { ring, dot } = useCursor();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    let tick = false;
    const fn = () => { if (!tick) { requestAnimationFrame(() => { setScrollY(window.pageYOffset); tick = false; }); tick = true; } };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/api/blog/posts/${slug}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setPost).catch(console.error).finally(() => setLoading(false));
  }, [slug]);

  const formatDate = (d) => new Date(d).toLocaleDateString(locale === "es" ? "es-ES" : "en-US", { year: "numeric", month: "long", day: "numeric" });

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
    </div>
  );

  if (!post) return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 bg-white">
      <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mb-6">
        <Search className="h-9 w-9 text-slate-300" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-3">{t("Article not found", "Artículo no encontrado")}</h1>
      <p className="text-slate-400 mb-8">{t("The article you're looking for doesn't exist.", "El artículo que buscas no existe.")}</p>
      <Link to="/blog">
        <Mag as="div" strength={0.25} className="inline-flex items-center gap-2 bg-primary text-white rounded-full px-8 py-3.5 text-sm font-bold uppercase tracking-wider shadow-lg shadow-primary/25 cursor-pointer hover:-translate-y-0.5 transition-transform duration-300 active:scale-95">
          <ArrowLeft className="h-4 w-4" /> {t("Back to Blog", "Volver al Blog")}
        </Mag>
      </Link>
    </div>
  );

  return (<>
    {/* Cursor */}
    <div className="pointer-events-none fixed inset-0 z-[9999] hidden lg:block">
      <div ref={ring} className="absolute w-9 h-9 rounded-full border border-primary/50 will-change-transform" style={{ top: 0, left: 0 }} />
      <div ref={dot}  className="absolute w-1.5 h-1.5 rounded-full bg-primary will-change-transform" style={{ top: 0, left: 0 }} />
    </div>

    {/* ── Post Hero ── */}
    {post.featured_image && (
      <section className="relative h-[55vh] flex items-end justify-center overflow-hidden">
        <div className="absolute inset-0 will-change-transform"
          style={{ backgroundImage: `url('${post.featured_image}')`, backgroundSize: "cover", backgroundPosition: "center", transform: `translateY(${scrollY * 0.2}px) scale(1.08)` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-900/60 to-slate-800/20" />

        <div className="relative z-10 px-6 pb-16 max-w-4xl mx-auto w-full">
          <Link to="/blog" className="inline-flex items-center gap-2 text-white/60 hover:text-white text-sm font-medium mb-6 transition-colors duration-200 group">
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
            {t("Back to Blog", "Volver al Blog")}
          </Link>
          <div className="inline-flex items-center gap-2 mb-4">
            <span className="px-3 py-1 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-full">
              {post.category}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-5"
            style={{ fontFamily: "'Playfair Display', serif" }}>
            {post.title}
          </h1>
          <div className="flex flex-wrap items-center gap-5 text-white/55 text-sm">
            <span className="flex items-center gap-1.5"><User className="h-4 w-4" />{post.author}</span>
            <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /><time dateTime={post.created_at}>{formatDate(post.created_at)}</time></span>
            <span className="flex items-center gap-1.5"><Eye className="h-4 w-4" />{post.views} {t("views", "vistas")}</span>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-20">
          <svg viewBox="0 0 1440 60" preserveAspectRatio="none" className="w-full h-8 sm:h-12">
            <path d="M0,30 C300,0 600,60 1440,30 L1440,60 L0,60 Z" fill="white" />
          </svg>
        </div>
      </section>
    )}

    {/* ── Post Content ── */}
    <article className={`${post.featured_image ? "py-16" : "pt-32 pb-16"} relative`}>
      {!post.featured_image && (
        <div className="max-w-4xl mx-auto px-6 mb-10">
          <Link to="/blog" className="inline-flex items-center gap-2 text-slate-400 hover:text-primary text-sm font-medium mb-8 transition-colors duration-200 group">
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
            {t("Back to Blog", "Volver al Blog")}
          </Link>
          <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded-full mb-5">{post.category}</span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 mb-6 leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>{post.title}</h1>
          <div className="flex flex-wrap items-center gap-5 text-slate-400 text-sm mb-8">
            <span className="flex items-center gap-1.5"><User className="h-4 w-4" />{post.author}</span>
            <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /><time>{formatDate(post.created_at)}</time></span>
            <span className="flex items-center gap-1.5"><Eye className="h-4 w-4" />{post.views} {t("views", "vistas")}</span>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-6 sm:px-8">
        <Reveal dir="up">
          <div
            className="prose prose-lg max-w-none prose-headings:font-bold prose-headings:text-slate-900 prose-p:text-slate-600 prose-p:leading-relaxed prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-img:rounded-2xl prose-blockquote:border-l-primary prose-blockquote:text-slate-500"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        </Reveal>

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <Reveal delay={100} dir="up">
            <div className="mt-10 pt-8 border-t border-slate-100 flex items-center gap-3 flex-wrap">
              <Tag className="h-4 w-4 text-slate-400" />
              {post.tags.map(tag => (
                <span key={tag} className="px-3 py-1.5 bg-slate-100 hover:bg-primary/10 hover:text-primary text-slate-600 text-xs font-semibold rounded-full transition-colors duration-200 cursor-default">
                  {tag}
                </span>
              ))}
            </div>
          </Reveal>
        )}

        {/* CTA Card */}
        <Reveal delay={180} dir="scale">
          <div className="mt-14 relative overflow-hidden bg-gradient-to-br from-sky-950 to-sky-900 rounded-2xl p-8 text-center">
            <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.8) 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
            <div className="absolute top-0 left-10 right-10 h-px bg-gradient-to-r from-transparent via-sky-400/50 to-transparent" />
            <Sparkles className="w-6 h-6 text-sky-400/60 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">{t("Enjoyed this article?", "¿Te gustó este artículo?")}</h3>
            <p className="text-white/55 text-sm mb-7">
              {t("Share it with your friends or contact us for more information.", "Compártelo con tus amigos o contáctanos para más información.")}
            </p>
            <div className="flex items-center justify-center flex-wrap gap-4">
              <Link to="/contact">
                <Mag as="div" strength={0.22} className="inline-flex items-center gap-2 bg-primary text-white rounded-full px-7 py-3 text-sm font-bold uppercase tracking-wider shadow-lg shadow-primary/30 cursor-pointer hover:-translate-y-0.5 transition-transform duration-300 active:scale-95">
                  {t("Contact Us", "Contáctanos")} <ArrowRight className="w-4 h-4" />
                </Mag>
              </Link>
              <Link to="/blog">
                <Mag as="div" strength={0.22} className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white rounded-full px-7 py-3 text-sm font-bold uppercase tracking-wider cursor-pointer hover:-translate-y-0.5 hover:bg-white/15 transition-all duration-300 active:scale-95">
                  <ArrowLeft className="w-4 h-4" /> {t("More Articles", "Más Artículos")}
                </Mag>
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </article>
  </>);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function BlogPage() {
  const { slug } = useParams();

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
        @keyframes mq { from { transform:translateX(0) } to { transform:translateX(-33.333%) } }
      `}</style>
      <PublicNav />
      {slug ? <BlogPost /> : <BlogList />}
      <PublicFooter />
    </div>
  );
}