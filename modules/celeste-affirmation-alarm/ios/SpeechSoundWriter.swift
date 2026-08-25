import AVFoundation
import AudioToolbox
import Foundation

enum SpeechSoundWriterError: Error {
  case voiceUnavailable
  case invalidAudioBuffer
  case emptyAudio
  case audioTooLong
}

@MainActor
enum SpeechSoundWriter {
  // Keep a small margin below the 30-second custom system sound limit.
  static let maximumDuration: TimeInterval = 29

  static func render(
    text: String,
    locale: String,
    voiceIdentifier: String?,
    to destinationURL: URL
  ) async throws -> TimeInterval {
    let utterance = AVSpeechUtterance(string: text)

    if let voiceIdentifier, !voiceIdentifier.isEmpty {
      guard let voice = AVSpeechSynthesisVoice(identifier: voiceIdentifier) else {
        throw SpeechSoundWriterError.voiceUnavailable
      }
      utterance.voice = voice
    } else {
      guard let voice = AVSpeechSynthesisVoice(language: locale) else {
        throw SpeechSoundWriterError.voiceUnavailable
      }
      utterance.voice = voice
    }

    utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.9
    utterance.volume = 1

    try? FileManager.default.removeItem(at: destinationURL)
    let session = SpeechRenderSession(
      destinationURL: destinationURL,
      maximumDuration: maximumDuration
    )

    return try await withCheckedThrowingContinuation { continuation in
      session.start(utterance: utterance, continuation: continuation)
    }
  }
}

private final class SpeechRenderSession {
  private let destinationURL: URL
  private let maximumDuration: TimeInterval
  private let synthesizer = AVSpeechSynthesizer()
  private var continuation: CheckedContinuation<TimeInterval, Error>?
  private var audioFile: AVAudioFile?
  private var duration: TimeInterval = 0
  private var frameCount: AVAudioFramePosition = 0
  private var finished = false

  init(destinationURL: URL, maximumDuration: TimeInterval) {
    self.destinationURL = destinationURL
    self.maximumDuration = maximumDuration
  }

  func start(
    utterance: AVSpeechUtterance,
    continuation: CheckedContinuation<TimeInterval, Error>
  ) {
    self.continuation = continuation

    synthesizer.write(utterance) { [self] buffer in
      consume(buffer)
    }
  }

  private func consume(_ buffer: AVAudioBuffer) {
    guard !finished else { return }
    guard let pcmBuffer = buffer as? AVAudioPCMBuffer else {
      complete(.failure(SpeechSoundWriterError.invalidAudioBuffer))
      return
    }

    if pcmBuffer.frameLength == 0 {
      guard frameCount > 0 else {
        complete(.failure(SpeechSoundWriterError.emptyAudio))
        return
      }
      complete(.success(duration))
      return
    }

    guard pcmBuffer.format.sampleRate > 0 else {
      complete(.failure(SpeechSoundWriterError.invalidAudioBuffer))
      return
    }

    do {
      if audioFile == nil {
        let systemSoundSettings: [String: Any] = [
          AVFormatIDKey: Int(kAudioFormatLinearPCM),
          AVSampleRateKey: pcmBuffer.format.sampleRate,
          AVNumberOfChannelsKey: Int(pcmBuffer.format.channelCount),
          AVLinearPCMBitDepthKey: 16,
          AVLinearPCMIsBigEndianKey: false,
          AVLinearPCMIsFloatKey: false,
          AVLinearPCMIsNonInterleaved: false
        ]
        audioFile = try AVAudioFile(
          forWriting: destinationURL,
          settings: systemSoundSettings,
          commonFormat: pcmBuffer.format.commonFormat,
          interleaved: pcmBuffer.format.isInterleaved
        )
      }

      let bufferDuration = Double(pcmBuffer.frameLength) / pcmBuffer.format.sampleRate
      guard duration + bufferDuration <= maximumDuration else {
        synthesizer.stopSpeaking(at: .immediate)
        complete(.failure(SpeechSoundWriterError.audioTooLong))
        return
      }

      try audioFile?.write(from: pcmBuffer)
      frameCount += AVAudioFramePosition(pcmBuffer.frameLength)
      duration += bufferDuration
    } catch {
      complete(.failure(error))
    }
  }

  private func complete(_ result: Result<TimeInterval, Error>) {
    guard !finished else { return }
    finished = true
    audioFile = nil
    let pendingContinuation = continuation
    continuation = nil

    if case .failure = result {
      try? FileManager.default.removeItem(at: destinationURL)
    }
    pendingContinuation?.resume(with: result)
  }
}
