import { useState, useMemo } from 'react';
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

type GameMode = 'enToUk' | 'ukToEn' | 'imageToEn';
type GamePhase = 'setup' | 'playing' | 'results';

interface Question {
  id: number;
  word: Word;
  options: string[];
  correctIndex: number;
}

interface GameSettings {
  groupId: number | 'all';
  status: 'all' | 'unknown' | 'learning' | 'known';
  questionCount: number;
  mode: GameMode;
}

interface GameAnswer {
  wordId: number;
  correct: boolean;
}

const statusLabel: Record<Word['status'], string> = {
  unknown: 'Не знаю',
  learning: 'Вчу',
  known: 'Знаю'
};

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const MultipleChoiceGamePage = () => {
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<GamePhase>('setup');
  const [settings, setSettings] = useState<GameSettings>({
    groupId: 'all',
    status: 'all',
    questionCount: 10,
    mode: 'enToUk'
  });

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [answers, setAnswers] = useState<GameAnswer[]>([]);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [error, setError] = useState<string | null>(null);
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

  // bulk-оновлення статусу "known" для обраних слів
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

    let pool = [...words];

    if (settings.status !== 'all') {
      pool = pool.filter((w) => w.status === settings.status);
    }

    // Для конкретної групи — спочатку з групи, потім інші (fallback)
    if (settings.groupId !== 'all') {
      const inGroup = pool.filter((w) => w.group_id === settings.groupId);
      const outOfGroup = pool.filter((w) => w.group_id !== settings.groupId);
      pool = [...inGroup, ...(inGroup.length < 10 ? outOfGroup : [])];
    }

    // Для різних режимів потрібні різні поля
    if (settings.mode === 'enToUk' || settings.mode === 'ukToEn') {
      pool = pool.filter((w) => !!w.translation_uk);
    } else if (settings.mode === 'imageToEn') {
      pool = pool.filter((w) => !!w.image_url);
    }

    return pool;
  }, [words, settings]);

  const buildQuestions = (pool: Word[], mode: GameMode, count: number): Question[] => {
    // потрібні мінімум 4 слова в пулі, щоб зробити 1 питання з 4 варіантами
    if (pool.length < 2) return [];

    const shuffled = shuffleArray(pool);
    const limit = Math.min(count, shuffled.length);
    const questions: Question[] = [];

    for (let i = 0; i < limit; i++) {
      const target = shuffled[i];

      // кандидатами для відволікаючих є всі інші слова
      const distractPool = pool.filter((w) => w.id !== target.id);
      const distractShuffled = shuffleArray(distractPool).slice(
        0,
        Math.max(0, 3)
      );

      let options: string[] = [];
      let correctText = '';

      if (mode === 'enToUk') {
        correctText = target.translation_uk || '';
        options = [
          correctText,
          ...distractShuffled.map((w) => w.translation_uk || '')
        ];
      } else if (mode === 'ukToEn') {
        correctText = target.word_en;
        options = [correctText, ...distractShuffled.map((w) => w.word_en)];
      } else {
        // imageToEn
        correctText = target.word_en;
        options = [correctText, ...distractShuffled.map((w) => w.word_en)];
      }

      // видаляємо порожні варіанти і дублікати
      options = options.filter(Boolean);
      options = Array.from(new Set(options));

      // якщо варіантів менше 2 — питання не дуже сенсовне, пропускаємо
      if (options.length < 2) continue;

      const shuffledOptions = shuffleArray(options);
      const correctIndex = shuffledOptions.findIndex(
        (opt) => opt === correctText
      );

      if (correctIndex === -1) continue;

      questions.push({
        id: i,
        word: target,
        options: shuffledOptions,
        correctIndex
      });
    }

    return questions;
  };

  const handleStartGame = () => {
    setError(null);
    if (!filteredBaseWords.length) {
      setError('Немає слів, які підходять під обрані фільтри.');
      return;
    }

    const qs = buildQuestions(
      filteredBaseWords,
      settings.mode,
      settings.questionCount
    );

    if (!qs.length) {
      setError(
        'Не вдалося згенерувати запитання. Спробуй обрати інші налаштування (інший режим або групу).'
      );
      return;
    }

    setQuestions(qs);
    setCurrentIndex(0);
    setSelectedIndex(null);
    setAnswers([]);
    setCorrectCount(0);
    setStreak(0);
    setBestStreak(0);
    setSelectedForMark(new Set());
    setPhase('playing');
  };

  const currentQuestion = phase === 'playing' ? questions[currentIndex] : null;

  const handleSelectOption = (index: number) => {
    if (!currentQuestion) return;
    if (selectedIndex !== null) return; // вже відповіли

    setSelectedIndex(index);

    const isCorrect = index === currentQuestion.correctIndex;

    setAnswers((prev) => [
      ...prev,
      { wordId: currentQuestion.word.id, correct: isCorrect }
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

  const handleNextQuestion = () => {
    if (currentIndex + 1 >= questions.length) {
      setPhase('results');
      return;
    }

    setCurrentIndex((prev) => prev + 1);
    setSelectedIndex(null);
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

  const handleRetry = () => {
    handleStartGame();
  };

  const results = useMemo(() => {
    if (phase !== 'results') return [];
    return questions.map((q, idx) => {
      const ans = answers[idx];
      return {
        word: q.word,
        correct: ans?.correct ?? false
      };
    });
  }, [phase, questions, answers]);

  // допоміжний текст для режимів
  const modeLabel = (mode: GameMode) => {
    switch (mode) {
      case 'enToUk':
        return 'Англ → Укр';
      case 'ukToEn':
        return 'Укр → Англ';
      case 'imageToEn':
        return 'Картинка → Англ';
    }
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-3">Вправа: Варіанти відповіді</h1>

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
                    <label className="block text-xs mb-1">Режим</label>
                    <select
                      className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700"
                      value={settings.mode}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          mode: e.target
                            .value as GameMode
                        }))
                      }
                    >
                      <option value="enToUk">Англ → Укр</option>
                      <option value="ukToEn">Укр → Англ</option>
                      <option value="imageToEn">Картинка → Англ</option>
                    </select>
                  </div>

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
                    <p className="text-[11px] text-slate-400 mt-1">
                      Якщо в групі замало слів — інші будуть добрані з усіх
                      слів.
                    </p>
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
                </div>

                {error && (
                  <p className="text-sm text-red-400 mb-3">{error}</p>
                )}

                <button
                  type="button"
                  onClick={handleStartGame}
                  className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-sm w-full md:w-auto text-center"
                >
                  Почати гру
                </button>
              </>
            )}
          </>
        )}

        {phase === 'playing' && currentQuestion && (
          <>
            {/* Верхня панель з прогресом */}
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
                      ((currentIndex + (selectedIndex !== null ? 1 : 0)) /
                        questions.length) *
                      100
                    }%`
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Режим: {modeLabel(settings.mode)}</span>
                <span>
                  Стрік: {streak} (кращий: {bestStreak})
                </span>
              </div>
            </div>

            {/* Саме питання */}
            <div className="mb-4">
              {settings.mode === 'enToUk' && (
                <>
                  <p className="text-xs text-slate-400 mb-1">
                    Обери правильний український переклад:
                  </p>
                  <p className="text-2xl font-semibold">
                    {currentQuestion.word.word_en}
                  </p>
                </>
              )}

              {settings.mode === 'ukToEn' && (
                <>
                  <p className="text-xs text-slate-400 mb-1">
                    Обери правильне англійське слово:
                  </p>
                  <p className="text-2xl font-semibold">
                    {currentQuestion.word.translation_uk}
                  </p>
                </>
              )}

              {settings.mode === 'imageToEn' && (
                <>
                  <p className="text-xs text-slate-400 mb-2">
                    Обери правильне англійське слово до картинки:
                  </p>
                  {currentQuestion.word.image_url && (
                    <img
                      src={currentQuestion.word.image_url}
                      alt={currentQuestion.word.word_en}
                      className="max-h-40 rounded-lg border border-slate-700 mb-2"
                    />
                  )}
                </>
              )}

              {currentQuestion.word.transcription && (
                <p className="text-xs text-slate-400 mt-1">
                  [{currentQuestion.word.transcription}]
                </p>
              )}
            </div>

            {/* Варіанти відповіді */}
            <div className="space-y-2 mb-4">
              {currentQuestion.options.map((opt, idx) => {
                const isSelected = selectedIndex === idx;
                const isCorrect = idx === currentQuestion.correctIndex;
                const showState = selectedIndex !== null;

                let btnClass =
                  'w-full text-left px-3 py-2 rounded-md border text-sm transition-colors ';

                if (!showState) {
                  btnClass +=
                    'bg-slate-800 border-slate-700 hover:bg-slate-700';
                } else if (isCorrect) {
                  btnClass += 'bg-emerald-600 border-emerald-500';
                } else if (isSelected && !isCorrect) {
                  btnClass += 'bg-red-600 border-red-500';
                } else {
                  btnClass += 'bg-slate-800 border-slate-700 opacity-70';
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    className={btnClass}
                    onClick={() => handleSelectOption(idx)}
                    disabled={selectedIndex !== null}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>

            {/* Кнопка далі / завершити */}
            <div className="flex justify-between items-center text-sm">
              <div className="text-xs text-slate-400">
                {selectedIndex === null
                  ? 'Обери відповідь'
                  : currentQuestion.correctIndex === selectedIndex
                  ? '✅ Правильно!'
                  : '❌ Неправильно'}
              </div>
              <button
                type="button"
                onClick={handleNextQuestion}
                disabled={selectedIndex === null}
                className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60"
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
            <p className="text-xs text-slate-400 mb-4">
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

                  {/* чекбокси тільки для правильних */}
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

export default MultipleChoiceGamePage;
