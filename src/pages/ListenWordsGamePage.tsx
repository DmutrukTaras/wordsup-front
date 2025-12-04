// src/pages/ListenWordsGamePage.tsx

import React, {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
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

type StatusFilter = 'all' | 'unknown' | 'learning' | 'known';
type PlayOrder = 'inOrder' | 'shuffle';

interface ListenSettings {
  groupId: number | 'all';
  status: StatusFilter;
  order: PlayOrder;
  basePauseMs: number;
  hideUkIfNoVoice: boolean;
  enVoiceUri: string | null;
  ukVoiceUri: string | null;
}

const shuffle = <T,>(arr: T[]): T[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

// "переривана" пауза — перевіряємо stopRef кожні 100 мс
const wait = (
  ms: number,
  stopRef: React.MutableRefObject<boolean>
) =>
  new Promise<void>((resolve) => {
    const start = Date.now();

    const tick = () => {
      if (stopRef.current) return resolve();
      if (Date.now() - start >= ms) return resolve();
      setTimeout(tick, 100);
    };

    tick();
  });

const ListenWordsGamePage: React.FC = () => {
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

  const [settings, setSettings] = useState<ListenSettings>({
    groupId: 'all',
    status: 'all',
    order: 'inOrder',
    basePauseMs: 1500,
    hideUkIfNoVoice: false,
    enVoiceUri: null,
    ukVoiceUri: null
  });

  const [availableEnVoices, setAvailableEnVoices] = useState<
    SpeechSynthesisVoice[]
  >([]);
  const [availableUkVoices, setAvailableUkVoices] = useState<
    SpeechSynthesisVoice[]
  >([]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // refs з "актуальними" даними для ефекту програвання
  const stopRequestedRef = useRef(false);
  const playlistRef = useRef<Word[]>([]);
  const settingsRef = useRef(settings);
  const enVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const ukVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const currentIndexRef = useRef(0);

  // ====== завантаження голосів ======
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();

      const en = voices.filter((v) =>
        v.lang.toLowerCase().startsWith('en')
      );
      // тут беремо uk* + ru*
      const ukRu = voices.filter((v) => {
        const lang = v.lang.toLowerCase();
        return lang.startsWith('uk') || lang.startsWith('ru');
      });

      setAvailableEnVoices(en);
      setAvailableUkVoices(ukRu);

      setSettings((prev) => ({
        ...prev,
        enVoiceUri: prev.enVoiceUri ?? en[0]?.voiceURI ?? null,
        ukVoiceUri: prev.ukVoiceUri ?? ukRu[0]?.voiceURI ?? null
      }));
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const selectedEnVoice = useMemo(() => {
    if (!settings.enVoiceUri) return null;
    return (
      availableEnVoices.find(
        (v) => v.voiceURI === settings.enVoiceUri
      ) ?? null
    );
  }, [availableEnVoices, settings.enVoiceUri]);

  const selectedUkVoice = useMemo(() => {
    if (!settings.ukVoiceUri) return null;
    return (
      availableUkVoices.find(
        (v) => v.voiceURI === settings.ukVoiceUri
      ) ?? null
    );
  }, [availableUkVoices, settings.ukVoiceUri]);

  const ukVoicesAvailable = availableUkVoices.length > 0;

  // ====== плейліст ======
  const playlist: Word[] = useMemo(() => {
    if (!words) return [];

    let pool = [...words];

    if (settings.groupId !== 'all') {
      pool = pool.filter((w) => w.group_id === settings.groupId);
    }

    if (settings.status !== 'all') {
      pool = pool.filter((w) => w.status === settings.status);
    }

    if (settings.order === 'shuffle') {
      pool = shuffle(pool);
    }

    return pool;
  }, [words, settings]);

  const currentWord: Word | null =
    playlist.length > 0 && currentIndex < playlist.length
      ? playlist[currentIndex]
      : null;

  // синхронізуємо стейти з рефами
  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    enVoiceRef.current = selectedEnVoice;
  }, [selectedEnVoice]);

  useEffect(() => {
    ukVoiceRef.current = selectedUkVoice;
  }, [selectedUkVoice]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // ====== helper: проговорити текст ======
  const speak = (text: string, voice: SpeechSynthesisVoice | null) =>
    new Promise<void>((resolve) => {
      if (
        typeof window === 'undefined' ||
        !window.speechSynthesis ||
        !text.trim()
      ) {
        return resolve();
      }

      const utter = new SpeechSynthesisUtterance(text);
      if (voice) utter.voice = voice;

      const handleEnd = () => {
        utter.onend = null;
        utter.onerror = null;
        resolve();
      };

      utter.onend = handleEnd;
      utter.onerror = handleEnd;

      window.speechSynthesis.speak(utter);
    });

  // ====== основний авто-цикл (тільки isPlaying у залежностях!) ======
  useEffect(() => {
    if (!isPlaying || !playlistRef.current.length) return;

    stopRequestedRef.current = false;

    const run = async () => {
      const basePause = settingsRef.current.basePauseMs;

      for (
        let i = currentIndexRef.current;
        i < playlistRef.current.length;
        i++
      ) {
        if (stopRequestedRef.current) break;

        const w = playlistRef.current[i];
        currentIndexRef.current = i;
        setCurrentIndex(i);

        // слово англійською
        await speak(w.word_en, enVoiceRef.current);
        if (stopRequestedRef.current) break;

        const shouldSpeakUk =
          w.translation_uk &&
          (!settingsRef.current.hideUkIfNoVoice || ukVoiceRef.current);

        if (shouldSpeakUk) {
          await wait(basePause, stopRequestedRef);
          if (stopRequestedRef.current) break;

          await speak(
            w.translation_uk || '',
            ukVoiceRef.current
          );
          if (stopRequestedRef.current) break;
        }
        await wait(basePause * 2, stopRequestedRef);
        if (stopRequestedRef.current) break;

      }

      setIsPlaying(false);
    };

    run();

    return () => {
      stopRequestedRef.current = true;
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isPlaying]);

  // зупинка при розмонтуванні
  useEffect(() => {
    return () => {
      stopRequestedRef.current = true;
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // ====== обробники ======
  const handleStart = () => {
    if (!playlist.length) return;
    stopRequestedRef.current = false;
    currentIndexRef.current = 0;
    setCurrentIndex(0);
    setIsPlaying(true);
  };

  const handleStop = () => {
    stopRequestedRef.current = true;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
  };

  const handleRepeatCurrent = async () => {
    if (!currentWord) return;

    stopRequestedRef.current = false;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    const basePause = settings.basePauseMs;

    await speak(currentWord.word_en, selectedEnVoice);
    await wait(basePause, stopRequestedRef);

    const shouldSpeakUk =
      currentWord.translation_uk &&
      (!settings.hideUkIfNoVoice || selectedUkVoice);

    if (shouldSpeakUk) {
      await speak(
        currentWord.translation_uk || '',
        selectedUkVoice
      );
    }
  };

  const handleNext = () => {
    if (!playlist.length) return;
    setCurrentIndex((prev) =>
      prev + 1 < playlist.length ? prev + 1 : prev
    );
    currentIndexRef.current = Math.min(
      currentIndexRef.current + 1,
      playlist.length - 1
    );
  };

  const canPlay = playlist.length > 0;

  // ====== UI ======
  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">
        Гра: Слухати слова
      </h1>

      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 max-w-5xl mx-auto space-y-4">
        {/* НАЛАШТУВАННЯ */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold mb-1">
            Налаштування
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
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
              <label className="block text-xs mb-1">
                Статус слів
              </label>
              <select
                className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700"
                value={settings.status}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    status: e.target
                      .value as StatusFilter
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
                Порядок
              </label>
              <select
                className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700"
                value={settings.order}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    order: e.target
                      .value as PlayOrder
                  }))
                }
              >
                <option value="inOrder">Як у списку</option>
                <option value="shuffle">Перемішати</option>
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1">
                Базова пауза
              </label>
              <select
                className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700"
                value={settings.basePauseMs}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    basePauseMs: Number(e.target.value)
                  }))
                }
              >
                <option value={1500}>1.5 c</option>
                <option value={2000}>2 c</option>
                <option value={2500}>2.5 c</option>
                <option value={3000}>3 c</option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                Схема: слово → пауза → переклад → пауза ×2 →
                наступне.
              </p>
            </div>

            {/* Голоси */}
            <div>
              <label className="block text-xs mb-1">
                Голос для англійської (EN)
              </label>
              <select
                className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700"
                value={settings.enVoiceUri ?? ''}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    enVoiceUri: e.target.value || null
                  }))
                }
              >
                {availableEnVoices.length === 0 && (
                  <option value="">
                    Немає доступних EN-голосів
                  </option>
                )}
                {availableEnVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1">
                Голос для української (UK/RU)
              </label>
              <select
                className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700"
                value={settings.ukVoiceUri ?? ''}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    ukVoiceUri: e.target.value || null
                  }))
                }
              >
                {availableUkVoices.length === 0 && (
                  <option value="">
                    Немає голосів uk*/ru* (можна вимкнути
                    переклад нижче)
                  </option>
                )}
                {availableUkVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-2 text-xs text-slate-300 mt-2">
                <input
                  type="checkbox"
                  className="accent-emerald-500"
                  checked={settings.hideUkIfNoVoice}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      hideUkIfNoVoice: e.target.checked
                    }))
                  }
                />
                <span>
                  Не читати український переклад, якщо немає
                  uk*/ru* голосу
                </span>
              </label>
            </div>
          </div>

          <p className="text-xs text-slate-400">
            Доступно слів за фільтрами:{' '}
            <span className="font-semibold">
              {playlist.length}
            </span>
          </p>

          <button
            type="button"
            disabled={!canPlay || isPlaying}
            onClick={handleStart}
            className="inline-flex justify-center w-full md:w-auto items-center gap-2 px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-sm"
          >
            ▶ Запустити прослуховування
          </button>
        </div>

        {/* ПАНЕЛЬ ПРОГРАВАННЯ */}
        <div className="mt-4 border-t border-slate-700 pt-4 space-y-3">
          <div className="flex justify-between items-center text-sm mb-2">
            <span>
              Слів у плейлісті:{' '}
              <span className="font-semibold">
                {playlist.length}
              </span>
            </span>
            <span>
              Поточне:{' '}
              <span className="font-semibold">
                {playlist.length
                  ? `${currentIndex + 1}/${playlist.length}`
                  : '—'}
              </span>
            </span>
          </div>

          <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{
                width: playlist.length
                  ? `${((currentIndex + 1) / playlist.length) * 100}%`
                  : '0%'
              }}
            />
          </div>

          <div className="bg-slate-950/40 rounded-lg border border-slate-700 p-4 flex md:flex-row flex-col gap-4 items-center min-h-[140px]">
            {/* Картинка */}
            {currentWord?.image_url && (
              <img
                src={currentWord.image_url}
                alt={currentWord.word_en}
                className="w-28 h-28 object-cover rounded-md border border-slate-700 flex-shrink-0"
              />
            )}

            <div className="flex-1 text-center md:text-left">
              <p className="text-xs text-slate-400 mb-1">
                Поточне слово
              </p>
              <p className="text-3xl font-semibold mb-1">
                {currentWord?.word_en ?? '—'}
              </p>
              {currentWord?.transcription && (
                <p className="text-sm text-slate-400 mb-1">
                  [{currentWord.transcription}]
                </p>
              )}
              {currentWord?.translation_uk && (
                <p className="text-lg text-slate-200">
                  {currentWord.translation_uk}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 justify-between items-center mt-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleRepeatCurrent}
                disabled={!currentWord}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-sm"
              >
                🔁 Повторити
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={
                  !currentWord ||
                  currentIndex >= playlist.length - 1
                }
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-sm"
              >
                ⏭ Наступне
              </button>
            </div>

            <button
              type="button"
              onClick={handleStop}
              disabled={!isPlaying}
              className="w-full md:w-auto justify-center inline-flex items-center gap-2 px-4 py-2 rounded-md bg-red-500 hover:bg-red-600 disabled:opacity-60 text-sm"
            >
              ⏹ Зупинити
            </button>
          </div>
        </div>
      </div>

      {wordsLoading && (
        <p className="text-xs text-slate-400 mt-3">
          Завантаження слів…
        </p>
      )}
    </div>
  );
};

export default ListenWordsGamePage;
