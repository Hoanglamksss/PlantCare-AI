import type { ErrorRequestHandler } from "express";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const connectionErrors = new Set([
  "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "EHOSTUNREACH",
  "53300", "57014", "57P01", "57P02", "57P03",
]);

function asHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error && typeof error === "object" && "type" in error) {
    if (error.type === "entity.parse.failed") {
      return new HttpError(400, "INVALID_JSON", "Dữ liệu JSON không hợp lệ.");
    }
    if (error.type === "entity.too.large") {
      return new HttpError(413, "PAYLOAD_TOO_LARGE", "Dữ liệu gửi lên vượt giới hạn.");
    }
    if (error.type === "encoding.unsupported" || error.type === "charset.unsupported") {
      return new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Kiểu mã hóa dữ liệu chưa được hỗ trợ.");
    }
  }
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    if (error.code.startsWith("08") || connectionErrors.has(error.code)) {
      return new HttpError(503, "SERVICE_UNAVAILABLE", "Dịch vụ tạm thời gián đoạn. Vui lòng thử lại.");
    }
  }
  if (error instanceof Error && /timeout exceeded when trying to connect|Connection terminated/i.test(error.message)) {
    return new HttpError(503, "SERVICE_UNAVAILABLE", "Dịch vụ tạm thời gián đoạn. Vui lòng thử lại.");
  }
  return new HttpError(500, "INTERNAL_ERROR", "Đã xảy ra lỗi. Vui lòng thử lại.");
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(new Error("Response already started"));
    return;
  }

  const response = asHttpError(error);
  const requestId: string = res.locals.requestId;
  if (response.status >= 500) console.error(`[http] ${response.code} request_id=${requestId}`);
  res.status(response.status).json({ code: response.code, message: response.message, requestId });
};
