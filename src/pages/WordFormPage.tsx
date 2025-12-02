import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

interface Group {
  id: number;
  name: string;
}

interface PexelsPhoto {
  id: number;
  url: string;
  alt: string;
}

const WordFormPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [groupId, setGroupId] = useState<number | ''>('');
  const [wordEn, setWordEn] = useState('');
  const [transcription, setTranscription] = useState('');
  const [translationUk, setTranslationUk] = useState('');
  const [status, setStatus] = useState<'unknown' | 'learning' | 'known'>(
    'unknown'
  );

  const [imageUrl, setImageUrl] = useState('');
  const [imageOptions, setImageOptions] = useState<PexelsPhoto[]>([]);
  const [loadingDict, setLoadingDict] = useState(false);
  const [loadingTranslate, setLoadingTranslate] = useState(false);
  const [loadingImages, setLoadingImages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: groups } = useQuery<Group[]>({
    queryKey: ['groups'],
    queryFn: async () => {
      const res = await api.get('/groups');
      return res.data;
    }
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post('/words', {
        groupId,
        wordEn,
        transcription: transcription || null,
        translationUk: translationUk || null,
        imageUrl: imageUrl || null,
        imageSource: imageUrl ? 'api' : 'api',
        status
        // notes більше не шлемо
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['words'] });
      navigate('/words');
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || 'Помилка створення слова');
    }
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!groupId || !wordEn.trim()) {
      setError('Група і англійське слово обовʼязкові');
      return;
    }

    createMutation.mutate();
  };

  const handleFetchDictionary = async () => {
    if (!wordEn.trim()) return;
    setLoadingDict(true);
    setError(null);
    try {
      const res = await api.get('/external/dictionary', {
        params: { word: wordEn.trim() }
      });

      if (!Array.isArray(res.data) || res.data.length === 0) {
        setError('Слово не знайдено в словнику');
        return;
      }

      const first = res.data[0];

      if (first.phonetics && first.phonetics.length > 0) {
        const ph =
          first.phonetics.find((p: any) => p.text) || first.phonetics[0];
        if (ph?.text) {
          setTranscription(ph.text);
        }
      }
    } catch (err: any) {
      setError('Не вдалося отримати дані словника');
    } finally {
      setLoadingDict(false);
    }
  };

  const handleTranslate = async () => {
    if (!wordEn.trim()) return;
    setLoadingTranslate(true);
    setError(null);
    try {
      const res = await api.post('/external/translate', {
        text: wordEn.trim(),
        source: 'en',
        target: 'uk'
      });

      if (res.data?.translatedText) {
        setTranslationUk(res.data.translatedText);
      } else {
        setError('Неочікувана відповідь від сервісу перекладу');
      }
    } catch (err: any) {
      setError('Не вдалося отримати переклад');
    } finally {
      setLoadingTranslate(false);
    }
  };

  const handleSearchImages = async () => {
    if (!wordEn.trim()) return;
    setLoadingImages(true);
    setError(null);
    try {
      const res = await api.get('/external/images', {
        params: { query: wordEn.trim() }
      });
      setImageOptions(res.data.photos || []);
    } catch (err: any) {
      setError('Не вдалося завантажити картинки (перевір PEXELS_API_KEY)');
    } finally {
      setLoadingImages(false);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-3">Додати нове слово</h1>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div>
          <label className="block text-sm mb-1">Група</label>
          <select
            className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-700"
            value={groupId}
            onChange={(e) =>
              setGroupId(e.target.value ? Number(e.target.value) : '')
            }
          >
            <option value="">Оберіть групу</option>
            {groups?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm mb-1">Англійське слово</label>
          <input
            className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-700"
            value={wordEn}
            onChange={(e) => setWordEn(e.target.value)}
            onBlur={handleFetchDictionary}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Транскрипція</label>
          <input
            className="w-full px-3 py-2 rounded-md bg-slate-600 border border-slate-700"
            value={transcription}
            onChange={(e) => setTranscription(e.target.value)}
            disabled
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Український переклад</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className="w-full sm:flex-1 px-3 py-2 rounded-md bg-slate-900 border border-slate-700"
              value={translationUk}
              onChange={(e) => setTranslationUk(e.target.value)}
            />
            <button
              type="button"
              onClick={handleTranslate}
              disabled={loadingTranslate || !wordEn.trim()}
              className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-60 text-xs sm:text-sm whitespace-nowrap"
            >
              {loadingTranslate ? 'Переклад...' : 'Запропонувати переклад'}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm mb-1">Статус (знаю / не знаю)</label>
          <select
            className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-700"
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as 'unknown' | 'learning' | 'known')
            }
          >
            <option value="unknown">Не знаю</option>
            <option value="learning">Вчу</option>
            <option value="known">Знаю</option>
          </select>
        </div>

        <div>
          <label className="block text-sm mb-1">Картинка</label>
          {imageUrl && (
            <div className="mb-2">
              <img
                src={imageUrl}
                alt="selected"
                className="max-h-32 rounded-md border border-slate-700"
              />
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2 mb-2">
            <input
              className="w-full sm:flex-1 px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-xs"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Можна вставити свій URL картинки"
            />
            <button
              type="button"
              onClick={handleSearchImages}
              disabled={loadingImages || !wordEn.trim()}
              className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-60 text-xs sm:text-sm whitespace-nowrap"
            >
              {loadingImages ? 'Картинки...' : 'Знайти картинки'}
            </button>
          </div>

          {imageOptions.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {imageOptions.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setImageUrl(img.url)}
                  className={`border rounded-md overflow-hidden ${
                    imageUrl === img.url
                      ? 'border-emerald-500'
                      : 'border-slate-700'
                  }`}
                >
                  <img
                    src={img.url}
                    alt={img.alt}
                    className="w-full h-20 object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={createMutation.isPending}
          className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-sm w-full sm:w-auto disabled:opacity-60"
        >
          {createMutation.isPending ? 'Збереження...' : 'Зберегти слово'}
        </button>
      </form>
    </div>
  );
};

export default WordFormPage;
