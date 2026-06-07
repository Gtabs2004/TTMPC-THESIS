import { useState } from 'react';
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
  Files
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
    <div className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl hover:shadow-green-900/5 transition-all duration-300 border border-gray-100 hover:border-green-200 group relative overflow-hidden flex flex-col h-full transform hover:-translate-y-1 cursor-default">
      
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#66B539] to-green-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

      <div className="w-14 h-14 bg-gradient-to-br from-[#E9F7DE] to-white border border-green-100 text-[#66B539] rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-sm">
        {icon}
      </div>
      
      <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-[#66B539] transition-colors duration-300">
        {title}
      </h3>
      
      <p className="text-gray-600 leading-relaxed text-sm md:text-base flex-grow">
        {description}
      </p>

      <div className="mt-6 flex items-center text-sm font-semibold text-[#66B539] opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        Explore feature <span className="ml-1 group-hover:translate-x-1 transition-transform">→</span>
      </div>
      
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
              <li><a href="#features" className="hover:text-[#66B539] transition-colors">Features</a></li>
              <li><Link to="/" className="hover:text-[#66B539] transition-colors">Contact</Link></li>
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
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-6 leading-[1.15] tracking-tight">
              Manage <br className="hidden lg:block" />
              <span className="text-[#66B539]">TTMPC Smarter.</span>
            </h1>
            <p className="text-gray-600 text-lg md:text-xl mb-10 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              The complete financial system for TTMPC. Streamline loan approvals, forecast risks accurately, and automate daily operations.
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

      <section id="about" className="py-24 px-4 bg-gray-50 border-b border-gray-100">
        <div className="max-w-5xl mx-auto text-center">
          
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-5 tracking-tight">
            The Challenges Holding TTMPC Back.
          </h2>
          <p className="text-gray-600 text-lg md:text-xl leading-relaxed mb-16 max-w-3xl mx-auto font-medium">
            Manual workflows and fragmented data are creating invisible risks for your cooperative.
          </p>

          <div className="grid md:grid-cols-3 gap-8 text-left">
            
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center text-red-500 mb-6 border border-red-100">
                <Clock strokeWidth={2.5} className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Manual Overload</h3>
              <p className="text-gray-600 leading-relaxed text-sm md:text-base">
                Officers waste countless hours reconciling spreadsheets and manually tracking payments instead of focusing on member growth.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center text-red-500 mb-6 border border-red-100">
                <ShieldAlert strokeWidth={2.5} className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Risk-Prone</h3>
              <p className="text-gray-600 leading-relaxed text-sm md:text-base">
                Without predictive analytics, loan decisions rely on guesswork and incomplete histories, directly increasing your risk of bad debt.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center text-red-500 mb-6 border border-red-100">
                <Files strokeWidth={2.5} className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Fragmented Records</h3>
              <p className="text-gray-600 leading-relaxed text-sm md:text-base">
                Crucial member data is buried across physical cabinets and disconnected Excel files, making accurate financial analysis nearly impossible.
              </p>
            </div>

          </div>
        </div>
      </section>

      <section id="features" className="py-24 bg-[#F8FAFC] relative px-4 overflow-hidden">
        
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-5 tracking-tight">
              The Complete Operating System for TTMPC.
            </h2>
            <p className="text-gray-600 text-lg md:text-xl max-w-2xl mx-auto font-medium leading-relaxed">
              Purpose-built for cooperative dynamics. Replace scattered spreadsheets with a single, intelligent platform designed to empower your officers.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard 
              icon={Icons.Loan}
              title="Automated Loan Processing"
              description="Process applications faster with automated eligibility checks and instantly generated amortization schedules."
            />
            <FeatureCard 
              icon={Icons.Chart}
              title="Real-Time Financial Dashboard"
              description="Monitor cash flow, receivables, and daily collections at a glance. Always know exactly where the cooperative stands."
            />
            <FeatureCard 
              icon={Icons.Brain}
              title="Predictive Risk Analytics"
              description="Evaluate member debt capacity and flag high-risk accounts instantly using historical payment data."
            />
            <FeatureCard 
              icon={Icons.Community}
              title="Centralized Member Hub"
              description="One secure, organized database for all member profiles, capital contributions, and complete loan histories."
            />
            <FeatureCard 
              icon={Icons.Trend}
              title="Liquidity Forecasting"
              description="Predict future loan demand based on seasonal trends and member behavior, ensuring TTMPC always has sufficient funds."
            />
            <FeatureCard 
              icon={Icons.Lightning}
              title="One-Click Board Reports"
              description="Generate flawless, board-ready financial reports instantly. Spend less time on paperwork and more time on strategy."
            />
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
              <h4 className="text-lg font-bold mb-6 text-white">Platform</h4>
              <ul className="space-y-4 text-gray-400 text-sm font-medium">
                <li><Link to="/" className="hover:text-white transition-colors">Home</Link></li>
                <li><a href="#about" className="hover:text-white transition-colors">About Us</a></li>
                <li><a href="#features" className="hover:text-white transition-colors">Features & Capabilities</a></li>
                <li><Link to="/role_selection" className="hover:text-white transition-colors">System Login</Link></li>
              </ul>
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
            <div>
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
            <div>&copy; {new Date().getFullYear()} TTMPC Integrated System V2.0. All rights reserved.</div>
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