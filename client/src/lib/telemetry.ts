// 错误上报服务
class TelemetryService {
  private apiBase: string;
  private sessionId: string;
  private userId: string | null = null;
  private platform: string;
  private appVersion: string;
  private enabled: boolean;

  constructor() {
    // 开发模式使用相对路径（通过 vite 代理）
    // 生产模式使用配置的服务器地址
    const isDev = import.meta.env.DEV;
    if (isDev) {
      this.apiBase = ''; // 相对路径，vite 会代理到后端
    } else {
      this.apiBase = import.meta.env.VITE_API_URL || import.meta.env.VITE_SERVER_URL || '';
    }
    this.sessionId = this.generateSessionId();
    this.platform = this.detectPlatform();
    this.appVersion = import.meta.env.VITE_APP_VERSION || '1.0.0';
    // 允许禁用遥测（开发时可能后端未启动）
    this.enabled = import.meta.env.VITE_TELEMETRY_ENABLED !== 'false';
    
    this.setupGlobalErrorHandlers();
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private detectPlatform(): string {
    // 检测是否是Capacitor应用
    if ((window as any).Capacitor) {
      const platform = (window as any).Capacitor.getPlatform();
      return platform; // 'android', 'ios', 'electron', 'web'
    }
    return 'web';
  }

  setUserId(userId: string) {
    this.userId = userId;
  }

  private setupGlobalErrorHandlers() {
    // 捕获未处理的错误
    window.onerror = (message, source, lineno, colno, error) => {
      this.reportError({
        message: String(message),
        stack: error?.stack,
        url: source,
        additionalData: { lineno, colno },
      });
      return false;
    };

    // 捕获Promise rejection
    window.onunhandledrejection = (event) => {
      this.reportError({
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stack: event.reason?.stack,
      });
    };

    // 捕获资源加载错误
    window.addEventListener('error', (event) => {
      if (event.target && (event.target as HTMLElement).tagName) {
        const target = event.target as HTMLElement;
        this.reportError({
          message: `Resource load error: ${target.tagName}`,
          additionalData: {
            src: (target as HTMLImageElement).src || (target as HTMLScriptElement).src,
            tagName: target.tagName,
          },
        });
      }
    }, true);
  }

  async reportError(data: {
    message: string;
    stack?: string;
    url?: string;
    additionalData?: Record<string, any>;
  }) {
    if (!this.enabled) return;
    
    try {
      const payload = {
        ...data,
        userAgent: navigator.userAgent,
        platform: this.platform,
        appVersion: this.appVersion,
        userId: this.userId,
        sessionId: this.sessionId,
        url: data.url || window.location.href,
      };

      await fetch(`${this.apiBase}/api/admin/report-error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      // 静默处理，避免在后端未启动时刷屏报错
      if (import.meta.env.DEV) {
        console.debug('[Telemetry] Failed to report error (backend may be offline):', error);
      }
    }
  }

  async trackEvent(eventType: string, data?: Record<string, any>) {
    if (!this.enabled) return;
    
    try {
      const payload = {
        type: eventType,
        data,
        userId: this.userId,
        sessionId: this.sessionId,
        platform: this.platform,
        appVersion: this.appVersion,
      };

      await fetch(`${this.apiBase}/api/admin/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      // 静默处理，避免在后端未启动时刷屏报错
      if (import.meta.env.DEV) {
        console.debug('[Telemetry] Failed to track event (backend may be offline):', error);
      }
    }
  }
}

export const telemetryService = new TelemetryService();
