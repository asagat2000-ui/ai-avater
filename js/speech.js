/**
 * speech.js - 音声認識 (STT) & 音声合成 (TTS) モジュール
 * モバイルブラウザ特有の制限やバグに対応した安定設計
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
    this.currentUtterance = null;
    this.isSpeaking = false;

    // コールバック
    this.onResultCallback = null;
    this.onInterimCallback = null;
    this.onStatusChangeCallback = null;

    this.initTTS();
    this.initSTT();
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
    return this.voices.filter(v => v.lang.startsWith('ja') || v.lang.includes('JP'));
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

      // 既存の発話をキャンセル
      this.stopSpeaking();

      // モバイルChromeのTTSバグ対策：絵文字や記号をある程度クリーン化
      const cleanText = text
        .replace(/[✨💧❓❗★☆♪]/g, '')
        .trim();

      if (!cleanText) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'ja-JP';

      // 設定反映
      utterance.pitch = parseFloat(this.settingsManager.get('voicePitch')) || 1.1;
      utterance.rate = parseFloat(this.settingsManager.get('voiceRate')) || 1.05;

      // 選択ボイス
      const voiceName = this.settingsManager.get('voiceName');
      const jaVoices = this.getJapaneseVoices();
      if (voiceName) {
        const found = jaVoices.find(v => v.name === voiceName);
        if (found) utterance.voice = found;
      } else if (jaVoices.length > 0) {
        // 女性らしい声を優先選択（古いAndroidでもGoogle日本語音声などを選択）
        const preferred = jaVoices.find(v => v.name.includes('Google') || v.name.includes('Kyoko') || v.name.includes('Otoya') || v.name.includes('Natural')) || jaVoices[0];
        utterance.voice = preferred;
      }

      utterance.onstart = () => {
        this.isSpeaking = true;
        this.avatar.startLipSync();
        this.notifyStatus('speaking');
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        this.avatar.stopLipSync();
        this.notifyStatus('idle');
        resolve();
      };

      utterance.onerror = (e) => {
        console.warn('SpeechSynthesis error:', e);
        this.isSpeaking = false;
        this.avatar.stopLipSync();
        this.notifyStatus('idle');
        resolve();
      };

      this.currentUtterance = utterance;
      this.synthesis.speak(utterance);
    });
  }

  stopSpeaking() {
    if (this.synthesis && this.synthesis.speaking) {
      this.synthesis.cancel();
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
    this.recognition.continuous = false; // モバイルではfalseでワンフレーズ確定させる方が高安定
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
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.notifyStatus('idle');
    };
  }

  startListening() {
    if (!this.recognition) {
      alert('お使いのブラウザは音声認識 (Web Speech API) に対応していません。Chromeなどのブラウザをご利用ください。');
      return false;
    }

    // 発話中なら止める
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
