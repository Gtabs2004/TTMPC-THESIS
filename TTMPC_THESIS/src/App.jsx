import { useState } from 'react';
import { Link } from 'react-router-dom';

const newsItems = [
  {
    id: 1,
    imgSrc: 'src/assets/img/news_1.jpg',
    alt: 'Event 1',
    description: 'TTMPC officers personally revisit the trees they planted and nurtured.',
  },
  {
    id: 2,
    imgSrc: 'src/assets/img/news_2.jpg',
    alt: 'Event 2',
    description:
      'TTMPC celebrates the 5th year of spreading cheer through Gift Giving Activity at Sibucauan Elementary School.',
  },
  {
    id: 3,
    imgSrc: 'src/assets/img/news_3.jpg',
    alt: 'Event 3',
    description: 'TTMPC conducts 2025 Strategic Planning.',
  },
];

function NewsSection() {
  return (
    <div className="bg-[#E9F7DE] min-h-screen py-16 flex flex-col items-center">
      <div className="text-center mb-12 px-4">
        <h1 className="text-2xl md:text-3xl font-medium text-[#66B538] mb-2 tracking-wide">
          News and Events
        </h1>
        <p className="text-gray-500 tracking-wide text-sm md:text-base">
          The latest updates from your partners
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl w-full px-6 md:px-8">
        {newsItems.map((item) => (
          <div
            key={item.id}
            className="bg-white rounded-2xl shadow-md flex flex-col overflow-hidden"
          >
            <img
              src={item.imgSrc}
              alt={item.alt}
              className="h-48 md:h-56 w-full object-cover"
            />
            <div className="p-6 md:p-8 flex-grow flex items-center justify-center">
              <p className="text-[#66B538] text-center font-medium leading-relaxed text-sm md:text-base">
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      <button className="mt-12 md:mt-16 bg-[#66B538] text-white px-10 py-3 rounded-full font-semibold hover:bg-green-600 transition-colors cursor-pointer shadow-sm">
        View More
      </button>
    </div>
  );
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {/* Header */}
      <header className="bg-white h-16 md:h-20 flex items-center shadow-lg sticky top-0 z-50 px-4 md:px-6">
        <img
          src="src/assets/img/ttmpc logo.png"
          alt="Ttmpc Logo"
          className="h-10 md:h-12 w-auto"
        />

        {/* Desktop nav */}
        <ul className="hidden md:flex flex-row gap-6 lg:gap-8 items-center ml-auto text-sm font-semibold text-gray-600">
          <li><Link to="/">Home</Link></li>
          <li><Link to="/">About Us</Link></li>
          <li><Link to="/loan_kiosk">Services</Link></li>
          <li><Link to="/">FAQs</Link></li>
          <li><Link to="/">Contact Us</Link></li>
          <li className="bg-[#E9F7DE] text-[#66B538] px-4 py-2 rounded-3xl cursor-pointer">
            <Link to="/membership_form">Be a Member</Link>
          </li>
          <li className="bg-[#66B538] text-white rounded-3xl px-8 py-2 cursor-pointer">
            <Link to="/role_selection">Login</Link>
          </li>
        </ul>

        {/* Mobile hamburger */}
        <button
          className="md:hidden ml-auto p-2 rounded-md text-gray-600 focus:outline-none"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label="Toggle menu"
        >
          {menuOpen ? (
            // X icon
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            // Hamburger icon
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </header>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="md:hidden bg-white shadow-md z-40 px-6 py-4 flex flex-col gap-4 text-sm font-semibold text-gray-600">
          <Link to="/" onClick={() => setMenuOpen(false)}>Home</Link>
          <Link to="/" onClick={() => setMenuOpen(false)}>About Us</Link>
          <Link to="/loan_kiosk" onClick={() => setMenuOpen(false)}>Services</Link>
          <Link to="/" onClick={() => setMenuOpen(false)}>FAQs</Link>
          <Link to="/" onClick={() => setMenuOpen(false)}>Contact Us</Link>
          <Link
            to="/membership_form"
            onClick={() => setMenuOpen(false)}
            className="bg-[#E9F7DE] text-[#66B538] px-4 py-2 rounded-3xl text-center"
          >
            Be a Member
          </Link>
          <Link
            to="/role_selection"
            onClick={() => setMenuOpen(false)}
            className="bg-[#66B538] text-white rounded-3xl px-8 py-2 text-center"
          >
            Login
          </Link>
        </div>
      )}

      {/* Hero section */}
      <div className="bg-[#E9F7DE] min-h-screen flex flex-col items-center justify-center px-4 py-16">
        <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-black mb-10 md:mb-20 text-center">
          Together, We Grow Stronger.
        </h1>
        <img
          src="src/assets/img/landing page.png"
          alt="Main Image"
          className="w-full max-w-sm md:max-w-xl lg:max-w-2xl h-auto mb-10 md:mb-20"
        />
      </div>

      {/* Best Loan Options section */}
      <div className="bg-white py-12 md:py-0 md:h-96 flex flex-col md:flex-row items-center px-6 md:px-0 gap-8 md:gap-0">
        <div className="bg-[#E9F7DE] rounded-lg overflow-hidden w-48 h-48 md:w-60 md:h-48 flex-shrink-0 md:ml-20 lg:ml-40">
          <img
            src="src/assets/img/1.png"
            alt="Product Image"
            className="h-full w-full object-cover"
          />
        </div>
        <div className="flex flex-col gap-4 md:ml-auto md:mr-20 lg:mr-40 max-w-xl text-center md:text-left">
          <h2 className="text-2xl md:text-3xl font-bold text-black">
            Best Loan Options
          </h2>
          <p className="text-gray-600 text-sm md:text-base">
            Choose from our available loan options including Bonus Loan,
            Consolidated Loan, and Emergency Loan to support your financial
            needs.
          </p>
          <Link to="/" className="text-blue-700 mt-2 md:mt-4 text-sm md:text-base">
            Check out the Loan Calculator
          </Link>
        </div>
      </div>

      <NewsSection />
    </>
  );
}

export default App;
