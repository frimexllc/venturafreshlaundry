import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Button } from "./ui/button";
import { Menu, X, ShoppingCart, User } from "lucide-react";

const navLinks = [
  { path: "/services", label: "Services" },
  { path: "/about", label: "About" },
  { path: "/contact", label: "Contact" },
  { path: "/store", label: "Store" },
  { path: "/blog", label: "Blog" },
];

export default function PublicNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const customerToken = localStorage.getItem('customer_token');

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <img 
              src="https://images.squarespace-cdn.com/content/v1/66f3d06a2c293506cfa7d476/57cbc3f3-0394-4498-b021-3908fdc39db7/logo.png?format=100w" 
              alt="Ventura Fresh Laundry" 
              className="h-12 w-auto"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            <span className="text-xl font-bold text-sky-600 hidden sm:inline">Ventura Fresh Laundry</span>
          </Link>
          
          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-6">
            {navLinks.map((link) => (
              <NavLink 
                key={link.path}
                to={link.path} 
                className={({ isActive }) => 
                  `text-sm font-medium transition-colors ${isActive ? 'text-sky-600' : 'text-slate-600 hover:text-sky-600'}`
                }
              >
                {link.label}
              </NavLink>
            ))}
            
            <Link 
              to={customerToken ? "/account" : "/account/login"} 
              className="text-slate-600 hover:text-sky-600 font-medium text-sm transition-colors flex items-center gap-1"
            >
              <User className="h-4 w-4" />
              Account
            </Link>

            <Link to="/schedule-pickup">
              <Button className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-6 text-sm" data-testid="nav-schedule-btn">
                SCHEDULE PICK-UP
              </Button>
            </Link>
          </div>

          {/* Mobile menu button */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 text-slate-600"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-t border-slate-100 py-4 px-4 animate-fade-in">
          <div className="flex flex-col gap-3">
            {navLinks.map((link) => (
              <NavLink 
                key={link.path}
                to={link.path}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) => 
                  `font-medium py-2 ${isActive ? 'text-sky-600' : 'text-slate-600'}`
                }
              >
                {link.label}
              </NavLink>
            ))}
            <Link 
              to={customerToken ? "/account" : "/account/login"}
              onClick={() => setMobileMenuOpen(false)}
              className="text-slate-600 font-medium py-2"
            >
              Account
            </Link>
            <Link to="/schedule-pickup" onClick={() => setMobileMenuOpen(false)}>
              <Button className="bg-sky-500 hover:bg-sky-600 text-white rounded-full w-full mt-2">
                SCHEDULE PICK-UP
              </Button>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
