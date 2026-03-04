  import { Link } from 'react-router-dom';

  // move the data outside of the component so it can be shared
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
      <div className="bg-[#E9F7DE] min-h-screen py-20 flex flex-col items-center">
      
      {/* Header Section */}
      <div className="text-center mb-12">
        <h1 className="text-3xl font-medium text-[#66B538] mb-2 tracking-wide">
          News and Events
        </h1>
        <p className="text-gray-500 tracking-wide">
          The latest updates from your partners
        </p>
      </div>

      {/* Cards Container */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl w-full px-8">
        {newsItems.map((item) => (
          <div
            key={item.id}
            // overflow-hidden makes the image perfectly clip to the rounded corners
            className="bg-white rounded-2xl shadow-md flex flex-col overflow-hidden" 
          >
            <img
              src={item.imgSrc}
              alt={item.alt}
              className="h-56 w-full object-cover"
            />
            {/* Card Text Container */}
            <div className="p-8 flex-grow flex items-center justify-center">
              <p className="text-[#66B538] text-center font-medium leading-relaxed">
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* View More Button */}
      <button className="mt-16 bg-[#66B538] text-white px-10 py-3 rounded-full font-semibold hover:bg-green-600 transition-colors cursor-pointer shadow-sm">
        View More
      </button>

    </div>
  );
}

  function App() {
    return (
      <>
        <header className="bg-white h-20 flex flex-row shadow-lg sticky">
          <img
            src="src/assets/img/ttmpc logo.png"
            alt="Ttmpc Logo"
            className="h-12 w-auto flex items-start mt-3 ml-4"
          />
          <ul className="float-right flex flex-row gap-8 items-center ml-auto mr-8 text-sm font-semibold text-gray-600">
            <li>
              <Link to="/">Home</Link>
            </li>
            <li>
              <Link to="/">About Us</Link>
            </li>
            <li>
              <Link to="/">Products</Link>
            </li>
            <li>
              <Link to="/">FAQs</Link>
            </li>
            <li>
              <Link to="/">Contact Us</Link>
            </li>
            <li className="bg-[#E9F7DE] text-[#66B538] p-3 rounded-3xl cursor-pointer">
              <Link to="/Membership_Form">Be a Member</Link>
            </li>
            <li className="bg-[#66B538] text-white rounded-3xl px-10 py-3 cursor-pointer">
              <Link to="/login">Login</Link>
            </li>
          </ul>
        </header>
        <div className="bg-[#E9F7DE] h-screen flex flex-col items-center justify-center">
          <h1 className="text-3xl font-bold text-black mb-20">
            Together, We Grow Stronger.
          </h1>
          <img
            src="src/assets/img/landing page.png"
            alt="Main Image"
            className="h-88 w-auto mb-20"
          />
        </div>
        <div className="bg-white h-96 flex flex-row items-center">
          <div className="bg-[#E9F7DE] h-48 w-60 rounded-lg flex items-start ml-40 ">
            <img
              src="src/assets/img/1.png"
              alt="Product Image"
              className="h-full w-full object-cover rounded-lg"
            />
          </div>
          <div className="flex flex-col gap-4 float-right ml-auto mr-40">
            <h2 className="text-3xl font-bold text-black ml-8">
              Best Loan Options
            </h2>
            <p className="text-gray-600 ml-8">
              Choose from our available loan options including Bonus Loan,
              Consolidated Loan, and Emergency Loan to support your financial
              needs.
            </p>
            <Link to="/" className=" text-blue-700  text-start ml-8 mt-4">
              Check out the Loan Calculator
            </Link>
          </div>
        </div>

        <NewsSection />
      </>
    );
  }

  export default App;