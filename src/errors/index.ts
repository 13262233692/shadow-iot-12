import { ConflictError } from '../types/shadow';

export class ShadowConflictError extends Error {
  public readonly code: string;
  public readonly currentVersion: number;
  public readonly requestedVersion: number;
  public readonly clientToken?: string;

  constructor(
    thingName: string,
    currentVersion: number,
    requestedVersion: number,
    clientToken?: string
  ) {
    super(
      `Version conflict for thing ${thingName}: current version ${currentVersion}, requested ${requestedVersion}`
    );
    this.name = 'ShadowConflictError';
    this.code = 'Conflict';
    this.currentVersion = currentVersion;
    this.requestedVersion = requestedVersion;
    this.clientToken = clientToken;
  }

  public toJSON(): ConflictError {
    return {
      code: this.code,
      message: this.message,
      clientToken: this.clientToken,
      currentVersion: this.currentVersion,
      requestedVersion: this.requestedVersion,
    };
  }
}

export class ShadowNotFoundError extends Error {
  public readonly code: string;

  constructor(thingName: string) {
    super(`Shadow not found for thing ${thingName}`);
    this.name = 'ShadowNotFoundError';
    this.code = 'NotFound';
  }
}

export class ShadowValidationError extends Error {
  public readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = 'ShadowValidationError';
    this.code = 'ValidationError';
  }
}
