import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

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

type GamePhase = 'setup' | 'playing' | 'results';

interface GameSettings {
  groupId: number | 'all';
  status: 'all' | 'unknown' | 'learning' | 'known';
  pairCount: number;
}

interface Pair {
  leftId: number;
  rightId: number;
}

interface GameAnswer {
  wordId: number;
  correct: boolean;
}

const statusLabel: Record<Word['status'], string> = {
  unknown: 'Не знаю',
  learning: 'Вчу',
  known: 'Знаю',
};

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// кілька Tailwind-класів для різних кольорів пар
const pairColorClasses = [
  'bg-emerald-600/30 border-emerald-400',
  'bg-sky-600/30 border-sky-400',
  'bg-violet-600/30 border-violet-400',
  'bg-amber-600/30 border-amber-400',
  'bg-rose-600/30 border-rose-400',
  'bg-lime-600/30 border-lime-400',
];

const ColumnPairsGamePage = () => {
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<GamePhase>('setup');
  const [settings, setSettings] = useState<GameSettings>({
    groupId: 'all',
    status: 'all',
    pairCount: 6,
  });

  // слова, обрані для поточної гри
  const [gameWords, setGameWords] = useState<Word[]>([]);
  const [leftOrder, setLeftOrder] = useState<number[]>([]);
  const [rightOrder, setRightOrder] = useState<number[]>([]);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [selectedLeftId, setSelectedLeftId] = useState<number | null>(null);
  const [selectedRightId, setSelectedRightId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<GameAnswer[]>([]);
  const [correctCount, setCorrectCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedForMark, setSelectedForMark] = useState<Set<number>>(
    () => new Set(),
  );

  const { data: groups } = useQuery<Group[]>({
    queryKey: ['groups'],
    queryFn: async () => {
      const res = await api.get('/groups');
      return res.data;
    },
  });

  const {
    data: words = [],
    isLoading: wordsLoading,
  } = useQuery<Word[]>({
    queryKey: ['words'],
    queryFn: async () => {
      const res = await api.get('/words');
      return res.data;
    },
  });

  // bulk-оновлення статусу "known" для обраних слів
  const markKnownMutation = useMutation({
    mutationFn: async (wordIds: number[]) => {
      await Promise.all(
        wordIds.map((id) =>
          api.patch(`/words/${id}/status`, { status: 'known' }),
        ),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['words'] });
    },
  });

  // базовий пул слів з урахуванням фільтрів
  const filteredWords = useMemo(() => {
    let pool = [...words];

    if (settings.status !== 'all') {
      pool = pool.filter((w) => w.status === settings.status);
    }

    if (settings.groupId !== 'all') {
      pool = pool.filter((w) => w.group_id === settings.groupId);
    }

    // для цієї гри потрібні і англ, і укр
    pool = pool.filter((w) => !!w.word_en && !!w.translation_uk);

    return pool;
  }, [words, settings]);

  const maxPairs = Math.floor(filteredWords.length);

  // допоміжні функції
  const wordById = (id: number) =>
    gameWords.find((w) => w.id === id) as Word | undefined;

  const isWordPaired = (id: number) =>
    pairs.some((p) => p.leftId === id || p.rightId === id);

  const findPairIndexForWord = (id: number): number | null => {
    const index = pairs.findIndex(
      (p) => p.leftId === id || p.rightId === id,
    );
    return index >= 0 ? index : null;
  };

  const getPairColorClass = (wordId: number) => {
    const pairIndex = findPairIndexForWord(wordId);
    if (pairIndex === null) return '';
    const color =
      pairColorClasses[pairIndex % pairColorClasses.length];
    return color;
  };

  const startGame = () => {
    setError(null);

    if (!filteredWords.length) {
      setError('Немає слів, які підходять під обрані фільтри.');
      return;
    }

    const count = Math.min(settings.pairCount, filteredWords.length);
    if (count < 2) {
      setError('Потрібно хоча б 2 слова для цієї гри.');
      return;
    }

    const selected = shuffleArray(filteredWords).slice(0, count);
    const ids = selected.map((w) => w.id);

    setGameWords(selected);
    setLeftOrder(shuffleArray(ids));
    setRightOrder(shuffleArray(ids));
    setPairs([]);
    setSelectedLeftId(null);
    setSelectedRightId(null);
    setAnswers([]);
    setCorrectCount(0);
    setSelectedForMark(new Set());
    setPhase('playing');
  };

  const handleClickLeft = (id: number) => {
    if (phase !== 'playing') return;

    // якщо слово вже в парі — не даємо повторно використовувати
    if (isWordPaired(id)) return;

    setSelectedLeftId((prev) => (prev === id ? null : id));

    // якщо вже обрано праве — формуємо пару
    if (selectedRightId && !isWordPaired(selectedRightId)) {
      setPairs((prev) => [...prev, { leftId: id, rightId: selectedRightId }]);
      setSelectedLeftId(null);
      setSelectedRightId(null);
    }
  };

  const handleClickRight = (id: number) => {
    if (phase !== 'playing') return;
    if (isWordPaired(id)) return;

    setSelectedRightId((prev) => (prev === id ? null : id));

    if (selectedLeftId && !isWordPaired(selectedLeftId)) {
      setPairs((prev) => [...prev, { leftId: selectedLeftId, rightId: id }]);
      setSelectedLeftId(null);
      setSelectedRightId(null);
    }
  };

  const handleClearPairs = () => {
    setPairs([]);
    setSelectedLeftId(null);
    setSelectedRightId(null);
  };

  const handleCheck = async () => {
    if (pairs.length !== gameWords.length) return;

    let correct = 0;
    const newAnswers: GameAnswer[] = [];

    for (const w of gameWords) {
      const pair = pairs.find(
        (p) => p.leftId === w.id || p.rightId === w.id,
      );
      const isCorrect = !!pair && pair.leftId === pair.rightId;
      if (isCorrect) correct += 1;
      newAnswers.push({ wordId: w.id, correct: isCorrect });
    }

    setCorrectCount(correct);
    setAnswers(newAnswers);
    setPhase('results');

    // TODO: збереження статистики (підлаштуй під свій бекенд)
    // приклад, якщо в тебе є POST /stats:
    try {
      await api.post('/stats', {
        game_type: 'column_pairs',
        answers: newAnswers.map((a) => ({
          word_id: a.wordId,
          is_correct: a.correct ? 1 : 0,
        })),
      });
    } catch (err) {
      // можна тихо ігнорити або показати маленький лог
      console.warn('Не вдалося зберегти статистику', err);
    }
  };

  const handleRetry = () => {
    // перезапускаємо з тими ж налаштуваннями
    startGame();
  };

  const handleToggleMark = (wordId: number) => {
    setSelectedForMark((prev) => {
      const copy = new Set(prev);
      if (copy.has(wordId)) {
        copy.delete(wordId);
      } else {
        copy.add(wordId);
      }
      return copy;
    });
  };

  const handleMarkKnown = () => {
    const ids = Array.from(selectedForMark);
    if (!ids.length) return;
    markKnownMutation.mutate(ids);
  };

  const isAllPaired =
    phase === 'playing' && gameWords.length > 0 && pairs.length === gameWords.length;

  // результати для списку внизу
  const results = useMemo(() => {
    if (phase !== 'results') return [];
    return gameWords.map((w) => {
      const ans = answers.find((a) => a.wordId === w.id);
      return {
        word: w,
        correct: ans?.correct ?? false,
      };
    });
  }, [phase, gameWords, answers]);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-3">Вправа: Зʼєднай пари</h1>

      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 max-w-5xl mx-auto">
        {phase === 'setup' && (
          <>
            <h2 className="text-lg font-semibold mb-3">Налаштування</h2>

            {wordsLoading ? (
              <p className="text-sm text-slate-300">Завантаження слів...</p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-sm">
                  <div>
                    <label className="block text-xs mb-1">Група</label>
                    <select
                      className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700"
                      value={settings.groupId}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          groupId:
                            e.target.value === 'all'
                              ? 'all'
                              : Number(e.target.value),
                        }))
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

                  <div>
                    <label className="block text-xs mb-1">Статус слів</label>
                    <select
                      className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700"
                      value={settings.status}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          status: e.target
                            .value as GameSettings['status'],
                        }))
                      }
                    >
                      <option value="all">Всі</option>
                      <option value="unknown">Не знаю</option>
                      <option value="learning">Вчу</option>
                      <option value="known">Знаю</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs mb-1">
                      Кількість пар
                    </label>
                    <select
                      className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700"
                      value={settings.pairCount}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          pairCount: Number(e.target.value),
                        }))
                      }
                    >
                      <option value={4}>4</option>
                      <option value={6}>6</option>
                      <option value={8}>8</option>
                      <option value={10}>10</option>
                    </select>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Доступно пар: {filteredWords.length}. Реально буде
                      використано не більше за цей ліміт.
                    </p>
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-400 mb-3">{error}</p>
                )}

                <button
                  type="button"
                  onClick={startGame}
                  disabled={filteredWords.length < 2}
                  className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-sm w-full md:w-auto disabled:opacity-60"
                >
                  Почати гру
                </button>

                {filteredWords.length < 2 && (
                  <p className="text-xs text-red-400 mt-2">
                    У вибраній групі недостатньо слів для цієї гри.
                  </p>
                )}
              </>
            )}
          </>
        )}

        {phase === 'playing' && (
          <>
            <div className="flex justify-between items-center mb-3 text-sm">
              <span>
                Кількість слів:{' '}
                <span className="font-semibold">{gameWords.length}</span>
              </span>
              <span className="text-xs text-slate-400">
                Обирай по одному зі стовпчика зліва і справа, щоб
                сформувати пари.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              {/* Ліва колонка — українські слова */}
              <div>
                <h3 className="text-sm font-semibold mb-2">
                  Українські слова
                </h3>
                <div className="flex flex-col gap-2">
                  {leftOrder.map((id) => {
                    const w = wordById(id)!;
                    const paired = isWordPaired(id);
                    const isSelected = selectedLeftId === id;
                    const baseClasses =
                      'w-full text-left px-3 py-2 rounded-md border text-sm transition-colors cursor-pointer';
                    let cls = baseClasses;

                    if (paired) {
                      cls +=
                        ' ' +
                        getPairColorClass(id) +
                        ' opacity-80';
                    } else if (isSelected) {
                      cls +=
                        ' bg-slate-700 border-emerald-400 ring-2 ring-emerald-500';
                    } else {
                      cls +=
                        ' bg-slate-800 border-slate-700 hover:bg-slate-700';
                    }

                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleClickLeft(id)}
                        className={cls}
                        disabled={paired}
                      >
                        {w.translation_uk}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Права колонка — англійські слова */}
              <div>
                <h3 className="text-sm font-semibold mb-2">
                  Англійські слова
                </h3>
                <div className="flex flex-col gap-2">
                  {rightOrder.map((id) => {
                    const w = wordById(id)!;
                    const paired = isWordPaired(id);
                    const isSelected = selectedRightId === id;
                    const baseClasses =
                      'w-full text-left px-3 py-2 rounded-md border text-sm transition-colors cursor-pointer';
                    let cls = baseClasses;

                    if (paired) {
                      cls +=
                        ' ' +
                        getPairColorClass(id) +
                        ' opacity-80';
                    } else if (isSelected) {
                      cls +=
                        ' bg-slate-700 border-emerald-400 ring-2 ring-emerald-500';
                    } else {
                      cls +=
                        ' bg-slate-800 border-slate-700 hover:bg-slate-700';
                    }

                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleClickRight(id)}
                        className={cls}
                        disabled={paired}
                      >
                        {w.word_en}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm mb-2">
              <button
                type="button"
                onClick={handleClearPairs}
                className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600"
              >
                Очистити відповідності
              </button>

              <button
                type="button"
                onClick={handleCheck}
                disabled={!isAllPaired}
                className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60"
              >
                Перевірити
              </button>

              <span className="text-xs text-slate-400 ml-auto">
                Створено пар: {pairs.length} / {gameWords.length}
              </span>
            </div>

            {!isAllPaired && (
              <p className="text-xs text-slate-400">
                Щоб перевірити результат, спочатку створи пари для всіх
                слів.
              </p>
            )}
          </>
        )}

        {phase === 'results' && (
          <>
            <h2 className="text-lg font-semibold mb-2">Результат</h2>
            <p className="text-sm mb-2">
              Правильних:{' '}
              <span className="font-semibold">
                {correctCount} / {gameWords.length}
              </span>
            </p>

            <div className="max-h-64 overflow-y-auto pr-2 mb-3 space-y-2 text-sm">
              {results.map((r) => (
                <div
                  key={r.word.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-slate-800 border border-slate-700"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        {r.word.word_en}
                      </span>
                      {r.word.transcription && (
                        <span className="text-xs text-slate-400">
                          [{r.word.transcription}]
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300">
                      {r.word.translation_uk}
                    </p>
                    <p className="text-[11px] mt-1">
                      {r.correct ? (
                        <span className="text-emerald-400">
                          ✅ Вірна пара
                        </span>
                      ) : (
                        <span className="text-red-400">
                          ❌ Неправильна пара
                        </span>
                      )}
                    </p>
                  </div>

                  {r.correct && (
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        className="accent-emerald-500"
                        checked={selectedForMark.has(r.word.id)}
                        onChange={() => handleToggleMark(r.word.id)}
                      />
                      <span>Вивчене</span>
                    </label>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 text-sm">
              <button
                type="button"
                onClick={handleMarkKnown}
                disabled={
                  markKnownMutation.isPending ||
                  selectedForMark.size === 0
                }
                className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 w-full md:w-auto text-center"
              >
                {markKnownMutation.isPending
                  ? 'Оновлення...'
                  : 'Позначити як вивчені'}
              </button>

              <button
                type="button"
                onClick={handleRetry}
                className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 w-full md:w-auto text-center"
              >
                Спробувати ще раз
              </button>

              <button
                type="button"
                onClick={() => setPhase('setup')}
                className="px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 w-full md:w-auto text-center"
              >
                Змінити налаштування
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ColumnPairsGamePage;
