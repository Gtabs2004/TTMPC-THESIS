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
    <div className="bg-[#E9F7DE] h-screen flex flex-col items-center">
      <h1 className="text-2xl font-normal text-[#66B538] mt-18 tracking-wide">
        News and Events
      </h1>
      <p className="text-gray-600 tracking-wide">
        The latest updates from your partners
      </p>
      <div className="flex gap-4">
        {newsItems.map((item) => (
          <div
            key={item.id}
            className="bg-white p-4 rounded-lg shadow-md flex flex-col"
          >
            <img
              src={item.imgSrc}
              alt={item.alt}
              className="h-48 w-full object-cover rounded-lg mb-4"
            />
            <p className="text-gray-600">{item.description}</p>
          </div>
        ))}
      </div>
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
          <li className="bg-[#E9F7DE] text-[#66B538] p-3 rounded-3xl">
            <Link to="/">Be a Member</Link>
          </li>
          <li className="bg-[#66B538] text-white p-3 rounded-3xl">
            <Link to="/">Login</Link>
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