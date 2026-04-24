'use client';

let audioContextPromise: Promise<AudioContext | null> | null = null;

async function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (audioContextPromise) return audioContextPromise;

  audioContextPromise = (async () => {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }

    try {
      const context = new AudioContextClass();
      if (context.state === 'suspended') {
        await context.resume();
      }
      return context;
    } catch {
      return null;
    }
  })();

  return audioContextPromise;
}

export async function playSuccessSound() {
  const context = await getAudioContext();
  if (!context) return;

  const now = context.currentTime;
  const gain = context.createGain();
  gain.connect(context.destination);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

  const frequencies = [659.25, 783.99, 987.77];
  frequencies.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, now + index * 0.06);
    oscillator.connect(gain);
    oscillator.start(now + index * 0.06);
    oscillator.stop(now + 0.18 + index * 0.06);
  });
}
