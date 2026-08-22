/** Stable business error codes shared by the Host and browser client. */

export const EARS_ERROR_CODES = {
  whisperNotInstalled: 'whisper.notInstalled',
  whisperPythonNotFound: 'whisper.pythonNotFound',
  whisperModelUnknown: 'whisper.modelUnknown',
  whisperModelUnverified: 'whisper.modelUnverified',
  whisperModelNotDownloaded: 'whisper.modelNotDownloaded',
  whisperStateQueryFailed: 'whisper.stateQueryFailed',
  whisperAlreadyDownloading: 'whisper.alreadyDownloading',
  whisperDownloadFailed: 'whisper.downloadFailed',
  whisperDownloadCleanupFailed: 'whisper.downloadCleanupFailed',
  whisperCancelCleanupFailed: 'whisper.cancelCleanupFailed',
  whisperStillDownloading: 'whisper.stillDownloading',
  whisperDeleteFailed: 'whisper.deleteFailed',
  whisperMarkerWriteFailed: 'whisper.markerWriteFailed',
  whisperModelTableFailed: 'whisper.modelTableFailed',
  cloudModelsTimedOut: 'cloudModels.timedOut',
  cloudModelsHttpFailed: 'cloudModels.httpFailed',
  cloudModelsInvalidJson: 'cloudModels.invalidJson',
  cloudModelsNoModels: 'cloudModels.noModels',
  cloudModelsTooLarge: 'cloudModels.tooLarge',
  cloudModelsListFailed: 'cloudModels.listFailed',
  backendWebSpeechUnavailable: 'backend.webSpeechUnavailable',
  backendLocalUnavailable: 'backend.localUnavailable',
  backendCloudUnavailable: 'backend.cloudUnavailable',
  asrModelNotConfigured: 'asr.modelNotConfigured',
  asrApiKeyNotConfigured: 'asr.apiKeyNotConfigured',
  asrEndpointInvalid: 'asr.endpointInvalid',
  asrEndpointHasCredentials: 'asr.endpointHasCredentials',
  asrAudioEmpty: 'asr.audioEmpty',
  asrAudioInvalid: 'asr.audioInvalid',
  asrAudioTooLarge: 'asr.audioTooLarge',
  asrRequestTimedOut: 'asr.requestTimedOut',
  asrHttpFailed: 'asr.httpFailed',
  asrInvalidResponse: 'asr.invalidResponse',
  asrNoTranscript: 'asr.noTranscript',
  asrResponseTooLarge: 'asr.responseTooLarge',
  asrUnexpected: 'asr.unexpected',
  asrProviderUnknown: 'asr.providerUnknown',
  asrUnsupportedBackend: 'asr.unsupportedBackend',
  browserMediaUnavailable: 'browser.mediaUnavailable',
  polishTimedOut: 'polish.timedOut',
  polishNoText: 'polish.noText',
  polishTooLarge: 'polish.tooLarge',
  polishUnexpected: 'polish.unexpected',
  polishRouteFailed: 'polish.routeFailed',
  polishSettingsUnavailable: 'polish.settingsUnavailable'
} as const

export type EarsErrorCode = (typeof EARS_ERROR_CODES)[keyof typeof EARS_ERROR_CODES]
export type EarsErrorParams = Readonly<Record<string, string | number>>

export class EarsError extends Error {
  readonly code: EarsErrorCode
  readonly params: EarsErrorParams | undefined

  constructor(code: EarsErrorCode, message: string, params?: EarsErrorParams) {
    super(message)
    this.name = 'EarsError'
    this.code = code
    this.params = params
  }
}

export function earsErrorCode(error: unknown): EarsErrorCode | undefined {
  if (!(error instanceof EarsError)) return undefined
  return error.code
}

export function earsErrorParams(error: unknown): EarsErrorParams | undefined {
  if (!(error instanceof EarsError)) return undefined
  return error.params
}

export function isEarsErrorCode(value: unknown): value is EarsErrorCode {
  return typeof value === 'string' && Object.values(EARS_ERROR_CODES).includes(value as EarsErrorCode)
}
