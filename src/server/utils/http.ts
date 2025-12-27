import type { NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  statusCode: number;
  expose: boolean;

  constructor(statusCode: number, message: string, expose = true) {
    super(message);
    this.statusCode = statusCode;
    this.expose = expose;
  }
}

export type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

export function asyncHandler(handler: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

export function isHttpError(err: unknown): err is HttpError {
  return typeof err === "object" && err !== null && "statusCode" in err;
}
