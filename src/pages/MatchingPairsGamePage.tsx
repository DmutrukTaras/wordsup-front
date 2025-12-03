import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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

type GamePhase = 'config' | 'playing' | 'finished';

type Mode = 'en-uk' | 'uk-en';

interface Card {
  id: string;
  wordId: number;
  side: 'en' | 'uk';
  text: string;
}

interface WordResult {
  word: Word;
  isCorrect: boolean;
}

const shuffle = <T,>(arr: T[]): T[] => {
  return [...arr].sort(() => Math.random() - 0.5);
};

const MatchingPairsGamePage = () => {
  const [phase, setPhase] = useState<GamePhase>('config');
  const [mode, setMode] = useState<Mode>('en-uk');
  const [groupId, setGroupId] = useState<number | 'all'>('all');
  const [pairsCount, setPairsCount] = useState(6);

  const [cards, setCards] = useState<Card[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matchedWordIds, setMatchedWordIds] = useState<Set<number>>(
    () => new Set()
  );
  const [wordStats, setWordStats] = useState<
    Record<number, { wrong: number; correct: number }>
  >({});
  const [moves, setMoves] = useState(0);

  const [results, setResults] = useState<WordResult[]>([]);
  const [savingStats, setSavingStats] = useState(false);

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



  const availableWords = useMemo(() => {
    console.log('Words in memo', words);
    console.log('Filtering words for groupId', groupId);
    if (!words) return [];
    let list = words.filter((w) => w.translation_uk && w.word_en);
    if (groupId !== 'all') {
      list = list.filter((w) => w.group_id === groupId);
    }
    return list;
  }, [words, groupId]);

  console.log('words', words);
  console.log('availableWords', availableWords);

  const totalPairs = useMemo(() => {
    return cards.length / 2;
  }, [cards]);

  const completedPairs = useMemo(() => {
    return matchedWordIds.size;
  }, [matchedWordIds]);

  const progress = totalPairs
    ? Math.round((completedPairs / totalPairs) * 100)
    : 0;

  const handleStart = () => {
    if (!availableWords || availableWords.length < 2) return;

    const maxPairs = Math.min(pairsCount, availableWords.length);
    const selected = shuffle(availableWords).slice(0, maxPairs);

    const newCards: Card[] = [];
    selected.forEach((word) => {
      if (mode === 'en-uk') {
        newCards.push(
          {
            id: `${word.id}-en`,
            wordId: word.id,
            side: 'en',
            text: word.word_en
          },
          {
            id: `${word.id}-uk`,
            wordId: word.id,
            side: 'uk',
            text: word.translation_uk || ''
          }
        );
      } else {
        newCards.push(
          {
            id: `${word.id}-uk`,
            wordId: word.id,
            side: 'uk',
            text: word.translation_uk || ''
          },
          {
            id: `${word.id}-en`,
            wordId: word.id,
            side: 'en',
            text: word.word_en
          }
        );
      }
    });

    setCards(shuffle(newCards));
    setFlipped([]);
    setMatchedWordIds(new Set());
    setWordStats({});
    setMoves(0);
    setResults([]);
    setPhase('playing');
  };

  const handleCardClick = (index: number) => {
    if (phase !== 'playing') return;
    if (flipped.includes(index)) return;

    const card = cards[index];
    if (!card) return;
    if (matchedWordIds.has(card.wordId)) return;

    let newFlipped = [...flipped, index];
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      const [i1, i2] = newFlipped;
      const c1 = cards[i1];
      const c2 = cards[i2];

      setMoves((m) => m + 1);

      if (c1.wordId === c2.wordId && c1.side !== c2.side) {
        // match
        setMatchedWordIds((prev) => {
          const next = new Set(prev);
          next.add(c1.wordId);
          return next;
        });

        setWordStats((prev) => {
          const curr = prev[c1.wordId] || { wrong: 0, correct: 0 };
          return {
            ...prev,
            [c1.wordId]: { ...curr, correct: curr.correct + 1 }
          };
        });

        setTimeout(() => {
          setFlipped([]);
        }, 400);
      } else {
        // not match
        setWordStats((prev) => {
          const update = (id: number) => {
            const curr = prev[id] || { wrong: 0, correct: 0 };
            return { ...curr, wrong: curr.wrong + 1 };
          };
          return {
            ...prev,
            [c1.wordId]: update(c1.wordId),
            [c2.wordId]: update(c2.wordId)
          };
        });

        setTimeout(() => {
          setFlipped([]);
        }, 650);
      }
    }
  };

  // коли всі пари зібрані — завершуємо гру
  useEffect(() => {
    if (phase !== 'playing') return;
    if (!cards.length) return;

    if (matchedWordIds.size && matchedWordIds.size === cards.length / 2) {
      const byId: Record<number, Word> = {};
      (availableWords || []).forEach((w) => {
        byId[w.id] = w;
      });

      const finalResults: WordResult[] = Array.from(matchedWordIds).map(
        (wordId) => {
          const stats = wordStats[wordId] || { wrong: 0, correct: 0 };
          const word = byId[wordId];
          return {
            word,
            // вважаємо "вивченим", якщо не було помилок для цього слова
            isCorrect: stats.wrong === 0
          };
        }
      );

      setResults(finalResults);
      setPhase('finished');
    }
  }, [matchedWordIds, cards.length, phase, availableWords, wordStats]);


  const handleSaveStats = async () => {
    if (!results.length) return;
    try {
      setSavingStats(true);
      await api.post('/stats/batch', {
        gameType: 'matching_pairs',
        results: results.map((r) => ({
          wordId: r.word.id,
          isCorrect: r.isCorrect
        }))
      });
    } catch (err) {
      console.error('Failed to save stats', err);
    } finally {
      setSavingStats(false);
    }
  };

  const handleReplay = (onlyWrong = false) => {
    if (!results.length) {
      setPhase('config');
      return;
    }

    if (!onlyWrong) {
      // просто повертаємось до конфігурації — користувач сам обере параметри
      setPhase('config');
      return;
    }

    const wrongWordIds = results
      .filter((r) => !r.isCorrect)
      .map((r) => r.word.id);

    if (!wrongWordIds.length) {
      // якщо всі слова були правильні, то просто знову конфіг
      setPhase('config');
      return;
    }

    const wrongWords = availableWords.filter((w) =>
      wrongWordIds.includes(w.id)
    );

    const newCards: Card[] = [];
    wrongWords.forEach((word) => {
      newCards.push(
        { id: `${word.id}-en`, wordId: word.id, side: 'en', text: word.word_en },
        {
          id: `${word.id}-uk`,
          wordId: word.id,
          side: 'uk',
          text: word.translation_uk || ''
        }
      );
    });

    setCards(shuffle(newCards));
    setFlipped([]);
    setMatchedWordIds(new Set());
    setWordStats({});
    setMoves(0);
    setResults([]);
    setPhase('playing');
  };

  const isLoadingInitial = !words || !groups;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Гра: Знайди пару</h1>

      {/* Конфігурація перед стартом */}
       {wordsLoading ? (
            <p className="text-sm text-slate-300">Завантаження слів...</p>
        ) : (phase === 'config' && (
        <div className="space-y-4 max-w-lg">
          <div className="p-4 rounded-lg bg-slate-900 border border-slate-700 space-y-3">
            <div>
              <label className="block text-sm mb-1">Група слів</label>
              <select
                className="w-full px-3 py-2 rounded-md bg-slate-950 border border-slate-700"
                value={groupId === 'all' ? '' : groupId}
                onChange={(e) =>
                  setGroupId(
                    e.target.value ? Number(e.target.value) : ('all' as const)
                  )
                }
              >
                <option value="">Усі групи</option>
                {groups?.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm mb-1">Режим</label>
              <select
                className="w-full px-3 py-2 rounded-md bg-slate-950 border border-slate-700"
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
              >
                <option value="en-uk">EN → UK (англ. / переклад)</option>
                <option value="uk-en">UK → EN (переклад / англ.)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm mb-1">
                Кількість пар (макс. {availableWords.length || 0})
              </label>
              <input
                type="number"
                min={2}
                max={Math.max(2, availableWords.length || 2)}
                className="w-full px-3 py-2 rounded-md bg-slate-950 border border-slate-700"
                value={pairsCount}
                onChange={(e) =>
                  setPairsCount(Math.max(2, Number(e.target.value) || 2))
                }
              />
            </div>

            <button
              type="button"
              disabled={isLoadingInitial || availableWords.length < 2}
              onClick={handleStart}
              className="w-full py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60"
            >
              Почати гру
            </button>

            {availableWords.length < 2 && (
              <p className="text-xs text-red-400">
                У вибраній групі недостатньо слів для цієї гри.
              </p>
            )}
          </div>
        </div>
      ))}

      {/* Ігрове поле */}
      {phase === 'playing' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4 text-sm mb-2">
            <span className="px-3 py-1 rounded-full bg-slate-900 border border-slate-700">
              Ходи: <span className="font-semibold">{moves}</span>
            </span>
            <span className="px-3 py-1 rounded-full bg-slate-900 border border-slate-700">
              Пари: {completedPairs}/{totalPairs}
            </span>
            <div className="flex-1 min-w-[120px]">
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {cards.map((card, index) => {
              const isFlipped =
                flipped.includes(index) || matchedWordIds.has(card.wordId);

              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => handleCardClick(index)}
                  disabled={matchedWordIds.has(card.wordId)}
                  className={`relative p-3 rounded-lg border text-sm text-center min-h-[72px] transition-transform duration-200 ${
                    isFlipped
                      ? 'bg-emerald-600 border-emerald-400 text-white scale-[1.03]'
                      : 'bg-slate-900 border-slate-700 hover:border-emerald-400 hover:scale-[1.02]'
                  }`}
                >
                  <span className="block">{isFlipped ? card.text : '???'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Результати */}
      {phase === 'finished' && (
        <div className="mt-6 space-y-4">
          <div className="p-4 rounded-lg bg-slate-900 border border-slate-700 space-y-2">
            <h2 className="font-semibold text-lg mb-2">Результати</h2>
            <p className="text-sm">
              Зібрано пар: {completedPairs} / {totalPairs}. Ходи:{' '}
              <span className="font-semibold">{moves}</span>
            </p>

            <div className="mt-3 space-y-2 max-h-80 overflow-auto pr-2">
              {results.map((r) => (
                <label
                  key={r.word.id}
                  className="flex items-center gap-3 text-sm p-2 rounded-md bg-slate-950 border border-slate-800"
                >
                  <div className="flex-1">
                    <div className="font-semibold">
                      {r.word.word_en}{' '}
                      <span className="text-xs text-slate-400">
                        ({r.word.translation_uk || ''})
                      </span>
                    </div>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 mt-3">
              <button
                type="button"
                onClick={() => handleReplay(false)}
                className="px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-sm"
              >
                Налаштувати нову гру
              </button>

              <button
                type="button"
                onClick={handleSaveStats}
                disabled={savingStats}
                className="ml-auto px-4 py-2 rounded-md bg-slate-900 border border-slate-700 hover:bg-slate-800 text-xs"
              >
                {savingStats ? 'Збереження...' : 'Зберегти в статистику'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MatchingPairsGamePage;
