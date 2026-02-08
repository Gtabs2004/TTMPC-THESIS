import { Routes, Route } from 'react-router-dom'
import Sign_in from './Index_Pages/Sign_in'
// Added .jsx and ensured path is correct
import Bonus_Loan from './Index_Pages/LOANFORMS/Bonus_Loan.jsx' 

function App() {
  return (
    <Routes>
      <Route path="/" element={<Sign_in />} />
      <Route path="/bonus-loan" element={<Bonus_Loan />} />
    </Routes>
  )
}

export default App