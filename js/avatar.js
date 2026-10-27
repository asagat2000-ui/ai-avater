/**
 * avatar.js - 2Dアバターの描画・アニメーション・リップシンク制御
 * 古いスマホ向けにCSS GPUアクセラレーションを活用し、超軽量で動作します。
 */

export class AvatarController {
  constructor(containerElement) {
    this.container = containerElement;
    this.currentEmotion = 'neutral';
    this.isBlinking = false;
    this.isSpeaking = false;
    this.blinkTimer = null;
    this.lipSyncTimer = null;
    this.lipState = 'closed'; // 'closed' | 'half' | 'open'

    this.initAvatar();
    this.startBlinkingLoop();
  }

  /**
   * ベクターSVGアバターのDOM生成
   */
  initAvatar() {
    this.container.innerHTML = `
      <div class="avatar-stage emotion-neutral" id="avatarStage">
        <!-- 感情エフェクト（漫符） -->
        <div class="avatar-effects">
          <div class="effect-sparkle" title="キラキラ">✨</div>
          <div class="effect-sweat" title="汗">💧</div>
          <div class="effect-question" title="はてな">❓</div>
          <div class="effect-exclamation" title="びっくり">❗</div>
        </div>

        <svg class="avatar-svg" viewBox="0 0 400 560" preserveAspectRatio="xMidYMid meet">
          <defs>
            <!-- 影・グラデーション -->
            <radialGradient id="faceShade" cx="50%" cy="40%" r="50%">
              <stop offset="70%" stop-color="#fff8f2"/>
              <stop offset="100%" stop-color="#f8e7dc"/>
            </radialGradient>
            <linearGradient id="hairGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#7c3aed"/>
              <stop offset="100%" stop-color="#4f46e5"/>
            </linearGradient>
            <linearGradient id="eyeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#2563eb"/>
              <stop offset="100%" stop-color="#0284c7"/>
            </linearGradient>
            <linearGradient id="clothesGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#ffffff"/>
              <stop offset="100%" stop-color="#e2e8f0"/>
            </linearGradient>
            <linearGradient id="ribbonGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#f43f5e"/>
              <stop offset="100%" stop-color="#fb7185"/>
            </linearGradient>
          </defs>

          <!-- 体・衣服（呼吸レイヤー） -->
          <g class="layer-body">
            <!-- 首 -->
            <path d="M 185 290 L 185 340 L 215 340 L 215 290 Z" fill="#f8e7dc"/>
            <path d="M 185 300 Q 200 315 215 300 L 215 330 Q 200 340 185 330 Z" fill="#ebd2c2" opacity="0.6"/>

            <!-- 肩・制服 -->
            <path d="M 110 460 C 120 360 160 340 200 340 C 240 340 280 360 290 460 L 290 560 L 110 560 Z" fill="url(#clothesGrad)" stroke="#cbd5e1" stroke-width="2"/>
            
            <!-- 襟（セーラー/ブレザー風） -->
            <path d="M 160 345 L 200 420 L 240 345 L 200 365 Z" fill="#4f46e5"/>
            <!-- リボン -->
            <path d="M 190 380 Q 200 395 210 380 Q 200 370 190 380 Z" fill="url(#ribbonGrad)"/>
            <path d="M 195 385 L 180 435 L 195 430 L 200 395 Z" fill="url(#ribbonGrad)"/>
            <path d="M 205 385 L 220 435 L 205 430 L 200 395 Z" fill="url(#ribbonGrad)"/>
          </g>

          <!-- 後ろ髪 -->
          <g class="layer-back-hair">
            <path d="M 100 230 C 70 300 80 440 110 480 C 130 430 130 320 130 300 Z" fill="url(#hairGrad)"/>
            <path d="M 300 230 C 330 300 320 440 290 480 C 270 430 270 320 270 300 Z" fill="url(#hairGrad)"/>
          </g>

          <!-- 頭・顔レイヤー（傾き・頷き） -->
          <g class="layer-head">
            <!-- 輪郭（アゴ・耳） -->
            <ellipse cx="140" cy="225" rx="14" ry="18" fill="#f8e7dc"/>
            <ellipse cx="260" cy="225" rx="14" ry="18" fill="#f8e7dc"/>
            <path d="M 140 190 C 135 260 165 305 200 305 C 235 305 265 260 260 190 C 255 125 145 125 140 190 Z" fill="url(#faceShade)"/>

            <!-- 頬紅（チーク） -->
            <g class="layer-blush">
              <ellipse cx="158" cy="245" rx="14" ry="8" fill="#fb7185" opacity="0.45"/>
              <ellipse cx="242" cy="245" rx="14" ry="8" fill="#fb7185" opacity="0.45"/>
              <!-- 照れ線 -->
              <line x1="152" y1="243" x2="164" y2="247" stroke="#f43f5e" stroke-width="1.5" stroke-linecap="round"/>
              <line x1="236" y1="247" x2="248" y2="243" stroke="#f43f5e" stroke-width="1.5" stroke-linecap="round"/>
            </g>

            <!-- 眉毛 -->
            <g class="layer-eyebrows">
              <!-- 左眉（通常） -->
              <path class="eyebrow eyebrow-left" d="M 155 190 Q 170 182 185 190" stroke="#4338ca" stroke-width="3" stroke-linecap="round" fill="none"/>
              <!-- 右眉（通常） -->
              <path class="eyebrow eyebrow-right" d="M 215 190 Q 230 182 245 190" stroke="#4338ca" stroke-width="3" stroke-linecap="round" fill="none"/>
            </g>

            <!-- 目（左） -->
            <g class="eye-group eye-group-left" transform="translate(145, 195)">
              <!-- 開き目 -->
              <g class="eye-state-open">
                <ellipse cx="25" cy="20" rx="15" ry="19" fill="#ffffff"/>
                <!-- 瞳 -->
                <ellipse cx="25" cy="21" rx="12" ry="16" fill="url(#eyeGrad)"/>
                <ellipse cx="25" cy="23" rx="7" ry="9" fill="#1e1b4b"/>
                <!-- ハイライト -->
                <circle cx="21" cy="15" r="4.5" fill="#ffffff"/>
                <circle cx="28" cy="26" r="2.5" fill="#ffffff" opacity="0.8"/>
                <!-- 上まつ毛 -->
                <path d="M 8 18 Q 25 8 42 16" stroke="#1e1b4b" stroke-width="3.5" stroke-linecap="round" fill="none"/>
                <!-- 二重ライン -->
                <path d="M 12 11 Q 25 5 38 10" stroke="#a5b4fc" stroke-width="1.5" stroke-linecap="round" fill="none"/>
              </g>
              <!-- 閉じ目 / 瞬き / ニッコリ -->
              <g class="eye-state-blink">
                <path d="M 8 20 Q 25 30 42 18" stroke="#1e1b4b" stroke-width="3.5" stroke-linecap="round" fill="none"/>
              </g>
              <!-- 驚き目（瞳小さめ） -->
              <g class="eye-state-surprise">
                <ellipse cx="25" cy="20" rx="16" ry="20" fill="#ffffff"/>
                <circle cx="25" cy="20" r="8" fill="url(#eyeGrad)"/>
                <circle cx="25" cy="20" r="4" fill="#1e1b4b"/>
                <circle cx="22" cy="17" r="2.5" fill="#ffffff"/>
                <path d="M 7 15 Q 25 6 43 14" stroke="#1e1b4b" stroke-width="3.5" stroke-linecap="round" fill="none"/>
              </g>
            </g>

            <!-- 目（右） -->
            <g class="eye-group eye-group-right" transform="translate(205, 195)">
              <!-- 開き目 -->
              <g class="eye-state-open">
                <ellipse cx="25" cy="20" rx="15" ry="19" fill="#ffffff"/>
                <!-- 瞳 -->
                <ellipse cx="25" cy="21" rx="12" ry="16" fill="url(#eyeGrad)"/>
                <ellipse cx="25" cy="23" rx="7" ry="9" fill="#1e1b4b"/>
                <!-- ハイライト -->
                <circle cx="21" cy="15" r="4.5" fill="#ffffff"/>
                <circle cx="28" cy="26" r="2.5" fill="#ffffff" opacity="0.8"/>
                <!-- 上まつ毛 -->
                <path d="M 8 16 Q 25 8 42 18" stroke="#1e1b4b" stroke-width="3.5" stroke-linecap="round" fill="none"/>
                <!-- 二重ライン -->
                <path d="M 12 10 Q 25 5 38 11" stroke="#a5b4fc" stroke-width="1.5" stroke-linecap="round" fill="none"/>
              </g>
              <!-- 閉じ目 / 瞬き / ニッコリ -->
              <g class="eye-state-blink">
                <path d="M 8 18 Q 25 30 42 20" stroke="#1e1b4b" stroke-width="3.5" stroke-linecap="round" fill="none"/>
              </g>
              <!-- 驚き目 -->
              <g class="eye-state-surprise">
                <ellipse cx="25" cy="20" rx="16" ry="20" fill="#ffffff"/>
                <circle cx="25" cy="20" r="8" fill="url(#eyeGrad)"/>
                <circle cx="25" cy="20" r="4" fill="#1e1b4b"/>
                <circle cx="22" cy="17" r="2.5" fill="#ffffff"/>
                <path d="M 7 14 Q 25 6 43 15" stroke="#1e1b4b" stroke-width="3.5" stroke-linecap="round" fill="none"/>
              </g>
            </g>

            <!-- 鼻 -->
            <path d="M 199 238 L 202 243" stroke="#e2b9a1" stroke-width="2" stroke-linecap="round"/>

            <!-- 口（リップシンクパーツ群） -->
            <g class="layer-mouth" transform="translate(180, 255)">
              <!-- 閉じ口 -->
              <path class="mouth-part mouth-closed" d="M 10 10 Q 20 15 30 10" stroke="#e11d48" stroke-width="3" stroke-linecap="round" fill="none"/>
              <!-- 半開き口 -->
              <path class="mouth-part mouth-half" d="M 12 7 Q 20 18 28 7 Z" fill="#fda4af" stroke="#e11d48" stroke-width="2.5" stroke-linejoin="round"/>
              <!-- 全開き口 -->
              <path class="mouth-part mouth-open" d="M 10 5 Q 20 25 30 5 Z" fill="#e11d48" stroke="#be123c" stroke-width="2.5">
                <path d="M 14 17 Q 20 12 26 17" fill="#fda4af"/>
              </path>
              <!-- 笑顔口 -->
              <path class="mouth-part mouth-smile" d="M 10 8 Q 20 22 30 8 Q 20 13 10 8 Z" fill="#fda4af" stroke="#e11d48" stroke-width="2.5"/>
            </g>

            <!-- 前髪・横髪（顔に影を落とし立体感） -->
            <g class="layer-front-hair">
              <!-- 前髪ベース -->
              <path d="M 130 180 C 130 110 270 110 270 180 C 275 190 280 260 275 270 C 265 240 260 200 255 180 C 240 185 220 230 215 235 C 210 210 200 180 190 180 C 180 180 170 230 160 235 C 150 205 145 190 135 270 C 130 250 128 200 130 180 Z" fill="url(#hairGrad)"/>
              
              <!-- アホ毛（頭頂部のアクセント・揺れる） -->
              <path class="ahoge" d="M 200 120 Q 220 70 240 90 Q 215 80 202 118 Z" fill="#7c3aed"/>
              
              <!-- 髪の天使の輪（ツヤ・ハイライト） -->
              <path d="M 155 145 Q 200 155 245 145" stroke="#c084fc" stroke-width="4" stroke-linecap="round" opacity="0.6" fill="none"/>
            </g>
          </g>
        </svg>
      </div>
    `;

    this.stage = document.getElementById('avatarStage');
  }

  /**
   * 表情を切り替える
   * @param {'neutral'|'happy'|'surprise'|'sad'|'thinking'} emotion
   */
  setEmotion(emotion) {
    const validEmotions = ['neutral', 'happy', 'surprise', 'sad', 'thinking'];
    this.currentEmotion = validEmotions.includes(emotion) ? emotion : 'neutral';

    // クラスの付け替え
    validEmotions.forEach(e => this.stage.classList.remove(`emotion-${e}`));
    this.stage.classList.add(`emotion-${this.currentEmotion}`);

    // 発話中でない場合の口の形状
    if (!this.isSpeaking) {
      this.updateMouth('closed');
    }
  }

  /**
   * 口の形状を変更する
   * @param {'closed'|'half'|'open'|'smile'} shape
   */
  updateMouth(shape) {
    this.lipState = shape;
    if (!this.stage) return;
    
    // 現在の口クラスをリセット
    this.stage.classList.remove('lip-closed', 'lip-half', 'lip-open', 'lip-smile');
    this.stage.classList.add(`lip-${shape}`);
  }

  /**
   * リップシンク開始（発話中に口を滑らかに開閉）
   */
  startLipSync() {
    this.isSpeaking = true;
    this.stage.classList.add('is-speaking');

    if (this.lipSyncTimer) clearInterval(this.lipSyncTimer);

    const mouthPatterns = ['half', 'open', 'half', 'closed', 'open', 'smile', 'half'];
    let index = 0;

    // 音声速度に合わせて100〜140msごとに自然に口パク
    this.lipSyncTimer = setInterval(() => {
      index = (index + 1) % mouthPatterns.length;
      this.updateMouth(mouthPatterns[index]);
    }, 120);
  }

  /**
   * リップシンク停止
   */
  stopLipSync() {
    this.isSpeaking = false;
    if (this.stage) {
      this.stage.classList.remove('is-speaking');
    }
    if (this.lipSyncTimer) {
      clearInterval(this.lipSyncTimer);
      this.lipSyncTimer = null;
    }
    // 表情がhappyなら笑顔口、それ以外は閉じ口に戻す
    const restingMouth = this.currentEmotion === 'happy' ? 'smile' : 'closed';
    this.updateMouth(restingMouth);
  }

  /**
   * 自然な間隔でまばたきを繰り返すループ
   */
  startBlinkingLoop() {
    const triggerBlink = () => {
      // 笑顔時はすでに目を細めている場合もあるが、通常時は瞬きを実行
      this.stage.classList.add('is-blinking');
      
      // 120ms後に目を開く
      setTimeout(() => {
        if (this.stage) {
          this.stage.classList.remove('is-blinking');
        }
      }, 120);

      // 次の瞬きは2.5秒〜5.5秒のランダム
      const nextDelay = 2500 + Math.random() * 3000;
      this.blinkTimer = setTimeout(triggerBlink, nextDelay);
    };

    this.blinkTimer = setTimeout(triggerBlink, 2000);
  }

  destroy() {
    if (this.blinkTimer) clearTimeout(this.blinkTimer);
    if (this.lipSyncTimer) clearInterval(this.lipSyncTimer);
  }
}
