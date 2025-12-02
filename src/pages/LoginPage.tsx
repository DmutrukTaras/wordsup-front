import { FormEvent, useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import api from '../api/client';

const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem('authToken');

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      
      localStorage.setItem('authToken', res.data.token);
      localStorage.setItem('userEmail', res.data.user.email);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Помилка логіну');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4 text-center">Вхід</h1>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div>
          <label className="block text-sm mb-1">Email</label>
          <input
            type="email"
            className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Пароль</label>
          <input
            type="password"
            className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60"
        >
          {loading ? 'Логін...' : 'Увійти'}
        </button>
      </form>
      <p className="text-sm text-center mt-3">
        Немає акаунта?{' '}
        <Link className="text-emerald-400 hover:underline" to="/register">
          Зареєструватися
        </Link>
      </p>
    </div>
  );
};

export default LoginPage;
