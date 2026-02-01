import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { BookOpen, ArrowRight, Calendar } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";

// Sample blog posts - in a real app, these would come from the backend
const blogPosts = [
  {
    id: 1,
    title: "On Letting Go",
    excerpt: "Sometimes the hardest part of moving forward is learning to let go of the things that hold us back. Here are some tips for decluttering your life and your laundry routine.",
    date: "2026-01-15",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=600&fit=crop"
  },
  {
    id: 2,
    title: "Setting Boundaries",
    excerpt: "Setting boundaries is essential for a healthy work-life balance. Learn how outsourcing tasks like laundry can help you reclaim your time.",
    date: "2026-01-08",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=600&fit=crop"
  },
  {
    id: 3,
    title: "It's Okay to Fail",
    excerpt: "Failure is a natural part of growth. Whether it's a stain that won't come out or a new routine that didn't stick, here's why it's okay to fail.",
    date: "2025-12-20",
    image: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&h=600&fit=crop"
  },
  {
    id: 4,
    title: "Toxic Relationships",
    excerpt: "Recognizing and leaving toxic relationships is crucial for your well-being. We explore how to identify what's not working in your life.",
    date: "2025-12-10",
    image: "https://images.unsplash.com/photo-1516302752625-fcc3c50ae61f?w=800&h=600&fit=crop"
  },
  {
    id: 5,
    title: "Change for the Better",
    excerpt: "Change is inevitable, but it can also be transformative. Discover how small changes in your daily routine can lead to big improvements.",
    date: "2025-11-28",
    image: "https://images.unsplash.com/photo-1493612276216-ee3925520721?w=800&h=600&fit=crop"
  },
  {
    id: 6,
    title: "Say Yes",
    excerpt: "Sometimes saying yes opens doors you never knew existed. Here's why embracing new experiences can lead to a more fulfilling life.",
    date: "2025-11-15",
    image: "https://images.unsplash.com/photo-1513128034602-7814ccadece4?w=800&h=600&fit=crop"
  }
];

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicNav />

      {/* Hero Section */}
      <section className="pt-24 pb-16 bg-gradient-to-b from-sky-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>
            Blog
          </h1>
          <p className="text-xl text-sky-600 font-semibold mb-2">Clean Insights & Fresh Ideas</p>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Tips, tricks, and lessons to make your workdays smoother, your business operations easier, and your personal growth effortless.
          </p>
        </div>
      </section>

      {/* Blog Posts Grid */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {blogPosts.map((post) => (
              <article 
                key={post.id} 
                className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 hover:shadow-lg transition-shadow"
              >
                <div className="aspect-video overflow-hidden">
                  <img 
                    src={post.image} 
                    alt={post.title}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
                    <Calendar className="h-4 w-4" />
                    <time dateTime={post.date}>
                      {new Date(post.date).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </time>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mb-3">{post.title}</h2>
                  <p className="text-slate-600 mb-4 line-clamp-3">{post.excerpt}</p>
                  <Button variant="link" className="p-0 h-auto text-sky-600 hover:text-sky-700">
                    Read More <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter CTA */}
      <section className="py-16 bg-sky-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <BookOpen className="h-12 w-12 text-white/80 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-white mb-4">Stay Updated</h2>
          <p className="text-white/90 text-lg mb-8">
            Subscribe to our newsletter for the latest tips and updates.
          </p>
          <Link to="/contact">
            <Button className="bg-white text-sky-600 hover:bg-slate-100 rounded-full px-10 py-3 h-auto text-lg font-semibold">
              Subscribe Now
            </Button>
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
