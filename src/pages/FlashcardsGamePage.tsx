import { useMemo, useRef, useState } from 'react';
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

type CardOrder = 'asIs' | 'random';
type SideFirst = 'en' | 'uk' | 'random';

type CardResult = 'known' | 'unknown' | 'skipped';

interface Settings {
  groupId: number | 'all';
  status: 'all' | 'unknown' | 'learning' | 'known';
  order: CardOrder;
  sideFirst: SideFirst;
}

interface ResultItem {
  word: Word;
  result: CardResult;
}

const statusLabel: Record<Word['status'], string> = {
  unknown: 'Не знаю',
  learning: 'Вчу',
  known: 'Знаю'
};

const SWIPE_THRESHOLD = 60;

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const FlashcardsGamePage = () => {
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<GamePhase>('setup');
  const [settings, setSettings] = useState<Settings>({
    groupId: 'all',
    status: 'all',
    order: 'asIs',
    sideFirst: 'en'
  });

  const [deck, setDeck] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedForMark, setSelectedForMark] = useState<Set<number>>(
    () => new Set()
  );

  // Для свайпів
  const touchRef = useRef<{
    startX: number;
    startY: number;
    dx: number;
    dy: number;
    isSwipe: boolean;
  } | null>(null);

  const { data: groups } = useQuery<Group[]>({
    queryKey: ['groups'],
    queryFn: async () => {
      const res = await api.get('/groups');
      return res.data;
    }
  });

  const { data: words, isLoading: wordsLoading } = useQuery<Word[]>({
    queryKey: ['words'],
    queryFn: async () => {
      const res = await api.get('/words');
      return res.data;
    }
  });

  // mutation для позначення як "known"
  const markKnownMutation = useMutation({
    mutationFn: async (wordIds: number[]) => {
      await Promise.all(
        wordIds.map((id) =>
          api.patch(`/words/${id}/status`, { status: 'known' })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['words'] });
    }
  });

  // Фільтруємо базовий список слів згідно налаштувань
  const filteredWords = useMemo(() => {
    if (!words) return [];

    let pool = [...words];

    if (settings.groupId !== 'all') {
      pool = pool.filter((w) => w.group_id === settings.groupId);
    }

    if (settings.status !== 'all') {
      pool = pool.filter((w) => w.status === settings.status);
    }

    // Можна відфільтрувати слова без перекладу, якщо хочеш
    // Зараз беремо всі — картка все одно буде працювати.
    if (settings.order === 'random') {
      pool = shuffle(pool);
    }

    return pool;
  }, [words, settings]);

  const currentWord =
    phase === 'playing' && deck.length > 0 ? deck[currentIndex] : null;

  const knownCount = useMemo(
    () => results.filter((r) => r.result === 'known').length,
    [results]
  );
  const unknownCount = useMemo(
    () => results.filter((r) => r.result === 'unknown').length,
    [results]
  );
  const skippedCount = useMemo(
    () => results.filter((r) => r.result === 'skipped').length,
    [results]
  );

  const handleStart = () => {
    setError(null);
    if (!filteredWords.length) {
      setError('Немає слів для обраних фільтрів.');
      return;
    }

    const newDeck =
      settings.order === 'random' ? shuffle(filteredWords) : filteredWords;

    setDeck(newDeck);
    setCurrentIndex(0);
    setIsFlipped(false);
    setResults([]);
    setSelectedForMark(new Set());
    setPhase('playing');
  };

  const handleFlip = () => {
    if (!currentWord) return;
    setIsFlipped((prev) => !prev);
  };

  const registerResultAndNext = (result: CardResult) => {
    if (!currentWord) return;

    setResults((prev) => [...prev, { word: currentWord, result }]);

    const nextIndex = currentIndex + 1;
    if (nextIndex >= deck.length) {
      setPhase('results');
    } else {
      setCurrentIndex(nextIndex);
      setIsFlipped(false);
    }
  };

  const handleKnown = () => registerResultAndNext('known');
  const handleUnknown = () => registerResultAndNext('unknown');
  const handleSkip = () => registerResultAndNext('skipped');

  const handleToggleMark = (wordId: number) => {
    setSelectedForMark((prev) => {
      const copy = new Set(prev);
      if (copy.has(wordId)) copy.delete(wordId);
      else copy.add(wordId);
      return copy;
    });
  };

  const handleMarkKnown = () => {
    const ids = Array.from(selectedForMark);
    if (!ids.length) return;
    markKnownMutation.mutate(ids);
  };

  const handleRetry = () => {
    // Просто перезапустимо з тими самими налаштуваннями
    handleStart();
  };

  // Робота зі свайпами (торкання пальцем)
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    touchRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      dx: 0,
      dy: 0,
      isSwipe: false
    };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchRef.current.startX;
    const dy = t.clientY - touchRef.current.startY;

    touchRef.current.dx = dx;
    touchRef.current.dy = dy;

    // Якщо це вже визнаний свайп — нічого більше не робимо
    if (touchRef.current.isSwipe) return;

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    // Горизонтальний свайп
    if (absX > SWIPE_THRESHOLD && absX > absY) {
      touchRef.current.isSwipe = true;

      if (dx < 0) {
        // свайп вліво — "Не знаю"
        handleUnknown();
      } else {
        // свайп вправо — "Знаю"
        handleKnown();
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchRef.current?.isSwipe) {
      // якщо був свайп — блокуємо "клік" після тачу
      e.preventDefault();
    }
    touchRef.current = null;
  };

  const progress =
    phase === 'playing' && deck.length
      ? ((currentIndex + 1) / deck.length) * 100
      : 0;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-3">Гра: Картки</h1>

      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 max-w-3xl mx-auto">
        {phase === 'setup' && (
          <>
            <h2 className="text-lg font-semibold mb-3">Налаштування</h2>

            {wordsLoading ? (
              <p className="text-sm text-slate-300">Завантаження слів...</p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-sm">
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
                              : Number(e.target.value)
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
                            .value as Settings['status']
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
                    <label className="block text-xs mb-1">Порядок</label>
                    <select
                      className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700"
                      value={settings.order}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          order: e.target.value as CardOrder
                        }))
                      }
                    >
                      <option value="asIs">Як у списку</option>
                      <option value="random">Випадковий</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs mb-1">
                      Сторона першою
                    </label>
                    <select
                      className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700"
                      value={settings.sideFirst}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          sideFirst: e.target.value as SideFirst
                        }))
                      }
                    >
                      <option value="en">Спочатку англійське</option>
                      <option value="uk">Спочатку переклад</option>
                      <option value="random">Випадково</option>
                    </select>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Картка перевертається по кліку. На мобілці можна
                      свайпати: вліво — не знаю, вправо — знаю.
                    </p>
                  </div>
                </div>

                <p className="text-xs text-slate-400 mb-3">
                  Доступно слів за фільтрами:{' '}
                  <span className="font-semibold">
                    {filteredWords.length}
                  </span>
                </p>

                {error && (
                  <p className="text-sm text-red-400 mb-3">{error}</p>
                )}

                <button
                  type="button"
                  onClick={handleStart}
                  className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-sm w-full md:w-auto"
                  disabled={!filteredWords.length}
                >
                  Почати гру
                </button>
              </>
            )}
          </>
        )}

        {phase === 'playing' && currentWord && (
          <>
            {/* Прогрес */}
            <div className="mb-4 text-sm">
              <div className="flex justify-between mb-1">
                <span>
                  Картка{' '}
                  <span className="font-semibold">
                    {currentIndex + 1}/{deck.length}
                  </span>
                </span>
                <span>
                  Знаю:{' '}
                  <span className="text-emerald-400 font-semibold">
                    {knownCount}
                  </span>{' '}
                  • Не знаю:{' '}
                  <span className="text-red-400 font-semibold">
                    {unknownCount}
                  </span>
                </span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Картка */}
              <div
                className="mb-4"
              >
                <div
                  className="flashcard-wrapper w-full max-w-xl mx-auto h-56 sm:h-64"
                  onClick={handleFlip}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  <div
                    className={
                      'flashcard-inner bg-slate-800 border border-slate-700 rounded-xl cursor-pointer select-none'
                    + (isFlipped ? ' is-flipped' : '')
                    }
                  >
                    {/* FRONT */}
                    <div className="flashcard-face front flex items-center justify-center">
                      <div className="text-center px-4">
                        {currentWord.image_url && (
                          <img
                            src={currentWord.image_url}
                            alt={currentWord.word_en}
                            className="mx-auto mb-3 max-h-24 rounded-md border border-slate-700 object-cover"
                          />
                        )}

                        <p className="text-xs text-slate-400 mb-1">
                          {settings.sideFirst === 'uk'
                            ? 'Український переклад'
                            : 'Англійське слово'}
                        </p>

                        <p className="text-3xl font-semibold mb-1">
                          {settings.sideFirst === 'uk'
                            ? currentWord.translation_uk || '—'
                            : currentWord.word_en}
                        </p>

                        {settings.sideFirst !== 'uk' && currentWord.transcription && (
                          <p className="text-sm text-slate-400">
                            [{currentWord.transcription}]
                          </p>
                        )}
                      </div>
                    </div>

                    {/* BACK */}
                    <div className="flashcard-face back flex items-center justify-center">
                      <div className="text-center px-4">
                        {currentWord.image_url && (
                          <img
                            src={currentWord.image_url}
                            alt={currentWord.word_en}
                            className="mx-auto mb-3 max-h-24 rounded-md border border-slate-700 object-cover"
                          />
                        )}

                        <p className="text-xs text-slate-400 mb-1">
                          {settings.sideFirst === 'uk'
                            ? 'Англійське слово'
                            : 'Український переклад'}
                        </p>

                        <p className="text-3xl font-semibold mb-1">
                          {settings.sideFirst === 'uk'
                            ? currentWord.word_en
                            : currentWord.translation_uk || '—'}
                        </p>

                        {settings.sideFirst === 'uk' && currentWord.transcription && (
                          <p className="text-sm text-slate-400">
                            [{currentWord.transcription}]
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-center text-xs text-slate-400 mt-2">
                  Клік — перевернути. Свайп вліво — “Не знаю”, свайп вправо — “Знаю”.
                </p>
              </div>


            {/* Кнопки керування */}
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                type="button"
                onClick={handleUnknown}
                className="px-4 py-2 rounded-md bg-red-500 hover:bg-red-600 text-sm w-full sm:w-auto"
              >
                Не знаю
              </button>
              <button
                type="button"
                onClick={handleSkip}
                className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-sm w-full sm:w-auto"
              >
                Пропустити
              </button>
              <button
                type="button"
                onClick={handleKnown}
                className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-sm w-full sm:w-auto"
              >
                Знаю
              </button>
            </div>
          </>
        )}

        {phase === 'results' && (
          <>
            <h2 className="text-lg font-semibold mb-2">Результат</h2>
            <p className="text-sm mb-2">
              Знаю:{' '}
              <span className="text-emerald-400 font-semibold">
                {knownCount}
              </span>{' '}
              • Не знаю:{' '}
              <span className="text-red-400 font-semibold">
                {unknownCount}
              </span>{' '}
              • Пропущені:{' '}
              <span className="text-slate-200 font-semibold">
                {skippedCount}
              </span>
            </p>

            <div className="max-h-64 overflow-y-auto pr-2 mb-3 space-y-2 text-sm">
              {results.map((r) => (
                <div
                  key={r.word.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-slate-800 border border-slate-700"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {r.word.image_url && (
                      <img
                        src={r.word.image_url}
                        alt={r.word.word_en}
                        className="w-10 h-10 object-cover rounded-md border border-slate-700 flex-shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          {r.word.word_en}
                        </span>
                        {r.word.transcription && (
                          <span className="text-xs text-slate-400">
                            [{r.word.transcription}]
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400">
                          • {statusLabel[r.word.status]}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 truncate">
                        {r.word.translation_uk}
                      </p>
                      <p className="text-[11px]">
                        {r.result === 'known' && (
                          <span className="text-emerald-400">
                            ✅ Знаю
                          </span>
                        )}
                        {r.result === 'unknown' && (
                          <span className="text-red-400">
                            ❌ Не знаю
                          </span>
                        )}
                        {r.result === 'skipped' && (
                          <span className="text-slate-300">
                            ↷ Пропущене
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {r.result === 'known' && (
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

export default FlashcardsGamePage;
