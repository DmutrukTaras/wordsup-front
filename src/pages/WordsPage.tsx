import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { Link } from 'react-router-dom';

interface Group {
  id: number;
  name: string;
}

interface Word {
  id: number;
  group_id: number;
  word_en: string;
  transcription: string | null;
  translation_uk: string | null;
  image_url: string | null;
  image_source: 'api' | 'uploaded';
  status: 'unknown' | 'learning' | 'known';
  created_at: string;
  updated_at: string;
}

const statusLabel: Record<Word['status'], string> = {
  unknown: 'Не знаю',
  learning: 'Вчу',
  known: 'Знаю'
};

const statusColor: Record<Word['status'], string> = {
  unknown: 'bg-slate-600',
  learning: 'bg-amber-500',
  known: 'bg-emerald-500'
};

const WordsPage = () => {
  const queryClient = useQueryClient();

  const [selectedGroupId, setSelectedGroupId] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<Word['status'] | 'all'>(
    'all'
  );
  const [search, setSearch] = useState('');
  const [openMenuId, setOpenMenuId] = useState<number | null>(null); // мобільне меню "⋯"

  const { data: groups } = useQuery<Group[]>({
    queryKey: ['groups'],
    queryFn: async () => {
      const res = await api.get('/groups');
      return res.data;
    }
  });

  const { data: words, isLoading } = useQuery<Word[]>({
    queryKey: ['words'],
    queryFn: async () => {
      const res = await api.get('/words');
      return res.data;
    }
  });

  const statusMutation = useMutation({
    mutationFn: async (payload: { id: number; status: Word['status'] }) => {
      await api.patch(`/words/${payload.id}/status`, {
        status: payload.status
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['words'] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/words/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['words'] });
    }
  });

  const handleStatusChange = (id: number, status: string) => {
    statusMutation.mutate({
      id,
      status: status as Word['status']
    });
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id);
  };

  const filteredWords =
    words?.filter((w) => {
      if (selectedGroupId !== 'all' && w.group_id !== selectedGroupId) {
        return false;
      }
      if (statusFilter !== 'all' && w.status !== statusFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          w.word_en.toLowerCase().includes(q) ||
          (w.translation_uk || '').toLowerCase().includes(q)
        );
      }
      return true;
    }) || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4 md:flex-row flex-col gap-3">
        <h1 className="text-xl font-semibold mb-3">Слова</h1>
        <Link
          to="/words/new"
          className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 w-full md:w-auto justify-center md:justify-normal text-sm flex"
        >
          Додати нове слово
        </Link>
      </div>

      {/* Фільтри */}
      <div className="flex flex-wrap gap-3 mb-4 text-sm">
        <div className='flex-1 min-w-[150px]'>
          <label className="block text-xs mb-1">Група</label>
          <select
            className="px-3 py-2 rounded-md bg-slate-900 border border-slate-700 w-full"
            value={selectedGroupId}
            onChange={(e) =>
              setSelectedGroupId(
                e.target.value === 'all' ? 'all' : Number(e.target.value)
              )
            }
          >
            <option value="all">Всі групи</option>
            {groups?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div className='flex-1 min-w-[150px]'>
          <label className="block text-xs mb-1">Статус</label>
          <select
            className="px-3 py-2 rounded-md bg-slate-900 border border-slate-700 w-full"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value === 'all'
                  ? 'all'
                  : (e.target.value as Word['status'])
              )
            }
          >
            <option value="all">Всі</option>
            <option value="unknown">Не знаю</option>
            <option value="learning">Вчу</option>
            <option value="known">Знаю</option>
          </select>
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs mb-1">Пошук</label>
          <input
            className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-700"
            placeholder="Слово або переклад..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Список слів */}
      {isLoading ? (
        <p className="text-sm text-slate-300">Завантаження...</p>
      ) : filteredWords.length === 0 ? (
        <p className="text-sm text-slate-300">
          Поки немає слів за цими фільтрами.
        </p>
      ) : (
        <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
          {filteredWords.map((w) => (
            <div
              key={w.id}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm"
            >
              {/* Ліва частина: статус + слово + картинка */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span
                  className={`inline-flex md:hidden w-3 h-3 rounded-full ${statusColor[w.status]}`}
                />
                <span
                  className={`hidden w-20 justify-center md:inline-flex items-center px-2 py-0.5 rounded-full text-xs ${statusColor[w.status]}`}
                >
                  {statusLabel[w.status]}
                </span>
                <div className="w-10">
                  {w.image_url && (
                    <img
                      src={w.image_url}
                      alt={w.word_en}
                      className="w-10 h-10 object-cover rounded-md border border-slate-700 flex-shrink-0"
                    />
                  )}
                </div>

                {/* Текстова частина */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">
                      {w.word_en}
                    </span>
                    {w.transcription && (
                      <span className="text-xs text-slate-400">
                        [{w.transcription}]
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 truncate">
                    {w.translation_uk || (
                      <span className="italic">немає перекладу</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Права частина: керування */}
              <div className="hidden md:flex items-center gap-2 text-xs">
                <select
                  value={w.status}
                  onChange={(e) =>
                    handleStatusChange(w.id, e.target.value)
                  }
                  className="bg-slate-800 border border-slate-600 rounded-md px-2 py-1"
                >
                  <option value="unknown">Не знаю</option>
                  <option value="learning">Вчу</option>
                  <option value="known">Знаю</option>
                </select>
                <button
                  onClick={() => handleDelete(w.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  Видалити
                </button>
              </div>

              {/* Мобільний варіант: меню з трьома крапками */}
              <div className="relative md:hidden">
                <button
                  type="button"
                  className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-lg leading-none"
                  onClick={() =>
                    setOpenMenuId((prev) => (prev === w.id ? null : w.id))
                  }
                >
                  ⋯
                </button>

                {openMenuId === w.id && (
                  <div className="absolute right-0 mt-2 w-40 bg-slate-800 border border-slate-700 rounded-md shadow-lg z-10 text-xs">
                    <div className="px-2 py-2 border-b border-slate-700">
                      <label className="block mb-1 text-[11px] text-slate-300">
                        Статус
                      </label>
                      <select
                        value={w.status}
                        onChange={(e) => {
                          handleStatusChange(w.id, e.target.value);
                          setOpenMenuId(null);
                        }}
                        className="w-full bg-slate-900 border border-slate-600 rounded-md px-2 py-1 text-xs"
                      >
                        <option value="unknown">Не знаю</option>
                        <option value="learning">Вчу</option>
                        <option value="known">Знаю</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleDelete(w.id);
                        setOpenMenuId(null);
                      }}
                      className="w-full text-left px-3 py-2 text-red-400 hover:bg-slate-700 text-xs"
                    >
                      Видалити
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WordsPage;
