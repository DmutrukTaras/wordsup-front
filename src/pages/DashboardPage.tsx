import { Link } from 'react-router-dom';

const DashboardPage = () => {
  return (
    <div>
      <h1 className="text-xl font-semibold mb-2">Ваш словник</h1>
      <p className="text-sm text-slate-300 mb-4">
        Почніть з створення груп слів, а потім додайте слова в ці групи.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          to="/groups"
          className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 w-full md:w-auto justify-center md:justify-normal text-sm flex"
        >
          Перейти до груп
        </Link>
        <Link
          to="/words"
          className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 w-full md:w-auto justify-center md:justify-normal text-sm flex"
        >
          Переглянути всі слова
        </Link>
        <Link
          to="/words/new"
          className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 w-full md:w-auto justify-center md:justify-normal text-sm flex"
        >
          Додати нове слово
        </Link>
      </div>
      <p className="text-md font-semibold mb-2 mt-2">Вправи</p>
      <div className="flex flex-wrap gap-3">
        <Link
          to="/games/multipleChoice"
          className="px-4 py-2 rounded-md bg-indigo-500 hover:bg-indigo-600 w-full md:w-auto justify-center md:justify-normal text-sm flex"
        >
          Варіанти
        </Link>
        <Link
          to="/games/buildWord"
          className="px-4 py-2 rounded-md bg-indigo-500 hover:bg-indigo-600 w-full md:w-auto justify-center md:justify-normal text-sm flex"
        >
          Склади слово
        </Link>
        <Link
          to="/games/columnPairs"
          className="px-4 py-2 rounded-md bg-indigo-500 hover:bg-indigo-600 w-full md:w-auto justify-center md:justify-normal text-sm flex"
        >
         Пари слів
        </Link>
      </div>
      <p className="text-md font-semibold mb-2 mt-2">Ігри</p>
      <div className="flex flex-wrap gap-3">
        <Link
          to="/games/matchingPairs"
          className="px-4 py-2 rounded-md bg-emerald-700 hover:bg-emerald-800 w-full md:w-auto justify-center md:justify-normal text-sm flex"
        >
          Знайди пару
        </Link>
      </div>
    </div>
  );
};

export default DashboardPage;
