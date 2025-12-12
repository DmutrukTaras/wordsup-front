import { useEffect, useMemo, useState } from 'react';
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

type GameSettings = {
  groupId: number | 'all';
  status: 'all' | 'unknown' | 'learning' | 'known';
  questionCount: number;
  showImage: boolean;
  showFirstLetter: boolean;
};

type GameAnswer = {
  wordId: number;
  correct: boolean;
};

type Slot = {
  index: number;
  type: 'letter' | 'space';
  char: string | null; // те, що користувач уже поставив
  sourceButtonId?: number;
};

type LetterButton = {
  id: number;
  char: string;
};

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const BuildWordGamePage = () => {
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<GamePhase>('setup');
  const [settings, setSettings] = useState<GameSettings>({
    groupId: 'all',
    status: 'all',
    questionCount: 10,
    showImage: true,
    showFirstLetter: false
  });

  const [questions, setQuestions] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [letters, setLetters] = useState<LetterButton[]>([]);
  const [selectedState, setSelectedState] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [answers, setAnswers] = useState<GameAnswer[]>([]);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [onlyWrongRetry, setOnlyWrongRetry] = useState(false);

  const [selectedForMark, setSelectedForMark] = useState<Set<number>>(
    () => new Set()
  );

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

  // bulk stats: записуємо завершення сесії гри
  const statsMutation = useMutation({
    mutationFn: async (gameAnswers: GameAnswer[]) => {
      if (!gameAnswers.length) return;
      await api.post('/stats/bulk', {
        entries: gameAnswers.map((a) => ({
          wordId: a.wordId,
          gameType: 'build_word',
          correct: a.correct
        }))
      });
    }
  });

  // bulk "позначити як вивчені"
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

  const filteredBaseWords = useMemo(() => {
    if (!words) return [];

    let pool = words.filter((w) =>
      /^[a-zA-Z ,]+$/.test(w.word_en) // поки беремо тільки "простi" слова з латиницею та пробілами
    );

    if (settings.status !== 'all') {
      pool = pool.filter((w) => w.status === settings.status);
    }

    if (settings.groupId !== 'all') {
      const inGroup = pool.filter((w) => w.group_id === settings.groupId);
      const outOfGroup = pool.filter((w) => w.group_id !== settings.groupId);
      pool = [...inGroup, ...(inGroup.length < 10 ? outOfGroup : [])];
    }

    // потрібен український переклад
    pool = pool.filter((w) => !!w.translation_uk);

    return pool;
  }, [words, settings]);

  const buildSlotsAndLetters = (word: Word) => {
    const raw = word.word_en.trim();
    const normalized = raw.toLowerCase();

    const newSlots: Slot[] = [];
    const letterButtons: LetterButton[] = [];
    let btnId = 0;

    for (let i = 0; i < normalized.length; i++) {
      const ch = normalized[i];
      if (ch === ' ') {
        newSlots.push({
          index: newSlots.length,
          type: 'space',
          char: ' ',
          sourceButtonId: undefined
        });
      } else if (ch === ',') {
        newSlots.push({
          index: newSlots.length,
          type: 'letter',
          char: ',',
          sourceButtonId: undefined
        });
      } else {
        newSlots.push({
          index: newSlots.length,
          type: 'letter',
          char: null,
          sourceButtonId: undefined
        });
        letterButtons.push({ id: btnId++, char: ch });
      }
    }

    // опційно: фіксувати першу букву
    if (settings.showFirstLetter) {
      const firstLetterSlotIndex = newSlots.findIndex((s) => s.type === 'letter');
      if (firstLetterSlotIndex !== -1 && letterButtons.length > 0) {
        const firstChar = letterButtons[0].char;
        newSlots[firstLetterSlotIndex].char = firstChar;
        newSlots[firstLetterSlotIndex].sourceButtonId = letterButtons[0].id;
      }
    }

    // перемішуємо букви, але не забуваємо, що деякі можуть бути вже "зайняті"
    const shuffledButtons = shuffleArray(letterButtons);

    setSlots(newSlots);
    setLetters(shuffledButtons);
  };

  const startGameWithPool = (pool: Word[]) => {
    const shuffled = shuffleArray(pool);
    const limit = Math.min(
      settings.questionCount === 9999 ? shuffled.length : settings.questionCount,
      shuffled.length
    );

    const selected = shuffled.slice(0, limit);
    if (!selected.length) {
      setError('Недостатньо слів для цієї вправи.');
      return;
    }

    setQuestions(selected);
    setCurrentIndex(0);
    setAnswers([]);
    setCorrectCount(0);
    setStreak(0);
    setBestStreak(0);
    setFeedback(null);
    setSelectedState('idle');
    setSelectedForMark(new Set());
    setOnlyWrongRetry(false);
    setError(null);
    setPhase('playing');

    buildSlotsAndLetters(selected[0]);
  };

  const handleStartGame = () => {
    if (!filteredBaseWords.length) {
      setError('Немає слів, які підходять під обрані налаштування.');
      return;
    }
    startGameWithPool(filteredBaseWords);
  };

  const currentWord = phase === 'playing' ? questions[currentIndex] : null;

  // коли переходимо на інше слово
  useEffect(() => {
    if (phase === 'playing' && currentWord) {
      buildSlotsAndLetters(currentWord);
      setSelectedState('idle');
      setFeedback(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, phase]);

  const isButtonUsed = (btnId: number) =>
    slots.some((s) => s.sourceButtonId === btnId);

  const handleLetterClick = (btn: LetterButton) => {
    if (selectedState !== 'idle') return; // після перевірки не дозволяємо зміну
    if (isButtonUsed(btn.id)) return;

    const nextSlots = [...slots];
    const targetIndex = nextSlots.findIndex(
      (s) => s.type === 'letter' && s.char === null
    );
    if (targetIndex === -1) return;

    nextSlots[targetIndex] = {
      ...nextSlots[targetIndex],
      char: btn.char,
      sourceButtonId: btn.id
    };

    setSlots(nextSlots);
  };

  const handleSlotClick = (slot: Slot) => {
    if (selectedState !== 'idle') return;
    if (slot.type !== 'letter' || slot.char === null) return;

    const nextSlots = [...slots];
    const idx = nextSlots.findIndex((s) => s.index === slot.index);
    if (idx === -1) return;

    nextSlots[idx] = {
      ...nextSlots[idx],
      char: null,
      sourceButtonId: undefined
    };

    setSlots(nextSlots);
  };

  const handleResetWord = () => {
    if (!currentWord) return;
    buildSlotsAndLetters(currentWord);
    setSelectedState('idle');
    setFeedback(null);
  };

  const handleCheck = () => {
    if (!currentWord) return;
    if (selectedState !== 'idle') return;

    const answerLetters = slots
      .filter((s) => s.type === 'letter')
      .map((s) => s.char || '');

    if (answerLetters.some((ch) => !ch)) {
      setFeedback('Заповни всі літери перед перевіркою.');
      return;
    }

    const answerNormalized = answerLetters.join('').toLowerCase();
    const correctNormalized = currentWord.word_en
      .toLowerCase()
      .replace(/\s+/g, '');

    const isCorrect = answerNormalized === correctNormalized;

    setSelectedState(isCorrect ? 'correct' : 'wrong');
    setFeedback(
      isCorrect
        ? '✅ Правильно!'
        : `❌ Помилка. Правильне слово: ${currentWord.word_en}`
    );

    setAnswers((prev) => [
      ...prev,
      { wordId: currentWord.id, correct: isCorrect }
    ]);

    if (isCorrect) {
      setCorrectCount((prev) => prev + 1);
      setStreak((prev) => {
        const newVal = prev + 1;
        setBestStreak((best) => Math.max(best, newVal));
        return newVal;
      });
    } else {
      setStreak(0);
    }
  };

  const handleNext = () => {
    if (selectedState === 'idle') return;
    if (currentIndex + 1 >= questions.length) {
      // кінець гри
      setPhase('results');

      // записуємо stats
      statsMutation.mutate(answers);
      return;
    }

    setCurrentIndex((prev) => prev + 1);
  };

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

  const results = useMemo(() => {
    if (phase !== 'results') return [];
    return questions.map((w, idx) => ({
      word: w,
      correct: answers[idx]?.correct ?? false
    }));
  }, [phase, questions, answers]);

  const handleRetryAll = () => {
    if (!filteredBaseWords.length) return;
    startGameWithPool(filteredBaseWords);
  };

  const handleRetryWrongOnly = () => {
    const wrongWords = results
      .filter((r) => !r.correct)
      .map((r) => r.word);

    if (!wrongWords.length) {
      setError('Немає помилкових слів для повтору 🥳');
      return;
    }

    setOnlyWrongRetry(true);
    startGameWithPool(wrongWords);
  };

  const modeLabel = 'Склади слово з літер';

  return (
    <div>
      <h1 className="text-xl font-semibold mb-3">Вправа: Склади слово</h1>

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
                            .value as GameSettings['status']
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
                      Кількість запитань
                    </label>
                    <select
                      className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700"
                      value={settings.questionCount}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          questionCount: Number(e.target.value)
                        }))
                      }
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={9999}>Всі можливі</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="block text-xs mb-1">Підказки</label>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="accent-emerald-500"
                        checked={settings.showImage}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            showImage: e.target.checked
                          }))
                        }
                      />
                      Показувати картинку (якщо є)
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="accent-emerald-500"
                        checked={settings.showFirstLetter}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            showFirstLetter: e.target.checked
                          }))
                        }
                      />
                      Фіксувати першу літеру
                    </label>
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-400 mb-3">{error}</p>
                )}

                <button
                  type="button"
                  onClick={handleStartGame}
                  className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-sm w-full md:w-auto"
                >
                  Почати гру
                </button>
              </>
            )}
          </>
        )}

        {phase === 'playing' && currentWord && (
          <>
            {/* Верхня панель прогресу */}
            <div className="flex flex-col gap-2 mb-4 text-sm">
              <div className="flex justify-between">
                <span>
                  Питання{' '}
                  <span className="font-semibold">
                    {currentIndex + 1}/{questions.length}
                  </span>
                </span>
                <span>
                  Правильних:{' '}
                  <span className="font-semibold">{correctCount}</span>
                </span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500"
                  style={{
                    width: `${
                      ((currentIndex +
                        (selectedState !== 'idle' ? 1 : 0)) /
                        questions.length) *
                      100
                    }%`
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>{modeLabel}</span>
                <span>
                  Стрік: {streak} (кращий: {bestStreak})
                </span>
              </div>
            </div>

            {/* Переклад + картинка */}
            <div className="mb-4">
              <p className="text-xs text-slate-400 mb-1">
                Склади англійське слово:
              </p>
              {(settings.showImage && currentWord.image_url) ? (
                <img
                  src={currentWord.image_url}
                  alt={currentWord.word_en}
                  className="max-h-40 rounded-lg border border-slate-700 mb-2"
                />
              ) : (
                <p className="text-2xl font-semibold mb-1">
                    {currentWord.translation_uk}
                </p>
              )}
              {/* {currentWord.transcription && (
                <p className="text-xs text-slate-400">
                  [{currentWord.transcription}]
                </p>
              )} */}
            </div>

            {/* Слоти слова */}
            <div
              className={`mb-4 flex flex-wrap gap-2 text-xl ${
                selectedState === 'correct'
                  ? 'animate-word-correct'
                  : selectedState === 'wrong'
                  ? 'animate-word-wrong'
                  : ''
              }`}
            >
              {slots.map((slot) =>
                slot.type === 'space' ? (
                  <div
                    key={slot.index}
                    className="w-4"
                    aria-hidden="true"
                  />
                ) : (
                  <button
                    key={slot.index}
                    type="button"
                    onClick={() => handleSlotClick(slot)}
                    className={`w-10 h-10 flex items-center justify-center rounded-md border text-lg font-semibold ${
                      slot.char
                        ? 'bg-slate-800 border-slate-600'
                        : 'bg-slate-900 border-slate-700'
                    } ${
                      selectedState !== 'idle'
                        ? 'cursor-default'
                        : 'hover:bg-slate-700'
                    }`}
                    disabled={selectedState !== 'idle'}
                  >
                    {slot.char ? slot.char.toUpperCase() : ''}
                  </button>
                )
              )}
            </div>

            {/* Літери */}
            <div className="mb-4">
              <p className="text-xs text-slate-400 mb-1">
                Обери літери в правильному порядку:
              </p>
              <div className="flex flex-wrap gap-2">
                {letters.map((btn) => {
                  const used = isButtonUsed(btn.id);
                  return (
                    <button
                      key={btn.id}
                      type="button"
                      onClick={() => handleLetterClick(btn)}
                      disabled={used || selectedState !== 'idle'}
                      className={`w-10 h-10 flex items-center justify-center rounded-md border text-lg font-semibold ${
                        used
                          ? 'bg-slate-700 border-slate-600 opacity-60'
                          : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
                      } ${
                        selectedState !== 'idle'
                          ? 'cursor-default'
                          : ''
                      }`}
                    >
                      {btn.char.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>

            {feedback && (
              <p className="text-sm mb-2 text-slate-200">{feedback}</p>
            )}

            <div className="flex flex-wrap gap-2 text-sm">
              <button
                type="button"
                onClick={handleResetWord}
                disabled={slots.every(
                  (s) => s.type === 'space' || s.char === null
                )}
                className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-60"
              >
                Почати спочатку
              </button>
              <button
                type="button"
                onClick={handleCheck}
                disabled={selectedState !== 'idle'}
                className="px-3 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60"
              >
                Перевірити
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={selectedState === 'idle'}
                className="px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-60 ml-auto"
              >
                {currentIndex + 1 === questions.length
                  ? 'Завершити'
                  : 'Далі'}
              </button>
            </div>
          </>
        )}

        {phase === 'results' && (
          <>
            <h2 className="text-lg font-semibold mb-2">Результат</h2>
            <p className="text-sm mb-1">
              Правильних:{' '}
              <span className="font-semibold">
                {correctCount} / {questions.length}
              </span>
            </p>
            <p className="text-xs text-slate-400 mb-3">
              Найкращий стрік: {bestStreak}
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
                        className="w-10 h-10 object-cover rounded-md border border-slate-700"
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
                      </div>
                      <p className="text-xs text-slate-300">
                        {r.word.translation_uk}
                      </p>
                      <p className="text-[11px]">
                        {r.correct ? (
                          <span className="text-emerald-400">✅ Вірно</span>
                        ) : (
                          <span className="text-red-400">❌ Помилка</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
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
                className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 w-full md:w-auto"
              >
                {markKnownMutation.isPending
                  ? 'Оновлення...'
                  : 'Позначити як вивчені'}
              </button>

              <button
                type="button"
                onClick={handleRetryWrongOnly}
                className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 w-full md:w-auto"
              >
                Спробувати ще раз (тільки помилкові)
              </button>

              <button
                type="button"
                onClick={handleRetryAll}
                className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 w-full md:w-auto"
              >
                Спробувати ще раз (всі)
              </button>

              <button
                type="button"
                onClick={() => setPhase('setup')}
                className="px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 ml-auto w-full md:w-auto"
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

export default BuildWordGamePage;
