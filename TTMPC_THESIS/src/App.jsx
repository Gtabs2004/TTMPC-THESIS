import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg' 
import { Link } from 'react-router-dom'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="bg-orange-500 text-white p-4 text-center m-auto  font-bold 
    flex  justify-center items-center h-screen flex-col">
      <div className="text-3xl mt-60">PONKIATSS:3</div>
      <Link to="/login" className="ml-4 bg-white px-8 py-2 rounded-xl text-sm font-medium
    text-black mt-60 border-black transform transition duration-150 hover:-translate-y-2">Click here to proceed</Link>
    </div>

      
     )
}

export default App