function Bonus_Loan() {
	return (
    <div className="bg-white m-0 p-0">
      <header className="bg-[#E9F7DE] h-20 w-full p-6">
  <img src="public/img/ttmpc-logo.png" alt="TTMPC Logo" className="h-10 w-20 object-contain my-auto" />
</header>
<img src="public/img/bonus.png" alt="Login Banner" className="w-full h-auto object-cover my-auto" />

<section className="grid gap-8">
  <div className="max-w-6xl mx-auto lg:ml-80 my-6 px-4">
    <div className="bg-[#EEF6F1] rounded-xl p-7 ml-10 w-max">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <label className="flex items-center space-x-2">
            <input type="checkbox" name="new" className="h-4 w-4" />
            <span className="text-sm">New</span>
          </label>
          <label className="flex items-center space-x-2 p-6">
            <input type="checkbox" name="renew" className="h-4 w-4 " />
            <span className="text-sm">Renewal</span>
          </label>
        </div>
        <div className="flex items-center space-x-8">
          <div>
            <label htmlFor="control-number" className="block text-xs text-gray-600 mb-1">Control No.</label>
            <input id="control-number" name="control-number" type="text" className="border border-gray-300 rounded-md px-3 py-2 w-full lg:w-64" />
          </div>
          <div>
            <label htmlFor="date-applied" className="block text-xs text-gray-600 mb-1">Date Applied</label>
            <input id="date-applied" name="date-applied" type="date" className="border border-gray-300 rounded-md px-3 py-2 w-full lg:w-48" />
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
  </div>
  )
}

export default Bonus_Loan
