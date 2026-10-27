/**
 * gemini.js - Gemini API 連携モジュール
 */

export class GeminiClient {
  constructor(settingsManager) {
    this.settingsManager = settingsManager;
    this.history = []; // { role: 'user'|'model', text: string }
    this.maxHistoryLength = 10;
  }

  clearHistory() {
    this.history = [];
  }

  /**
   * ユーザーの発話に対してGeminiから返答を取得
   * @param {string} userMessage
   * @returns {Promise<{text: string, emotion: string, raw: string}>}
   */
  async sendMessage(userMessage) {
    const apiKey = this.settingsManager.get('apiKey');
    const model = this.settingsManager.get('model') || 'gemini-2.5-flash';
    const systemPrompt = this.settingsManager.get('systemPrompt') || '';

    // APIキーがない場合のデモ・ガイダンス応答
    if (!apiKey) {
      return {
        text: 'こんにちは！お話しするには、右上の「設定（歯車）」アイコンからGoogle AI StudioのGemini APIキー（無料）を登録してくださいね！',
        emotion: 'happy',
        raw: '[emotion: happy] こんにちは！お話しするには、右上の「設定」からGemini APIキーを登録してくださいね！'
      };
    }

    // 会話履歴に追加
    this.history.push({ role: 'user', text: userMessage });
    if (this.history.length > this.maxHistoryLength) {
      this.history = this.history.slice(-this.maxHistoryLength);
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const formattedContents = this.history.map(item => ({
      role: item.role,
      parts: [{ text: item.text }]
    }));

    const requestBody = {
      contents: formattedContents,
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 250,
        topP: 0.95
      }
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        const errMsg = errJson?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errMsg);
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '……うまく言葉が見つかりませんでした。';

      // 感情タグの解析
      const { cleanText, emotion } = this.parseEmotion(rawText);

      // モデルの返答を履歴に記録（生のテキスト、あるいはクリーンテキスト）
      this.history.push({ role: 'model', text: rawText });

      return {
        text: cleanText,
        emotion: emotion,
        raw: rawText
      };
    } catch (error) {
      console.error('Gemini API Error:', error);
      // エラー時は履歴の最後のユーザー発話を戻すか保持
      return {
        text: `ごめんなさい、エラーが発生しました（${error.message}）。APIキーやネットワーク接続を確認してみてください。`,
        emotion: 'sad',
        raw: error.message
      };
    }
  }

  /**
   * テキストから [emotion: xxx] を抽出して除去する
   */
  parseEmotion(text) {
    const emotionRegex = /\[emotion:\s*(neutral|happy|surprise|sad|thinking)\]/i;
    const match = text.match(emotionRegex);
    let emotion = 'neutral';

    if (match) {
      emotion = match[1].toLowerCase();
    } else {
      // タグがない場合の簡易キーワード推論フォールバック
      if (/嬉し|楽し|ありがと|わーい|大好き|ふふ|笑顔/i.test(text)) {
        emotion = 'happy';
      } else if (/えっ|本当|まさか|びっくり|すご/i.test(text)) {
        emotion = 'surprise';
      } else if (/困っ|ごめん|悲し|痛い|つらい|怒/i.test(text)) {
        emotion = 'sad';
      } else if (/うーん|どうだろう|考え|何かな/i.test(text)) {
        emotion = 'thinking';
      }
    }

    // タグを除去してトリム
    const cleanText = text.replace(/\[emotion:\s*[^\]]+\]/gi, '').trim();

    return { cleanText, emotion };
  }
}
