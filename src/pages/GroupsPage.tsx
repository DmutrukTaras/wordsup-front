import { FormEvent, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

interface Group {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

const GroupsPage = () => {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#22c55e');
  const [error, setError] = useState<string | null>(null);

  // група для підтвердження видалення (null = модалка закрита)
  const [confirmGroup, setConfirmGroup] = useState<Group | null>(null);

  const { data: groups, isLoading } = useQuery<Group[]>({
    queryKey: ['groups'],
    queryFn: async () => {
      const res = await api.get('/groups');
      return res.data;
    }
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post('/groups', {
        name,
        description: description || null,
        color
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setName('');
      setDescription('');
      setError(null);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || 'Помилка створення групи');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/groups/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setConfirmGroup(null); // закриваємо модалку після успіху
    }
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Назва обовʼязкова');
      return;
    }
    createMutation.mutate();
  };

  const handleConfirmDelete = () => {
    if (!confirmGroup) return;
    deleteMutation.mutate(confirmGroup.id);
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-3">Групи слів</h1>

      <form className="mb-6 space-y-3" onSubmit={handleSubmit}>
        <div>
          <label className="block text-sm mb-1">Назва групи</label>
          <input
            className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Наприклад, Travel, Food..."
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Опис (необовʼязково)</label>
          <textarea
            className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm">Колір групи</label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-10 h-8 p-0 border-0 bg-transparent"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-sm"
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? 'Створення...' : 'Створити групу'}
        </button>
      </form>

      <div>
        <h2 className="text-lg font-semibold mb-2">Список груп</h2>
        {isLoading ? (
          <p className="text-sm text-slate-300">Завантаження...</p>
        ) : !groups || groups.length === 0 ? (
          <p className="text-sm text-slate-300">
            Поки немає жодної групи. Створи першу 👆
          </p>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm"
              >
                <div className="flex items-center gap-3">
                  {g.color && (
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: g.color }}
                    />
                  )}
                  <div>
                    <p className="font-medium">{g.name}</p>
                    {g.description && (
                      <p className="text-xs text-slate-400">
                        {g.description}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setConfirmGroup(g)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Видалити
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Модалка підтвердження видалення */}
      {confirmGroup && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-3 text-red-300">
              Видалити групу?
            </h3>
            <p className="text-sm text-slate-200 mb-2">
              Група: <span className="font-semibold">{confirmGroup.name}</span>
            </p>
            <p className="text-xs text-slate-400 mb-4">
              Ця дія <span className="font-semibold text-red-300">видалить групу та всі слова</span>, 
              які до неї належать. Дію неможливо скасувати.
            </p>

            <div className="flex flex-wrap gap-2 justify-end text-sm">
              <button
                type="button"
                className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600"
                onClick={() => setConfirmGroup(null)}
                disabled={deleteMutation.isPending}
              >
                Скасувати
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-md bg-red-500 hover:bg-red-600 disabled:opacity-60"
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Видалення...' : 'Так, видалити'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupsPage;
