// خطای API — مشترک بین مسیر آنلاین و آفلاین (بدون وابستگی دایره‌ای)
export class ApiError extends Error {
  constructor(code, msg) { super(msg || code); this.code = code; }
}
