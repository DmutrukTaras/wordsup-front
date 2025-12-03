import { Outlet, useLocation, NavLink } from 'react-router-dom';
import Navbar from './components/Navbar';

const App = () => {
  const location = useLocation();
  const showSidebar =
    location.pathname.startsWith('/dashboard') ||
    location.pathname.startsWith('/groups') ||
    location.pathname.startsWith('/words');

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex flex-1">
        {showSidebar && (
          <aside className="hidden md:block w-64 bg-slate-950 border-r border-slate-800 p-4">
            <nav className="space-y-2 text-sm">
              <p className="text-slate-400 uppercase text-xs mb-2">
                Навігація
              </p>
              <NavLink
                to="/dashboard"
                className="block px-3 py-2 rounded-md hover:bg-slate-800"
              >
                Дашборд
              </NavLink>
              <NavLink
                to="/groups"
                className="block px-3 py-2 rounded-md hover:bg-slate-800"
              >
                Групи слів
              </NavLink>
              <NavLink
                to="/words"
                className="block px-3 py-2 rounded-md hover:bg-slate-800"
              >
                Слова
              </NavLink>
              <NavLink
                to="/words/new"
                className="block px-3 py-2 rounded-md hover:bg-slate-800"
              >
                Додати слово
              </NavLink>
              <p className="text-slate-400 uppercase text-xs mb-2">
                Вправи
              </p>
               <NavLink
                  to="/games/multipleChoice"
                  className={({ isActive }) => 
                    `block px-3 py-2 rounded-md ${
                      isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`
                  }
                >
                  Варіанти
                </NavLink>
                <NavLink
                  to="/games/buildWord"
                  className={({ isActive }) =>
                    `block px-3 py-2 rounded-md ${
                      isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`
                  }
                >
                  Склади слово
                </NavLink>
                <NavLink
                  to="/games/columnPairs"
                  className={({ isActive }) =>
                    `block px-3 py-2 rounded-md ${
                      isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`
                  }
                >
                  Пари слів
                </NavLink>
                <p className="text-slate-400 uppercase text-xs mb-2">
                  Ігри
                </p>
                <NavLink
                  to="/games/matchingPairs"
                  className={({ isActive }) =>
                    `block px-3 py-2 rounded-md ${
                      isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`
                  }
                >
                  Знайди пару
                </NavLink>
            </nav>
          </aside>
        )}
        <main className="flex-1 flex items-start justify-center px-4 py-6">
          <div className="w-full max-w-3xl bg-slate-800 rounded-xl shadow-lg p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
