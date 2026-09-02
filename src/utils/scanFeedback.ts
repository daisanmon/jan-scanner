export type ScanFeedbackTone = 'success' | 'duplicate' | 'review' | 'error'

const patterns: Record<ScanFeedbackTone, { frequency: number; vibration: number | number[] }> = {
  success: { frequency: 880, vibration: 60 },
  duplicate: { frequency: 520, vibration: [35, 45, 35] },
  review: { frequency: 660, vibration: [80, 60, 80] },
  error: { frequency: 220, vibration: 180 },
}

export function playScanFeedback(tone: ScanFeedbackTone, enabled: boolean): void {
  if (!enabled) return
  navigator.vibrate?.(patterns[tone].vibration)
  try {
    const AudioContextClass = window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const context = new AudioContextClass()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = patterns[tone].frequency
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.12)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.13)
    oscillator.addEventListener('ended', () => void context.close(), { once: true })
  } catch {
    // 音声APIが使えない環境では振動または画面表示だけを利用する。
  }
}
