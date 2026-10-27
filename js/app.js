/**
 * app.js - メインアプリケーション統括モジュール
 */

import { SettingsManager, PRESETS } from './settings.js';
import { AvatarController } from './avatar.js';
import { GeminiClient } from './gemini.js';
import { SpeechManager } from './speech.js';
import { WakeLockManager } from './wakelock.js';

class App {
  constructor() {
    this.settings = new SettingsManager();
    this.avatar = null;
    this.gemini = null;
    this.speech = null;
    this.wakeLock = null;

    this.autoSpeakTimer = null;
    this.isProcessing = false;

    // DOM要素
    this.dom = {};
  }

  init() {
    this.cacheDom();
    this.initComponents();
    this.bindEvents();
    this.populateSettingsForm();
    this.greetOnStart();

    // Service Worker登録
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => {
          console.warn('Service Worker registration failed:', err);
        });
      });
    }
  }

  cacheDom() {
    this.dom.avatarContainer = document.getElementById('avatarContainer');
    this.dom.bubbleUser = document.getElementById('bubbleUser');
    this.dom.bubbleAvatar = document.getElementById('bubbleAvatar');
    this.dom.userText = document.getElementById('userText');
    this.dom.avatarText = document.getElementById('avatarText');
    this.dom.avatarNameLabel = document.getElementById('avatarNameLabel');
    this.dom.statusIndicator = document.getElementById('statusIndicator');

    // コントロール
    this.dom.btnMic = document.getElementById('btnMic');
    this.dom.micIcon = document.getElementById('micIcon');
    this.dom.btnTextToggle = document.getElementById('btnTextToggle');
    this.dom.textInputArea = document.getElementById('textInputArea');
    this.dom.inputMessage = document.getElementById('inputMessage');
    this.dom.btnSend = document.getElementById('btnSend');
    this.dom.btnFullscreen = document.getElementById('btnFullscreen');
    this.dom.btnSleep = document.getElementById('btnSleep');
    this.dom.btnSettings = document.getElementById('btnSettings');

    // 疑似スリープ
    this.dom.sleepOverlay = document.getElementById('sleepOverlay');
    this.dom.sleepMessage = document.getElementById('sleepMessage');

    // 設定モーダル
    this.dom.settingsModal = document.getElementById('settingsModal');
    this.dom.btnCloseSettings = document.getElementById('btnCloseSettings');
    this.dom.btnSaveSettings = document.getElementById('btnSaveSettings');
    this.dom.presetSelect = document.getElementById('presetSelect');
    this.dom.inputApiKey = document.getElementById('inputApiKey');
    this.dom.inputCharName = document.getElementById('inputCharName');
    this.dom.inputSystemPrompt = document.getElementById('inputSystemPrompt');
    this.dom.voiceSelect = document.getElementById('voiceSelect');
    this.dom.pitchSlider = document.getElementById('pitchSlider');
    this.dom.pitchVal = document.getElementById('pitchVal');
    this.dom.rateSlider = document.getElementById('rateSlider');
    this.dom.rateVal = document.getElementById('rateVal');
    this.dom.checkAutoListen = document.getElementById('checkAutoListen');
    this.dom.checkAutoSpeak = document.getElementById('checkAutoSpeak');
    this.dom.selectIdleTimeout = document.getElementById('selectIdleTimeout');
  }

  initComponents() {
    // 1. アバター
    this.avatar = new AvatarController(this.dom.avatarContainer);

    // 2. Gemini クライアント
    this.gemini = new GeminiClient(this.settings);

    // 3. 音声
    this.speech = new SpeechManager(this.settings, this.avatar);
    this.speech.onResultCallback = (text) => this.handleUserMessage(text);
    this.speech.onInterimCallback = (interim) => {
      this.dom.bubbleUser.classList.add('visible');
      this.dom.userText.textContent = interim + '…';
    };
    this.speech.onStatusChangeCallback = (status) => this.updateStatus(status);

    // 4. WakeLock & 疑似スリープ
    this.wakeLock = new WakeLockManager({
      idleTimeoutSec: this.settings.get('idleTimeoutSec'),
      onSleepStateChange: (isSleeping) => {
        if (!isSleeping) {
          // 復帰時にマイクを再開
          if (this.settings.get('autoListen') && !this.speech.isSpeaking) {
            this.speech.startListening();
          }
        }
      }
    });

    // 初回タップ時にWake Lock有効化
    const enableWakeLockOnce = () => {
      this.wakeLock.requestWakeLock();
      document.removeEventListener('click', enableWakeLockOnce);
      document.removeEventListener('touchstart', enableWakeLockOnce);
    };
    document.addEventListener('click', enableWakeLockOnce);
    document.addEventListener('touchstart', enableWakeLockOnce);

    this.resetAutoSpeakTimer();
  }

  bindEvents() {
    // マイクボタン
    this.dom.btnMic.addEventListener('click', () => {
      this.userInteracted();
      if (this.speech.isSpeaking) {
        this.speech.stopSpeaking();
      }
      this.speech.toggleListening();
    });

    // テキスト入力トグル
    this.dom.btnTextToggle.addEventListener('click', () => {
      this.userInteracted();
      this.dom.textInputArea.classList.toggle('hidden');
      if (!this.dom.textInputArea.classList.contains('hidden')) {
        this.dom.inputMessage.focus();
      }
    });

    // テキスト送信
    const sendTextInput = () => {
      const text = this.dom.inputMessage.value.trim();
      if (text) {
        this.dom.inputMessage.value = '';
        this.dom.textInputArea.classList.add('hidden');
        this.handleUserMessage(text);
      }
    };
    this.dom.btnSend.addEventListener('click', sendTextInput);
    this.dom.inputMessage.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTextInput();
      }
    });

    // 全画面トグル
    this.dom.btnFullscreen.addEventListener('click', () => {
      this.userInteracted();
      this.wakeLock.toggleFullscreen();
    });

    // 疑似スリープボタン
    this.dom.btnSleep.addEventListener('click', () => {
      this.wakeLock.enterSleepMode();
    });

    // スリープ画面タップで復帰
    this.dom.sleepOverlay.addEventListener('click', () => {
      this.wakeLock.wakeUp();
    });

    // 設定モーダル開閉
    this.dom.btnSettings.addEventListener('click', () => {
      this.userInteracted();
      this.populateSettingsForm();
      this.dom.settingsModal.classList.add('active');
    });

    this.dom.btnCloseSettings.addEventListener('click', () => {
      this.dom.settingsModal.classList.remove('active');
    });

    // プリセット変更
    this.dom.presetSelect.addEventListener('change', (e) => {
      const presetId = e.target.value;
      if (presetId && PRESETS[presetId]) {
        const p = PRESETS[presetId];
        this.dom.inputCharName.value = p.name;
        this.dom.inputSystemPrompt.value = p.systemPrompt;
        this.dom.pitchSlider.value = p.pitch;
        this.dom.pitchVal.textContent = p.pitch;
        this.dom.rateSlider.value = p.rate;
        this.dom.rateVal.textContent = p.rate;
      }
    });

    // スライダー連動
    this.dom.pitchSlider.addEventListener('input', (e) => {
      this.dom.pitchVal.textContent = e.target.value;
    });
    this.dom.rateSlider.addEventListener('input', (e) => {
      this.dom.rateVal.textContent = e.target.value;
    });

    // 設定保存
    this.dom.btnSaveSettings.addEventListener('click', () => {
      this.saveSettingsFromForm();
      this.dom.settingsModal.classList.remove('active');
      this.updateAvatarNameDisplay();
      alert('設定を保存しました！');
    });

    // 画面タップで無操作タイマーリセット
    window.addEventListener('touchstart', () => this.userInteracted(), { passive: true });
    window.addEventListener('mousedown', () => this.userInteracted());
  }

  userInteracted() {
    this.wakeLock.resetIdleTimer();
    this.resetAutoSpeakTimer();
  }

  populateSettingsForm() {
    this.dom.inputApiKey.value = this.settings.get('apiKey') || '';
    this.dom.presetSelect.value = this.settings.get('currentPreset') || 'tsundere';
    this.dom.inputCharName.value = this.settings.get('charName') || '';
    this.dom.inputSystemPrompt.value = this.settings.get('systemPrompt') || '';
    this.dom.pitchSlider.value = this.settings.get('voicePitch') || 1.1;
    this.dom.pitchVal.textContent = this.dom.pitchSlider.value;
    this.dom.rateSlider.value = this.settings.get('voiceRate') || 1.05;
    this.dom.rateVal.textContent = this.dom.rateSlider.value;
    this.dom.checkAutoListen.checked = !!this.settings.get('autoListen');
    this.dom.checkAutoSpeak.checked = !!this.settings.get('autoSpeak');
    this.dom.selectIdleTimeout.value = this.settings.get('idleTimeoutSec') ?? 180;

    // 日本語ボイスリストの読み込み
    const jaVoices = this.speech.getJapaneseVoices();
    this.dom.voiceSelect.innerHTML = '<option value="">(端末の推奨デフォルト)</option>';
    const currentVoice = this.settings.get('voiceName');
    jaVoices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      if (v.name === currentVoice) opt.selected = true;
      this.dom.voiceSelect.appendChild(opt);
    });

    this.updateAvatarNameDisplay();
  }

  saveSettingsFromForm() {
    this.settings.saveSettings({
      apiKey: this.dom.inputApiKey.value.trim(),
      currentPreset: this.dom.presetSelect.value,
      charName: this.dom.inputCharName.value.trim(),
      systemPrompt: this.dom.inputSystemPrompt.value,
      voiceName: this.dom.voiceSelect.value,
      voicePitch: parseFloat(this.dom.pitchSlider.value),
      voiceRate: parseFloat(this.dom.rateSlider.value),
      autoListen: this.dom.checkAutoListen.checked,
      autoSpeak: this.dom.checkAutoSpeak.checked,
      idleTimeoutSec: parseInt(this.dom.selectIdleTimeout.value, 10)
    });

    this.wakeLock.setIdleTimeout(this.settings.get('idleTimeoutSec'));
  }

  updateAvatarNameDisplay() {
    const name = this.settings.get('charName') || 'アバター';
    this.dom.avatarNameLabel.textContent = name;
  }

  /**
   * ユーザーからのメッセージ処理
   */
  async handleUserMessage(text) {
    if (!text || this.isProcessing) return;
    this.isProcessing = true;
    this.userInteracted();

    // スリープ中なら解除
    this.wakeLock.wakeUp();

    // ユーザー発話を表示
    this.dom.bubbleUser.classList.add('visible');
    this.dom.userText.textContent = text;

    // アバターの思考中表示
    this.updateStatus('thinking');
    this.avatar.setEmotion('thinking');
    this.dom.bubbleAvatar.classList.add('visible');
    this.dom.avatarText.textContent = '考え中…';

    try {
      // Gemini API 呼び出し
      const response = await this.gemini.sendMessage(text);

      // 表情反映
      this.avatar.setEmotion(response.emotion);
      this.dom.avatarText.textContent = response.text;

      // 音声読み上げ & リップシンク
      await this.speech.speak(response.text);

    } catch (e) {
      console.error(e);
      this.avatar.setEmotion('sad');
      this.dom.avatarText.textContent = 'うまく聞き取れませんでした…もう一度話しかけてね。';
    } finally {
      this.isProcessing = false;
      this.resetAutoSpeakTimer();

      // 会話継続設定がONなら自動でマイク再開
      if (this.settings.get('autoListen') && !this.wakeLock.isSleepMode) {
        setTimeout(() => {
          if (!this.isProcessing && !this.speech.isSpeaking) {
            this.speech.startListening();
          }
        }, 600);
      }
    }
  }

  /**
   * 自律発話（無言が続いた場合にキャラから話しかける）
   */
  resetAutoSpeakTimer() {
    if (this.autoSpeakTimer) {
      clearTimeout(this.autoSpeakTimer);
      this.autoSpeakTimer = null;
    }

    if (!this.settings.get('autoSpeak')) return;

    const intervalSec = this.settings.get('autoSpeakIntervalSec') || 120;
    this.autoSpeakTimer = setTimeout(async () => {
      // ユーザーが沈黙しており、発話中でない場合に自発的に声をかける
      if (!this.isProcessing && !this.speech.isSpeaking) {
        const timeStr = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        const triggerPrompt = `[現在時刻: ${timeStr}] しばらく会話がなく静かな状態です。現在の時間帯やこれまでの流れに合わせて、キャラクターらしく自発的に一声かけてください（1〜2文で短く）。`;
        
        // スリープ中の場合は画面をオンにして声をかける
        this.wakeLock.wakeUp();

        this.isProcessing = true;
        try {
          const response = await this.gemini.sendMessage(triggerPrompt);
          this.avatar.setEmotion(response.emotion);
          this.dom.bubbleAvatar.classList.add('visible');
          this.dom.avatarText.textContent = response.text;
          await this.speech.speak(response.text);
        } catch (e) {
          console.warn('Auto speak failed:', e);
        } finally {
          this.isProcessing = false;
          this.resetAutoSpeakTimer();
          if (this.settings.get('autoListen')) {
            this.speech.startListening();
          }
        }
      }
    }, intervalSec * 1000);
  }

  updateStatus(status) {
    // status: 'idle' | 'listening' | 'thinking' | 'speaking'
    this.dom.statusIndicator.className = `status-indicator status-${status}`;
    
    if (status === 'listening') {
      this.dom.btnMic.classList.add('active');
      this.dom.statusIndicator.textContent = '聞いています…';
    } else if (status === 'thinking') {
      this.dom.btnMic.classList.remove('active');
      this.dom.statusIndicator.textContent = '返答を考えています…';
    } else if (status === 'speaking') {
      this.dom.btnMic.classList.remove('active');
      this.dom.statusIndicator.textContent = '話しています…';
    } else {
      this.dom.btnMic.classList.remove('active');
      this.dom.statusIndicator.textContent = '待機中（タップして会話）';
    }
  }

  greetOnStart() {
    const name = this.settings.get('charName') || 'ルナ';
    this.avatar.setEmotion('happy');
    this.dom.bubbleAvatar.classList.add('visible');
    this.dom.avatarText.textContent = `準備完了！下のマイクを押すか、右上の設定からGemini APIキーを入れて話しかけてね！`;
  }
}

// 起動
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
