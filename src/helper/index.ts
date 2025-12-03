const canUseSpeech =
  typeof window !== 'undefined' && 'speechSynthesis' in window;

export function playWord(word: string) {
  if (!canUseSpeech) {
    console.warn('Speech synthesis is not supported in this browser');
    return;
  }

  // зупиняємо попередні озвучки, щоб не накладались
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'en-US';   // можна зробити налаштовуваним
  utterance.rate = 0.9;       // трохи повільніше, щоб краще чути
  utterance.pitch = 1;

  window.speechSynthesis.speak(utterance);
}