/**
 * speech.js - 音声認識 (STT) & 音声合成 (TTS) モジュール
 * iOS Safari / WebKit 特有の音声再生制限（Audio Unlock・マナーモード・GCバグ）に対応
 */

export class SpeechManager {
  constructor(settingsManager, avatarController) {
    this.settingsManager = settingsManager;
    this.avatar = avatarController;

    // 音声認識 (SpeechRecognition)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognitionAvailable = !!SpeechRecognition;
    this.recognition = SpeechRecognition ? new SpeechRecognition() : null;
    this.isListening = false;
    this.manualStop = false;

    // 音声合成 (SpeechSynthesis)
    this.synthesis = window.speechSynthesis;
    this.voices = [];
    this.isSpeaking = false;
    this.audioUnlocked = false;

    // コールバック
    this.onResultCallback = null;
    this.onInterimCallback = null;
    this.onStatusChangeCallback = null;

    this.initTTS();
    this.initSTT();
  }

  /* ========================================================
     iOS Audio Unlock (ユーザー操作時にオーディオ制限を解除)
     ======================================================== */
  unlockAudio() {
    if (this.audioUnlocked) return;

    try {
      // 1. Web Audio APIのアンロック（無音バッファ再生）
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
      }

      // 2. SpeechSynthesis のアンロック（極小のダミー発話）
      if (this.synthesis) {
        if (this.synthesis.paused) {
          this.synthesis.resume();
        }
        const dummy = new SpeechSynthesisUtterance(' ');
        dummy.volume = 0.01;
        dummy.rate = 2.0;
        dummy.onend = () => {
          this.audioUnlocked = true;
        };
        dummy.onerror = () => {
          this.audioUnlocked = true;
        };
        this.synthesis.speak(dummy);
      }
      this.audioUnlocked = true;
    } catch (e) {
      console.warn('Audio unlock warning:', e);
    }
  }

  /* ========================================================
     音声合成 (TTS)
     ======================================================== */
  initTTS() {
    if (!this.synthesis) {
      console.warn('SpeechSynthesis is not supported on this browser.');
      return;
    }

    const loadVoices = () => {
      this.voices = this.synthesis.getVoices();
    };

    loadVoices();
    if (this.synthesis.onvoiceschanged !== undefined) {
      this.synthesis.onvoiceschanged = loadVoices;
    }
  }

  getJapaneseVoices() {
    if (!this.voices || this.voices.length === 0) {
      if (this.synthesis) {
        this.voices = this.synthesis.getVoices();
      }
    }
    return (this.voices || []).filter(v => v.lang.startsWith('ja') || v.lang.includes('JP'));
  }

  /**
   * テキストを音声で読み上げ、アバターをリップシンクさせる
   * @param {string} text
   * @returns {Promise<void>}
   */
  speak(text) {
    return new Promise((resolve) => {
      if (!this.synthesis || !text) {
        resolve();
        return;
      }

      // アンロックがまだなら実行
      this.unlockAudio();

      // iOS Safariのスタック対策：一旦cancelしてresume
      if (this.synthesis.speaking || this.synthesis.pending) {
        this.synthesis.cancel();
      }
      if (this.synthesis.paused) {
        this.synthesis.resume();
      }

      // 記号や絵文字のクリーン化
      const cleanText = text
        .replace(/[✨💧❓❗★☆♪]/g, '')
        .trim();

      if (!cleanText) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'ja-JP';
      utterance.volume = 1.0;

      // 設定反映
      utterance.pitch = parseFloat(this.settingsManager.get('voicePitch')) || 1.1;
      utterance.rate = parseFloat(this.settingsManager.get('voiceRate')) || 1.05;

      // ボイス選択
      const voiceName = this.settingsManager.get('voiceName');
      const jaVoices = this.getJapaneseVoices();
      if (voiceName) {
        const found = jaVoices.find(v => v.name === voiceName);
        if (found) utterance.voice = found;
      } else if (jaVoices.length > 0) {
        // iOS: Kyoko, Otoya, Siri / Android: Google
        const preferred = jaVoices.find(v => 
          v.name.includes('Kyoko') || 
          v.name.includes('Otoya') || 
          v.name.includes('Google') || 
          v.name.includes('Siri') ||
          v.name.includes('Natural')
        ) || jaVoices[0];
        utterance.voice = preferred;
      }

      let hasEnded = false;
      const finish = () => {
        if (hasEnded) return;
        hasEnded = true;
        this.isSpeaking = false;
        this.avatar.stopLipSync();
        this.notifyStatus('idle');
        // GC対策配列から除外
        if (window._activeUtterances) {
          window._activeUtterances = window._activeUtterances.filter(u => u !== utterance);
        }
        resolve();
      };

      utterance.onstart = () => {
        this.isSpeaking = true;
        this.avatar.startLipSync();
        this.notifyStatus('speaking');
      };

      utterance.onend = finish;
      utterance.onerror = (e) => {
        console.warn('SpeechSynthesis error:', e);
        finish();
      };

      // iOS Safari特有のGCバグ対策（グローバル配列に保持してGC回収を防止）
      window._activeUtterances = window._activeUtterances || [];
      window._activeUtterances.push(utterance);

      // 安全のための最大タイムアウト（万が一終了イベントが来ない場合）
      const approxDuration = Math.max(3000, cleanText.length * 350);
      setTimeout(() => {
        if (!hasEnded && this.isSpeaking) {
          finish();
        }
      }, approxDuration);

      // iOS Safariの短い遅延後の発火（即座に呼ぶと無音になる不具合の回避）
      setTimeout(() => {
        try {
          this.synthesis.speak(utterance);
        } catch (e) {
          console.warn('speak failed:', e);
          finish();
        }
      }, 50);
    });
  }

  stopSpeaking() {
    if (this.synthesis) {
      try {
        this.synthesis.cancel();
      } catch (e) {
        console.warn(e);
      }
    }
    this.isSpeaking = false;
    this.avatar.stopLipSync();
  }

  /* ========================================================
     音声認識 (STT)
     ======================================================== */
  initSTT() {
    if (!this.recognition) return;

    this.recognition.lang = 'ja-JP';
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.manualStop = false;
      this.notifyStatus('listening');
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (interimTranscript && this.onInterimCallback) {
        this.onInterimCallback(interimTranscript);
      }

      if (finalTranscript && this.onResultCallback) {
        this.onResultCallback(finalTranscript);
      }
    };

    this.recognition.onerror = (event) => {
      console.warn('SpeechRecognition error:', event.error);
      this.isListening = false;
      this.notifyStatus('idle');

      // iOS等のマイク権限エラー通知
      if (event.error === 'not-allowed') {
        alert('マイクの使用が許可されていません。ブラウザ（Safari等）の設定でマイクへのアクセスを「許可」してください。');
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.notifyStatus('idle');
    };
  }

  startListening() {
    // ユーザー操作のタイミングでiOSオーディオをアンロック
    this.unlockAudio();

    if (!this.recognition) {
      alert('お使いのブラウザは音声認識 (Web Speech API) に対応していません。SafariまたはChromeをご利用ください。');
      return false;
    }

    if (this.isSpeaking) {
      this.stopSpeaking();
    }

    if (this.isListening) return true;

    try {
      this.manualStop = false;
      this.recognition.start();
      return true;
    } catch (e) {
      console.warn('SpeechRecognition start failed:', e);
      return false;
    }
  }

  stopListening() {
    if (!this.recognition || !this.isListening) return;
    this.manualStop = true;
    try {
      this.recognition.stop();
    } catch (e) {
      console.warn(e);
    }
  }

  toggleListening() {
    if (this.isListening) {
      this.stopListening();
      return false;
    } else {
      return this.startListening();
    }
  }

  notifyStatus(status) {
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(status);
    }
  }
}
