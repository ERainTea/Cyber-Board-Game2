/**
 * @file src/Engine/GlobalErrorHandler.js
 * @description ระบบจัดการ Error กลาง (Global Error Handler) ของเกม (Phase 17)
 * คอยตรวจจับ uncaught exceptions และ unhandled promise rejections
 */

class GlobalErrorHandler {
  constructor() {
    /** @type {Array<{timestamp: number, message: string, source: string, lineno: number, error: any}>} */
    this.logs = [];
    this.init();
  }

  /**
   * เริ่มต้นการดักจับ Exception และ Error กลาง
   */
  init() {
    if (typeof window === 'undefined') return;

    window.onerror = (message, source, lineno, colno, error) => {
      this.captureError({
        timestamp: Date.now(),
        type: 'EXCEPTION',
        message: String(message),
        source: String(source),
        lineno,
        colno,
        error: error ? error.stack : null,
      });
      return false; // ให้เบราว์เซอร์ล๊อกในคอนโซลตามปกติด้วย
    };

    window.onunhandledrejection = (event) => {
      this.captureError({
        timestamp: Date.now(),
        type: 'UNHANDLED_REJECTION',
        message: event.reason ? event.reason.message || String(event.reason) : 'Promise Rejection',
        error: event.reason,
      });
    };
  }

  /**
   * บันทึก Error
   * @param {Object} errObj
   */
  captureError(errObj) {
    this.logs.push(errObj);
    console.warn('[GlobalErrorHandler] Exception Captured:', errObj);
    if (this.logs.length > 50) {
      this.logs.shift(); // เก็บเฉพาะ 50 รายการล่าสุด
    }
  }

  /**
   * ดึงรายการ Log Error ทั้งหมด
   */
  getLogs() {
    return [...this.logs];
  }

  /**
   * ล้าง Log
   */
  clearLogs() {
    this.logs = [];
  }
}

export const globalErrorHandler = new GlobalErrorHandler();

if (typeof window !== 'undefined') {
  window.globalErrorHandler = globalErrorHandler;
}
