/**
 * wakelock.js - 画面点灯維持 (Wake Lock) & 疑似画面オフ (黒画面待機) モジュール
 * 古いスマホでもバッテリーを節約しながら常時待機できるようにします。
 */

export class WakeLockManager {
  constructor(options = {}) {
    this.wakeLockSentinel = null;
    this.isLocked = false;
    this.isSleepMode = false;
    this.idleTimer = null;
    this.idleTimeoutSec = options.idleTimeoutSec || 180; // 3分無操作で疑似スリープ
    
    this.onSleepStateChange = options.onSleepStateChange || null;

    this.initVisibilityListener();
  }

  /**
   * 画面の自動消灯を防止（Wake Lock有効化）
   */
  async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLockSentinel = await navigator.wakeLock.request('screen');
        this.isLocked = true;
        
        this.wakeLockSentinel.addEventListener('release', () => {
          this.isLocked = false;
        });
        return true;
      } catch (err) {
        console.warn('Wake Lock request failed:', err);
        this.isLocked = false;
        return false;
      }
    } else {
      console.warn('Screen Wake Lock API is not supported on this browser.');
      return false;
    }
  }

  /**
   * Wake Lock解除
   */
  async releaseWakeLock() {
    if (this.wakeLockSentinel) {
      try {
        await this.wakeLockSentinel.release();
      } catch (e) {
        console.warn('Wake Lock release error:', e);
      }
      this.wakeLockSentinel = null;
    }
    this.isLocked = false;
  }

  /**
   * アプリがバックグラウンドから復帰した際にWakeLockを再取得
   */
  initVisibilityListener() {
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && !this.wakeLockSentinel && this.isLocked) {
        await this.requestWakeLock();
      }
    });
  }

  /**
   * 全画面表示 (Fullscreen API) の切り替え
   */
  toggleFullscreen(element = document.documentElement) {
    if (!document.fullscreenElement) {
      if (element.requestFullscreen) {
        element.requestFullscreen().catch(err => console.warn(err));
      } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
      }
      return true;
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(err => console.warn(err));
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
      return false;
    }
  }

  /**
   * 疑似画面オフ（黒画面待機）モードに入る
   */
  enterSleepMode() {
    if (this.isSleepMode) return;
    this.isSleepMode = true;

    // Wake LockをアクティブにしてOS側の強制サスペンドを防ぐ
    this.requestWakeLock();

    const overlay = document.getElementById('sleepOverlay');
    if (overlay) {
      overlay.classList.add('active');
    }

    if (this.onSleepStateChange) {
      this.onSleepStateChange(true);
    }
  }

  /**
   * 疑似画面オフから復帰（画面オン）
   */
  wakeUp() {
    if (!this.isSleepMode) return;
    this.isSleepMode = false;

    const overlay = document.getElementById('sleepOverlay');
    if (overlay) {
      overlay.classList.remove('active');
    }

    if (this.onSleepStateChange) {
      this.onSleepStateChange(false);
    }

    this.resetIdleTimer();
  }

  /**
   * 無操作タイマーをリセット
   */
  resetIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.idleTimeoutSec > 0 && !this.isSleepMode) {
      this.idleTimer = setTimeout(() => {
        this.enterSleepMode();
      }, this.idleTimeoutSec * 1000);
    }
  }

  setIdleTimeout(sec) {
    this.idleTimeoutSec = sec;
    this.resetIdleTimer();
  }
}
