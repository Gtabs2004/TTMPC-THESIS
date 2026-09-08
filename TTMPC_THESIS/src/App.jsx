import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard,
  Brain,
  Users,
  TrendingUp,
  Menu as MenuIcon,
  X,
  MapPin,
  Wallet,
  Landmark,
  HeartHandshake,
  ChevronLeft,
  ChevronRight,
  FileText,
  PieChart
} from 'lucide-react';

function Button({ children, variant = 'primary', className = '', to, ...props }) {
  const baseStyles = 'inline-block text-center px-7 py-3 rounded-full font-semibold transition-all duration-200 shadow-sm active:scale-[0.98]';
  const variants = {
    primary: 'bg-primary-deep text-white hover:brightness-90 hover:shadow-md hover:-translate-y-0.5',
    secondary: 'bg-white text-primary-deep hover:bg-gray-50 border border-gray-100 hover:shadow-md',
    outline: 'border-2 border-white text-white hover:bg-white/10',
  };
  
  if (to) {
    return (
      <Link to={to} className={`${baseStyles} ${variants[variant]} ${className}`} {...props}>
        {children}
      </Link>
    );
  }
  
  return (
    <button className={`${baseStyles} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

// Fades a section up into place the first time it scrolls into view. IntersectionObserver-based
// (no scroll listeners, no animation library) — disconnects after firing once. Under
// prefers-reduced-motion the motion-safe: classes never apply, so content just renders visible.
function Reveal({ children, className = '', delayMs = 0 }) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out ${
        isVisible ? 'opacity-100 translate-y-0' : 'motion-safe:opacity-0 motion-safe:translate-y-6'
      } ${className}`}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}

// Community-list row used by the "Core Cooperative Services" and "Run With
// the Discipline..." sections — icon + title + description, no card chrome.
// Kept as one shared component so both sections read as the same language.
function IconListItem({ icon, title, description, tag, ctaTo, ctaLabel }) {
  return (
    <div className="group flex items-start gap-5 md:gap-6 py-6 md:py-7">
      <div className="w-12 h-12 md:w-14 md:h-14 shrink-0 rounded-full bg-gradient-to-br from-[#E9F7DE] to-white border border-green-100 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-white group-hover:scale-110 group-hover:border-primary transition-all duration-300">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-3 mb-1.5">
          <h4 className="text-lg md:text-xl font-bold text-gray-900 group-hover:text-primary-deep transition-colors duration-300">
            {title}
          </h4>
          {tag && (
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary-deep bg-[#E9F7DE] px-3 py-1 rounded-full shrink-0">
              {tag}
            </span>
          )}
        </div>
        <p className="text-gray-600 leading-relaxed text-sm md:text-base max-w-[60ch]">
          {description}
        </p>
        {ctaTo && (
          <div className="mt-4">
            <Button to={ctaTo} variant="secondary" className="px-6 py-2 text-sm">
              {ctaLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ value, label }) {
  return (
    <div className="text-center p-6">
      <div className="text-4xl md:text-5xl font-extrabold text-primary mb-2 tracking-tight">{value}</div>
      <div className="text-gray-600 font-medium">{label}</div>
    </div>
  );
}

function StatsMarquee() {
  const statsData = [
    { id: 1, value: "Smart", label: "Risk Prediction" },
    { id: 2, value: "MIGS", label: "Automated Scoring" },
    { id: 3, value: "Fast", label: "Approvals" },
    { id: 4, value: "24/7", label: "Access Available" },
    { id: 5, value: "Secure", label: "Cooperative-Grade Access" },
    { id: 6, value: "All-in-One", label: "Loans, Savings & Records" },
  ];

  return (
    <section className="py-10 bg-white border-y border-gray-100 overflow-hidden relative flex">
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-100%); }
        }
        .animate-marquee {
          animation: marquee 20s linear infinite;
        }
        .pause-on-hover:hover .animate-marquee,
        .pause-on-hover:focus-within .animate-marquee {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-marquee {
            animation: none;
          }
          .marquee-track-duplicate {
            display: none;
          }
          .marquee-viewport {
            overflow-x: auto;
          }
        }
      `}</style>
      <div className="absolute top-0 bottom-0 left-0 w-16 md:w-32 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none"></div>
      <div className="absolute top-0 bottom-0 right-0 w-16 md:w-32 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none"></div>
      <div className="marquee-viewport flex w-full pause-on-hover cursor-default">
        <div className="flex min-w-full justify-around animate-marquee items-center shrink-0">
          {statsData.map((stat) => (
            <div key={`track1-${stat.id}`} className="px-8 md:px-16">
              <StatCard value={stat.value} label={stat.label} />
            </div>
          ))}
        </div>
        <div className="marquee-track-duplicate flex min-w-full justify-around animate-marquee items-center shrink-0" aria-hidden="true">
          {statsData.map((stat) => (
            <div key={`track2-${stat.id}`} className="px-8 md:px-16">
              <StatCard value={stat.value} label={stat.label} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AboutImageCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  const carouselImages = [
    { id: 1, src: "/assets/img/TTMPC-1.jpg", alt: "TTMPC Building" },
    { id: 2, src: "/assets/img/news_2.jpg", alt: "TTMPC Founding Team" },
    { id: 3, src: "/assets/img/news_3.jpg", alt: "TTMPC Community Outreach" },
    { id: 4, src: "/assets/img/TTMPC-4.jpg", alt: "TTMPC Event" },
  ];

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (e) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (isPaused || prefersReducedMotion) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev === carouselImages.length - 1 ? 0 : prev + 1));
    }, 3000);
    return () => clearInterval(timer);
  }, [carouselImages.length, isPaused, prefersReducedMotion]);

  const goToNext = () => setCurrentIndex((prev) => (prev === carouselImages.length - 1 ? 0 : prev + 1));
  const goToPrev = () => setCurrentIndex((prev) => (prev === 0 ? carouselImages.length - 1 : prev - 1));

  return (
    <div
      className="relative rounded-3xl bg-gray-50 border border-gray-200 shadow-xl overflow-hidden aspect-[4/3] group"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setIsPaused(false);
      }}
    >
      <div
        className={`flex w-full h-full ${prefersReducedMotion ? "" : "transition-transform duration-700 ease-[cubic-bezier(0.25,0.1,0.25,1)]"}`}
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {carouselImages.map((img, idx) => (
          <div key={img.id} className="w-full flex-[0_0_100%] relative h-full flex items-center justify-center bg-gray-100 shrink-0">
            {img.src ? (
              <img
                src={img.src}
                alt={img.alt}
                className="w-full h-full object-contain"
                loading={idx === 0 ? "eager" : "lazy"}
              />
            ) : (
              <div className="absolute inset-4 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl bg-white">
                <MapPin className="w-8 h-8 mb-3 text-gray-300" />
                <span className="font-semibold text-sm tracking-wide">[ Insert Image {img.id} Here ]</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-between p-4 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none">
        <button 
          onClick={goToPrev} 
          className="pointer-events-auto p-2.5 rounded-full bg-white/70 text-gray-800 hover:bg-white hover:text-primary backdrop-blur-md shadow-lg transition-all focus:outline-none transform hover:scale-110"
          aria-label="Previous image"
        >
          <ChevronLeft className="w-6 h-6" strokeWidth={2.5} />
        </button>
        <button 
          onClick={goToNext} 
          className="pointer-events-auto p-2.5 rounded-full bg-white/70 text-gray-800 hover:bg-white hover:text-primary backdrop-blur-md shadow-lg transition-all focus:outline-none transform hover:scale-110"
          aria-label="Next image"
        >
          <ChevronRight className="w-6 h-6" strokeWidth={2.5} />
        </button>
      </div>
      <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-3 z-20">
        {carouselImages.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx)}
            className="p-2 flex items-center justify-center"
            aria-label={`Go to slide ${idx + 1}`}
          >
            <span
              className={`block h-2 rounded-full transition-all duration-300 shadow-sm ${
                currentIndex === idx ? "bg-primary w-8" : "bg-gray-300/80 hover:bg-gray-400 w-2"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white font-['Poppins'] text-gray-900 selection:bg-[#E9F7DE] selection:text-primary">
      <header className="bg-white/80 backdrop-blur-md h-16 flex items-center shadow-sm border-b border-gray-100 sticky top-0 z-50 px-6 lg:px-12">
        <div className="w-full flex items-center justify-between">
          <Link to="/" className="flex-shrink-0">
            <img
              src="/img/ttmpc logo.png"
              alt="TTMPC Logo"
              className="h-8 md:h-10 w-auto"
            />
          </Link>
          <nav className="hidden md:flex items-center">
            <ul className="flex items-center gap-8 text-sm font-semibold text-gray-600">
              <li><Link to="/" className="hover:text-primary-deep transition-colors">Home</Link></li>
              <li><a href="#about" className="hover:text-primary-deep transition-colors">About</a></li>
              <li><a href="#features" className="hover:text-primary-deep transition-colors">Features</a></li>
              <li><a href="#contact" className="hover:text-primary-deep transition-colors">Contact</a></li>
            </ul>
            <div className="flex items-center gap-6 ml-8 pl-8 border-l border-gray-200 h-8">
              <Link to="/membership_form" className="text-sm font-semibold text-primary-deep hover:brightness-90 transition-colors">
                Become a Member
              </Link>
              <Button to="/role_selection" variant="primary" className="py-2 px-6 text-sm">
                Portal Login
              </Button>
            </div>
          </nav>
          <button
            className="md:hidden p-2.5 rounded-md text-gray-600 focus:outline-none bg-gray-50 hover:bg-gray-100 transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu-panel"
          >
            {menuOpen ? <X className="h-6 w-6" strokeWidth={2.5} /> : <MenuIcon className="h-6 w-6" strokeWidth={2.5} />}
          </button>
        </div>
      </header>

      {menuOpen && (
        <div id="mobile-menu-panel" className="md:hidden bg-white shadow-xl z-40 px-6 py-6 flex flex-col gap-4 text-base font-medium text-gray-700 absolute w-full border-t border-gray-100">
          <Link to="/" onClick={() => setMenuOpen(false)} className="py-2 border-b border-gray-50">Home</Link>
          <a href="#about" onClick={() => setMenuOpen(false)} className="py-2 border-b border-gray-50">About</a>
          <a href="#features" onClick={() => setMenuOpen(false)} className="py-2 border-b border-gray-50">Features</a>
          <a href="#contact" onClick={() => setMenuOpen(false)} className="py-2">Contact</a>
          <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-gray-100">
            <Button to="/membership_form" variant="secondary" onClick={() => setMenuOpen(false)}>
              Become a Member
            </Button>
            <Button to="/role_selection" variant="primary" onClick={() => setMenuOpen(false)}>
              Portal Login
            </Button>
          </div>
        </div>
      )}

      <section className="bg-gradient-to-b from-[#E9F7DE]/60 to-white pt-20 pb-24 px-4 overflow-hidden relative">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          <Reveal className="flex-1 text-center lg:text-left z-10">
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-6 leading-[1.15] tracking-tight">
              Tubungan Teachers' <br className="hidden lg:block" />
              <span className="text-primary">Multi-Purpose Cooperative</span>
            </h1>
            <p className="text-gray-600 text-lg md:text-xl mb-10 max-w-xl mx-auto lg:mx-0 leading-relaxed">
             Empowering our community through intelligent financial management since 1995.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Button to="/role_selection" className="w-full sm:w-auto text-lg">Portal Login</Button>
            </div>
          </Reveal>
          <Reveal className="flex-1 w-full max-w-2xl lg:max-w-none relative z-10" delayMs={150}>
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-transparent rounded-3xl transform translate-x-4 translate-y-4 -z-10 blur-xl"></div>
            <img
              src="/img/landing page.png"
              alt="System Dashboard Preview"
              className="w-full h-auto rounded-2xl shadow-2xl border border-gray-100"
            />
          </Reveal>
        </div>
      </section>
      
      <StatsMarquee />

      <section id="about" className="py-24 px-4 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20 mb-24">
            <Reveal className="flex-1 lg:pr-8 text-center lg:text-left">
              <span className="text-primary font-bold tracking-[0.2em] uppercase mb-4 block text-xs">Our Legacy</span>
              <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-6 tracking-tight">
                Empowering the Community Since 1995.
              </h2>
              <p className="text-gray-600 text-lg leading-relaxed mb-6 max-w-[60ch] mx-auto lg:mx-0">
                Tubungan Teachers' Multi-Purpose Cooperative (TTMPC) was founded with a singular mission: to provide secure, accessible, and fair financial services to educators and local community members.
              </p>
              <p className="text-gray-600 text-lg leading-relaxed max-w-[60ch] mx-auto lg:mx-0">
                Over the decades, we have grown from a small group of passionate teachers into a robust financial institution, continuously adapting to serve the evolving needs of our members while staying true to our cooperative roots.
              </p>
            </Reveal>
            <Reveal className="flex-1 w-full" delayMs={150}>
              <AboutImageCarousel />
            </Reveal>
          </div>

          <Reveal className="text-center mb-20 mt-12">
            <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4 tracking-tight">Core Cooperative Services</h3>
            <p className="text-gray-600 max-w-2xl mx-auto text-lg">We offer a variety of financial products designed to build your savings and support your goals.</p>
          </Reveal>

          <div className="max-w-3xl mx-auto divide-y divide-gray-100">
            <Reveal>
              <IconListItem
                icon={<Wallet strokeWidth={2} className="w-6 h-6 md:w-7 md:h-7" />}
                title="Savings & Deposits"
                description="Two dedicated ways to save: a regular passbook account, and Share Capital (CBU) that builds real equity in the cooperative you co-own."
              />
            </Reveal>

            <Reveal delayMs={100}>
              <IconListItem
                icon={<Landmark strokeWidth={2} className="w-6 h-6 md:w-7 md:h-7" />}
                title="Loan Programs"
                tag="Core Service"
                description="3 loan programs built around real needs: Emergency, Consolidated, and Bonus, tailored to your immediate financial needs."
              />
            </Reveal>

            <Reveal delayMs={200}>
              <IconListItem
                icon={<HeartHandshake strokeWidth={2} className="w-6 h-6 md:w-7 md:h-7" />}
                title="Member Benefits"
                description="Become a co-owner for a ₱100 membership fee, build toward ₱10,000 in paid-up capital over time, and enjoy annual dividends and patronage refunds along the way."
              />
            </Reveal>
          </div>
        </div>
      </section>

      <section id="features" className="py-24 bg-gray-50 relative px-4 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="max-w-7xl mx-auto relative z-10">
          <Reveal className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-5 tracking-tight">
              Run With the Discipline of a Real Financial Institution.
            </h2>
            <p className="text-gray-600 text-lg md:text-xl max-w-2xl mx-auto font-medium leading-relaxed">
              Behind every deposit and loan is a modern system that keeps our books accurate, our approvals fair, and our officers accountable to you.
            </p>
          </Reveal>
          <div className="grid md:grid-cols-2 gap-x-12 max-w-5xl mx-auto">
            <div className="divide-y divide-gray-200 md:pr-8">
              <Reveal>
                <IconListItem
                  icon={<Brain strokeWidth={2} className="w-6 h-6 md:w-7 md:h-7" />}
                  title="Data-Driven Loan Screening"
                  description="Every application is weighed against real repayment history, not guesswork or favoritism, so approvals stay fair and consistent for every member."
                />
              </Reveal>
              <Reveal delayMs={100}>
                <IconListItem
                  icon={<PieChart strokeWidth={2} className="w-6 h-6 md:w-7 md:h-7" />}
                  title="Real-Time Financial Oversight"
                  description="Officers see the cooperative's full financial position at all times, so your contributions are never mismanaged or misplaced."
                />
              </Reveal>
              <Reveal delayMs={200}>
                <IconListItem
                  icon={<CreditCard strokeWidth={2} className="w-6 h-6 md:w-7 md:h-7" />}
                  title="Standardized Loan Rules"
                  description="Every application runs through the same eligibility checks and amortization schedule, so every member is evaluated by the same rules."
                />
              </Reveal>
            </div>
            <div className="divide-y divide-gray-200 md:pl-8 md:border-l md:border-gray-200">
              <Reveal delayMs={100}>
                <IconListItem
                  icon={<Users strokeWidth={2} className="w-6 h-6 md:w-7 md:h-7" />}
                  title="Your Full Record, One Place"
                  description="Your profile, capital contributions, and complete loan history live in one secure record, not scattered paper files."
                />
              </Reveal>
              <Reveal delayMs={200}>
                <IconListItem
                  icon={<TrendingUp strokeWidth={2} className="w-6 h-6 md:w-7 md:h-7" />}
                  title="Funds Ready When You Need Them"
                  description="We plan ahead for seasonal loan demand, so the cooperative isn't caught short when members need funds most."
                />
              </Reveal>
              <Reveal delayMs={300}>
                <IconListItem
                  icon={<FileText strokeWidth={2} className="w-6 h-6 md:w-7 md:h-7" />}
                  title="Full Transparency to the Board"
                  description="The Board reviews accurate, board-ready financial reports every cycle, so your cooperative's finances stay fully accountable."
                  ctaTo="/role_selection"
                  ctaLabel="See Our Reports"
                />
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 px-4 bg-primary-deep relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-white opacity-10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-80 h-80 bg-black opacity-10 rounded-full blur-3xl"></div>
        <Reveal className="max-w-4xl mx-auto text-center text-white relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">
            Ready to Join TTMPC?
          </h2>
          <p className="text-white/90 text-xl mb-10 max-w-2xl mx-auto leading-relaxed">
            Become a co-owner of a cooperative that's served Tubungan's teachers since 1995, or log in to manage your account today.
          </p>
          <div className="flex flex-col sm:flex-row gap-5 justify-center">
            <Button to="/membership_form" variant="secondary" className="text-lg px-8">
              Become a Member
            </Button>
            <Button to="/role_selection" variant="outline" className="text-lg px-8">
              Portal Login
            </Button>
          </div>
        </Reveal>
      </section>

      <footer className="bg-gray-900 text-white py-16 px-4 border-t-4 border-primary">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-1 md:col-span-1">
              <img
                src="/img/ttmpc logo.png"
                alt="TTMPC Logo"
                className="h-14 w-auto mb-6 brightness-0 invert"
              />
              <p className="text-gray-400 text-sm leading-relaxed mb-6">
                Tubungan Teachers' Multi-Purpose Cooperative.<br />
                Empowering our community through intelligent financial management since 1995.
              </p>
            </div>
            <div>
              <h4 className="text-lg font-bold mb-6 text-white">Services</h4>
              <ul className="space-y-4 text-gray-400 text-sm font-medium">
                <li><Link to="/loan_services" className="hover:text-white transition-colors">Loan Services</Link></li>
                <li><Link to="/membership_form" className="hover:text-white transition-colors">Become a Member</Link></li>
                <li><Link to="/role_selection" className="hover:text-white transition-colors">Portal Login</Link></li>
              </ul>
            </div>
            <div id="contact" className="col-span-1 md:col-span-2">
              <h4 className="text-lg font-bold mb-6 text-white">Contact</h4>
              <ul className="space-y-4 text-gray-400 text-sm font-medium">
                <li className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-primary shrink-0" />
                  <span>Tubungan, Iloilo, Philippines</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-gray-800 text-center text-gray-500 text-sm font-medium">
            &copy; {new Date().getFullYear()} TTMPC Integrated System. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;