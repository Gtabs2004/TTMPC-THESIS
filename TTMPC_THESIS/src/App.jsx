import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  AlertTriangle, 
  CreditCard, 
  BarChart3, 
  Brain, 
  Users, 
  TrendingUp, 
  Zap, 
  Menu as MenuIcon, 
  X, 
  ShieldCheck, 
  MapPin, 
  Phone, 
  Mail,
  Clock,
  ShieldAlert,
  Files,
  Wallet,
  Landmark,
  HeartHandshake,
  ChevronLeft,
  ChevronRight,
  FileText,
  Sparkles,
  PieChart
} from 'lucide-react';

function Button({ children, variant = 'primary', className = '', to, ...props }) {
  const baseStyles = 'inline-block text-center px-7 py-3 rounded-full font-semibold transition-all duration-200 shadow-sm';
  const variants = {
    primary: 'bg-[#66B539] text-white hover:bg-[#529E2E] hover:shadow-md hover:-translate-y-0.5',
    secondary: 'bg-white text-[#66B539] hover:bg-gray-50 border border-gray-100 hover:shadow-md',
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

function FeatureCard({ icon, title, description }) {
  return (
    <div className="bg-white p-8 rounded-3xl shadow-sm hover:shadow-xl hover:shadow-green-900/5 transition-all duration-300 border border-gray-100 group relative overflow-hidden flex flex-col h-full transform hover:-translate-y-1 cursor-default">
      <div className="absolute top-0 left-0 w-full h-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 "></div>
      <div className="w-14 h-14 bg-gradient-to-br from-[#E9F7DE] to-white border border-green-100 text-[#66B539] rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-sm">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-[#66B539] transition-colors duration-300">
        {title}
      </h3>
      <p className="text-gray-600 leading-relaxed text-sm md:text-base flex-grow">
        {description}
      </p>
    </div>
  );
}

function StatCard({ value, label }) {
  return (
    <div className="text-center p-6">
      <div className="text-4xl md:text-5xl font-extrabold text-[#66B539] mb-2 tracking-tight">{value}</div>
      <div className="text-gray-600 font-medium">{label}</div>
    </div>
  );
}

function StatsMarquee() {
  const statsData = [
    { id: 1, value: "265", label: "Active Members" },
    { id: 2, value: "745", label: "Total Loans Processed" },
    { id: 3, value: "99.9%", label: "System Uptime" },
    { id: 4, value: "24/7", label: "Access Available" },
    { id: 5, value: "Fast", label: "Approvals" },
    { id: 6, value: "100%", label: "Data Secured" },
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
        .pause-on-hover:hover .animate-marquee {
          animation-play-state: paused;
        }
      `}</style>
      <div className="absolute top-0 bottom-0 left-0 w-16 md:w-32 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none"></div>
      <div className="absolute top-0 bottom-0 right-0 w-16 md:w-32 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none"></div>
      <div className="flex w-full pause-on-hover cursor-default">
        <div className="flex min-w-full justify-around animate-marquee items-center shrink-0">
          {statsData.map((stat) => (
            <div key={`track1-${stat.id}`} className="px-8 md:px-16">
              <StatCard value={stat.value} label={stat.label} />
            </div>
          ))}
        </div>
        <div className="flex min-w-full justify-around animate-marquee items-center shrink-0" aria-hidden="true">
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

  const carouselImages = [
    { id: 1, src: "assets/img/TTMPC-1.jpg", alt: "TTMPC Building" },
    { id: 2, src: "assets/img/news_2.jpg", alt: "TTMPC Founding Team" },
    { id: 3, src: "assets/img/news_3.jpg", alt: "TTMPC Community Outreach" },
    { id: 4, src: "assets/img/TTMPC-4.jpg", alt: "TTMPC Event" },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev === carouselImages.length - 1 ? 0 : prev + 1));
    }, 3000); 
    return () => clearInterval(timer);
  }, [carouselImages.length]);

  const goToNext = () => setCurrentIndex((prev) => (prev === carouselImages.length - 1 ? 0 : prev + 1));
  const goToPrev = () => setCurrentIndex((prev) => (prev === 0 ? carouselImages.length - 1 : prev - 1));

  return (
    <div className="relative rounded-3xl bg-gray-50 border border-gray-200 shadow-xl overflow-hidden aspect-[4/3] group">
      <div 
        className="flex w-full h-full transition-transform duration-700 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {carouselImages.map((img) => (
          <div key={img.id} className="w-full flex-[0_0_100%] relative h-full flex items-center justify-center bg-gray-100 shrink-0">
            {img.src ? (
              <img src={img.src} alt={img.alt} className="w-full h-full object-contain" />
            ) : (
              <div className="absolute inset-4 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl bg-white">
                <MapPin className="w-8 h-8 mb-3 text-gray-300" />
                <span className="font-semibold text-sm tracking-wide">[ Insert Image {img.id} Here ]</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-between p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        <button 
          onClick={goToPrev} 
          className="pointer-events-auto p-2 rounded-full bg-white/70 text-gray-800 hover:bg-white hover:text-[#66B539] backdrop-blur-md shadow-lg transition-all focus:outline-none transform hover:scale-110"
          aria-label="Previous image"
        >
          <ChevronLeft className="w-6 h-6" strokeWidth={2.5} />
        </button>
        <button 
          onClick={goToNext} 
          className="pointer-events-auto p-2 rounded-full bg-white/70 text-gray-800 hover:bg-white hover:text-[#66B539] backdrop-blur-md shadow-lg transition-all focus:outline-none transform hover:scale-110"
          aria-label="Next image"
        >
          <ChevronRight className="w-6 h-6" strokeWidth={2.5} />
        </button>
      </div>
      <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-2 z-20">
        {carouselImages.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx)}
            className={`h-2 rounded-full transition-all duration-300 shadow-sm ${
              currentIndex === idx ? "bg-[#66B539] w-8" : "bg-gray-300/80 hover:bg-gray-400 w-2"
            }`}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

const Icons = {
  Warning: <AlertTriangle className="w-8 h-8 text-red-500" strokeWidth={2} />,
  Loan: <CreditCard className="w-7 h-7" strokeWidth={2} />,
  Chart: <BarChart3 className="w-7 h-7" strokeWidth={2} />,
  Brain: <Brain className="w-7 h-7" strokeWidth={2} />,
  Community: <Users className="w-7 h-7" strokeWidth={2} />,
  Trend: <TrendingUp className="w-7 h-7" strokeWidth={2} />,
  Lightning: <Zap className="w-7 h-7" strokeWidth={2} />,
};

function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white font-['Poppins'] text-gray-900 selection:bg-[#E9F7DE] selection:text-[#66B539]">
      <header className="bg-white/80 backdrop-blur-md h-20 flex items-center shadow-sm border-b border-gray-100 sticky top-0 z-50 px-6 lg:px-12">
        <div className="w-full flex items-center justify-between">
          <Link to="/" className="flex-shrink-0">
            <img
              src="/img/ttmpc logo.png"
              alt="TTMPC Logo"
              className="h-10 md:h-12 w-auto"
            />
          </Link>
          <nav className="hidden md:flex items-center">
            <ul className="flex items-center gap-8 text-sm font-semibold text-gray-600">
              <li><Link to="/" className="hover:text-[#66B539] transition-colors">Home</Link></li>
              <li><a href="#about" className="hover:text-[#66B539] transition-colors">About</a></li>
              <li><Link to="loan_services" className="hover:text-[#66B539] transition-colors">Features</Link></li>
              <li><a href="#contact" className="hover:text-[#66B539] transition-colors">Contact</a></li>
            </ul>
            <div className="flex items-center gap-6 ml-8 pl-8 border-l border-gray-200 h-8">
              <Link to="/membership_form" className="text-sm font-semibold text-[#66B539] hover:text-[#529E2E] transition-colors">
                Become a Member
              </Link>
              <Button to="/role_selection" variant="primary" className="py-2 px-6 text-sm">
                Login Access
              </Button>
            </div>
          </nav>
          <button
            className="md:hidden p-2 rounded-md text-gray-600 focus:outline-none bg-gray-50 hover:bg-gray-100 transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="h-6 w-6" strokeWidth={2.5} /> : <MenuIcon className="h-6 w-6" strokeWidth={2.5} />}
          </button>
        </div>
      </header>
      
      {menuOpen && (
        <div className="md:hidden bg-white shadow-xl z-40 px-6 py-6 flex flex-col gap-4 text-base font-medium text-gray-700 absolute w-full border-t border-gray-100">
          <Link to="/" onClick={() => setMenuOpen(false)} className="py-2 border-b border-gray-50">Home</Link>
          <a href="#about" onClick={() => setMenuOpen(false)} className="py-2 border-b border-gray-50">About</a>
          <a href="#features" onClick={() => setMenuOpen(false)} className="py-2 border-b border-gray-50">Features</a>
          <Link to="/" onClick={() => setMenuOpen(false)} className="py-2">Contact</Link>
          <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-gray-100">
            <Button to="/membership_form" variant="secondary" onClick={() => setMenuOpen(false)}>
              Become a Member
            </Button>
            <Button to="/role_selection" variant="primary" onClick={() => setMenuOpen(false)}>
              Login Access
            </Button>
          </div>
        </div>
      )}

      <section className="bg-gradient-to-b from-[#E9F7DE]/60 to-white pt-20 pb-24 px-4 overflow-hidden relative">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          <div className="flex-1 text-center lg:text-left z-10">
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-6 leading-[1.15] tracking-tight">
              Tubungan <br className="hidden lg:block" />
              <span className="text-[#66B539]"> Teachers' Multi-Purpose Cooperative</span>
            </h1>
            <p className="text-gray-600 text-lg md:text-xl mb-10 max-w-xl mx-auto lg:mx-0 leading-relaxed">
             Empowering our community through intelligent financial management since 1995.  
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Button to="/role_selection" className="w-full sm:w-auto text-lg">Access Now</Button>
            </div>
          </div>
          <div className="flex-1 w-full max-w-2xl lg:max-w-none relative z-10">
            <div className="absolute inset-0 bg-gradient-to-tr from-[#66B539]/20 to-transparent rounded-3xl transform translate-x-4 translate-y-4 -z-10 blur-xl"></div>
            <img
              src="/img/landing page.png"
              alt="System Dashboard Preview"
              className="w-full h-auto rounded-2xl shadow-2xl border border-gray-100"
            />
          </div>
        </div>
      </section>
      
      <StatsMarquee />

      <section id="about" className="py-24 px-4 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20 mb-24">
            <div className="flex-1 lg:pr-8 text-center lg:text-left">
              <span className="text-[#66B539] font-bold tracking-wider uppercase mb-4 block text-2xl">Our Legacy</span>
              <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-6 tracking-tight">
                Empowering the Community Since 1995.
              </h2>
              <p className="text-gray-600 text-lg leading-relaxed mb-6">
                Tubungan Teachers' Multi-Purpose Cooperative (TTMPC) was founded with a singular mission: to provide secure, accessible, and fair financial services to educators and local community members.
              </p>
              <p className="text-gray-600 text-lg leading-relaxed">
                Over the decades, we have grown from a small group of passionate teachers into a robust financial institution, continuously adapting to serve the evolving needs of our members while staying true to our cooperative roots.
              </p>
            </div>
            <div className="flex-1 w-full">
              <AboutImageCarousel />
            </div>
          </div>

          <div className="text-center mb-20 mt-12">
            <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4 tracking-tight">Core Cooperative Services</h3>
            <p className="text-gray-600 max-w-2xl mx-auto text-lg">We offer a variety of financial products designed to build your savings and support your goals.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 items-center text-left max-w-6xl mx-auto">
            <div className="bg-white p-8 md:p-10 rounded-3xl border border-gray-100 shadow-xl shadow-gray-200/40 hover:-translate-y-2 transition-transform duration-300 relative z-0">
              <div className="w-14 h-14 bg-gradient-to-br from-[#E9F7DE] to-white border border-green-100 rounded-2xl flex items-center justify-center text-[#66B539] mb-8 shadow-sm">
                <Wallet strokeWidth={2} className="w-7 h-7" />
              </div>
              <h4 className="text-xl font-bold text-gray-900 mb-4">Savings & Deposits</h4>
              <p className="text-gray-600 leading-relaxed text-sm md:text-base">
                Secure your future with our high-yield share capital and regular savings accounts, designed exclusively for member growth.
              </p>
            </div>

            <div className="bg-gradient-to-b from-[#66B539] to-[#529E2E] p-10 md:p-12 rounded-3xl shadow-2xl shadow-green-900/30 transform md:-translate-y-6 hover:-translate-y-8 transition-transform duration-300 relative z-10 border border-[#76c945]">
              <div className="flex justify-between items-start mb-8">
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-[#66B539] shadow-lg">
                  <Landmark strokeWidth={2} className="w-7 h-7" />
                </div>
                <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider backdrop-blur-sm">
                  Core Service
                </span>
              </div>
              <h4 className="text-2xl font-bold text-white mb-4">Loan Programs</h4>
              <p className="text-white/90 leading-relaxed text-sm md:text-base mb-8">
                Access fair and flexible loan options including Emergency, Consolidated, and Bonus loans tailored to your immediate financial needs.
              </p>
              <div className="w-full h-[1px] bg-white/20 mb-6"></div>
              <div className="text-white/90 text-sm font-medium flex items-center">
                <Sparkles className="w-4 h-4 mr-2 text-[#E9F7DE]" />
                Now powered by smart approvals
              </div>
            </div>

            <div className="bg-white p-8 md:p-10 rounded-3xl border border-gray-100 shadow-xl shadow-gray-200/40 hover:-translate-y-2 transition-transform duration-300 relative z-0">
              <div className="w-14 h-14 bg-gradient-to-br from-[#E9F7DE] to-white border border-green-100 rounded-2xl flex items-center justify-center text-[#66B539] mb-8 shadow-sm">
                <HeartHandshake strokeWidth={2} className="w-7 h-7" />
              </div>
              <h4 className="text-xl font-bold text-gray-900 mb-4">Member Benefits</h4>
              <p className="text-gray-600 leading-relaxed text-sm md:text-base">
                Enjoy annual dividends, patronage refunds, and community outreach programs as a valued co-owner of the cooperative.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-24 bg-[#F8FAFC] relative px-4 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-5 tracking-tight">
              The Complete Operating System for TTMPC.
            </h2>
            <p className="text-gray-600 text-lg md:text-xl max-w-2xl mx-auto font-medium leading-relaxed">
              Purpose-built for cooperative dynamics. Replace scattered spreadsheets with a single, intelligent platform designed to empower your officers.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 bg-gray-900 rounded-3xl p-8 md:p-12 shadow-lg border border-gray-800 flex flex-col md:flex-row items-center gap-8 group hover:-translate-y-1 transition-transform duration-300">
              <div className="flex-1 text-left">
                <div className="w-14 h-14 bg-gray-800 border border-gray-700 text-[#66B539] rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <Brain strokeWidth={2} className="w-7 h-7" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-4">Predictive Risk Analytics</h3>
                <p className="text-gray-400 leading-relaxed md:text-lg mb-6">
                  Evaluate member debt capacity and flag high-risk accounts instantly using historical payment data. Don't guess on loan approvals—let the data decide.
                </p>
                <div className="inline-flex items-center text-[#66B539] font-medium text-sm">
                  <Sparkles className="w-4 h-4 mr-2" /> Powered by AI Data Models
                </div>
              </div>
              <div className="flex-1 w-full mt-6 md:mt-0">
                <div className="aspect-video bg-gray-800 border border-gray-700 rounded-xl flex items-center justify-center overflow-hidden relative">
                   <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f1a_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f1a_1px,transparent_1px)] bg-[size:14px_14px]"></div>
                   <BarChart3 className="w-12 h-12 text-gray-600 z-10" />
                   {/* Add your actual analytics screenshot here: <img src="..." className="absolute inset-0 w-full h-full object-cover" /> */}
                </div>
              </div>
            </div>
            <div className="md:col-span-1">
              <FeatureCard 
                icon={<PieChart className="w-7 h-7" strokeWidth={2}/>} 
                title="Real-Time Dashboard"
                description="Monitor cash flow, receivables, and daily collections at a glance. Always know where the cooperative stands."
              />
            </div>
            <div className="md:col-span-1">
              <FeatureCard 
                icon={<CreditCard className="w-7 h-7" strokeWidth={2}/>}
                title="Automated Loan Processing"
                description="Process applications faster with automated eligibility checks and instantly generated amortization schedules."
              />
            </div>
            <div className="md:col-span-1">
              <FeatureCard 
                icon={<Users className="w-7 h-7" strokeWidth={2}/>}
                title="Centralized Member Hub"
                description="One secure, organized database for all member profiles, capital contributions, and complete loan histories."
              />
            </div>
            <div className="md:col-span-1">
              <FeatureCard 
                icon={<TrendingUp className="w-7 h-7" strokeWidth={2}/>}
                title="Liquidity Forecasting"
                description="Predict future loan demand based on seasonal trends and member behavior to ensure sufficient funds."
              />
            </div>
            <div className="md:col-span-3 bg-white rounded-3xl p-8 md:p-10 shadow-sm border border-gray-100 flex flex-col md:flex-row items-center gap-8 group hover:shadow-xl hover:shadow-green-900/5 hover:-translate-y-1 transition-all duration-300">
              <div className="w-16 h-16 shrink-0 bg-gradient-to-br from-[#E9F7DE] to-white border border-green-100 text-[#66B539] rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <FileText strokeWidth={2} className="w-8 h-8" />
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-2xl font-bold text-gray-900 mb-3 group-hover:text-[#66B539] transition-colors duration-300">One-Click Board Reports</h3>
                <p className="text-gray-600 leading-relaxed md:text-lg max-w-4xl">
                  Generate flawless, board-ready financial reports instantly. Spend less time formatting paperwork and more time building financial strategy.
                </p>
              </div>
              <div className="shrink-0 mt-4 md:mt-0">
                 <Button to="/role_selection" variant="secondary" className="px-8">View Reports</Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 px-4 bg-[#66B539] relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-white opacity-10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-80 h-80 bg-black opacity-10 rounded-full blur-3xl"></div>
        <div className="max-w-4xl mx-auto text-center text-white relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">
            Ready to Transform TTMPC?
          </h2>
          <p className="text-white/90 text-xl mb-10 max-w-2xl mx-auto leading-relaxed">
            Join the cooperative moving forward. Modernize your operations, protect your assets, and serve your members better today.
          </p>
          <div className="flex flex-col sm:flex-row gap-5 justify-center">
            <Button to="/membership_form" variant="secondary" className="text-lg px-8">
              Become a Member
            </Button>
            <Button to="/role_selection" variant="outline" className="text-lg px-8">
              Login to Portal
            </Button>
          </div>
        </div>
      </section>

      <footer className="bg-gray-900 text-white py-16 px-4 border-t-4 border-[#66B539]">
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
                <li><Link to="/" className="hover:text-white transition-colors">Loan Applications</Link></li>
                <li><Link to="/membership_form" className="hover:text-white transition-colors">Member Registration</Link></li>
                <li><Link to="/" className="hover:text-white transition-colors">Risk Analytics</Link></li>
                <li><Link to="/" className="hover:text-white transition-colors">Financial Calculator</Link></li>
              </ul>
            </div>
            <div id="contact" className="col-span-1 md:col-span-2">
              <h4 className="text-lg font-bold mb-6 text-white">Contact</h4>
              <ul className="space-y-4 text-gray-400 text-sm font-medium">
                <li className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-[#66B539] shrink-0" />
                  <span>Tubungan, Iloilo, Philippines</span>
                </li>
                <li className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-[#66B539] shrink-0" />
                  <span>(123) 456-7890</span>
                </li>
                <li className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-[#66B539] shrink-0" />
                  <span>info@ttmpc.coop</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4 text-gray-500 text-sm font-medium">
            <div>&copy; {new Date().getFullYear()} TTMPC Integrated System.  All rights reserved.</div>
            <div className="flex gap-6">
              <Link to="/" className="hover:text-white transition-colors">Privacy Policy</Link>
              <Link to="/" className="hover:text-white transition-colors">Terms of Service</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;