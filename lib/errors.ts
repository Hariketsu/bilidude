import { t } from './i18n';

/** A failed request to an API service; `status` is absent when no HTTP response arrived. */
export interface ServiceFailure {
  status?: number;
  message: string;
}

export interface DescribedError {
  /** What happened and what to do, in the UI language. */
  message: string;
  /** The original error, shown on request. */
  detail: string;
}

export function describeServiceError(service: string, failure: ServiceFailure): DescribedError {
  const { status, message } = failure;
  const detail = status === undefined || message.startsWith(String(status)) ? message : `HTTP ${status}: ${message}`;
  return { message: adviceFor(service, failure.status), detail };
}

function adviceFor(service: string, status: number | undefined): string {
  switch (status) {
    case undefined:
      return t('errors.unreachable', { service });
    case 401:
    case 403:
      return t('errors.keyInvalid', { service });
    case 402:
      return t('errors.outOfCredit', { service });
    case 429:
      return t('errors.rateLimited', { service });
    default:
      return t(status >= 500 ? 'errors.unavailable' : 'errors.serviceFailed', { service });
  }
}

/** A request to an API service failed; `status` is absent when no response arrived (network). */
export class ServiceError extends Error {
  /** The service's name as shown in settings. */
  readonly service: string;
  readonly status: number | undefined;
  readonly retryable: boolean;

  constructor(service: string, status: number | undefined, message: string) {
    super(message);
    this.name = 'ServiceError';
    this.service = service;
    this.status = status;
    this.retryable = status === undefined || status === 429 || status >= 500;
  }
}

/** `fetch` that reports network failures as a ServiceError; aborts still throw as aborts. */
export async function serviceFetch(service: string, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ServiceError(service, undefined, error instanceof Error ? error.message : String(error));
  }
}

/** Any error for display: service failures get advice, with the original kept as detail. */
export function describeError(error: unknown): { message: string; detail?: string } {
  if (error instanceof ServiceError) return describeServiceError(error.service, error);
  return { message: error instanceof Error ? error.message : String(error) };
}
