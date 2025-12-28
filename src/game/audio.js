
/**
 * 简单的音频管理器，使用 Web Audio API 合成音效
 */
export class SoundManager {
    constructor() {
        this.ctx = null;
        this.noiseBuffer = null;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
                this._createNoiseBuffer();
            }
        } catch (e) {
            console.warn('Web Audio API not supported', e);
        }
    }

    /**
     * 创建白噪声缓存
     */
    _createNoiseBuffer() {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * 2; // 2秒缓存足够了
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        this.noiseBuffer = buffer;
    }

    /**
     * 初始化音频上下文
     */
    init() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /**
     * 播放方块落地音效 (类似石头撞击声)
     */
    playLandSound() {
        if (!this.ctx || !this.noiseBuffer) return;
        this.init();

        const t = this.ctx.currentTime;

        // 1. 噪声源
        const noiseParams = this.ctx.createBufferSource();
        noiseParams.buffer = this.noiseBuffer;

        // 2. 低通滤波器 (模拟沉闷的撞击感)
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        // 初始频率较低，模拟重物
        filter.frequency.setValueAtTime(800, t);
        // 频率快速下降，消除高频刺耳声
        filter.frequency.exponentialRampToValueAtTime(100, t + 0.15);

        // 3. 音量包络
        const gain = this.ctx.createGain();
        // 瞬间起音
        gain.gain.setValueAtTime(1.0, t);
        // 快速衰减 (短促)
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

        // 连接线路： 噪声 -> 滤波器 -> 音量 -> 输出
        noiseParams.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        // 播放
        noiseParams.start(t);
        noiseParams.stop(t + 0.2); // 0.2秒后停止
    }

    /**
     * 播放消除行音效 (清脆的 Ding)
     */
    playClearSound() {
        if (!this.ctx) return;
        this.init();

        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        // 正弦波 - 最纯净清脆
        osc.type = 'sine';
        // 较高频率 (1500Hz)
        osc.frequency.setValueAtTime(1500, t);

        // 极短的音量包络 (0.1秒)
        gain.gain.setValueAtTime(0.8, t);
        // 快速指数衰减
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

        osc.start(t);
        osc.stop(t + 0.1);
    }
}
