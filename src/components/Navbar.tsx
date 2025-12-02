import { Link, useNavigate } from 'react-router-dom';

const Navbar = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('authToken');

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userEmail');
    navigate('/login');
  };

  return (
    <nav className="w-full bg-slate-950 border-b border-slate-700 px-4 py-3 flex justify-between items-center">
      <Link to="/" className="font-semibold text-lg">
        WordsUp
      </Link>
      <div className="flex items-center gap-3 text-sm">
        {token ? (
          <>
            <span className="text-slate-300 hidden sm:inline">
              {localStorage.getItem('userEmail')}
            </span>
            <button
              className="px-3 py-1 rounded-md bg-red-500 hover:bg-red-600 text-white"
              onClick={handleLogout}
            >
              Вийти
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="hover:underline">
              Увійти
            </Link>
            <Link
              to="/register"
              className="px-3 py-1 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              Реєстрація
            </Link>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
