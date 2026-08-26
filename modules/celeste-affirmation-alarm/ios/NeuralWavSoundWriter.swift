import AVFoundation
import Foundation

enum NeuralWavSoundWriterError: Error {
  case invalidBase64
  case audioTooLarge
  case invalidWav
  case unsupportedWav
  case emptyAudio
  case audioTooLong
}

enum NeuralWavSoundWriter {
  // This matches the JavaScript bridge limit and comfortably contains a
  // 29-second, 24 kHz, mono PCM16 Gemini narration.
  static let maximumEncodedCharacters = 2_000_000
  static let maximumDecodedBytes = 1_500_000
  static let maximumDuration: TimeInterval = 29

  static func write(base64Wav: String, to destinationURL: URL) throws -> TimeInterval {
    let encodedBytes = base64Wav.utf8
    guard !encodedBytes.isEmpty else {
      throw NeuralWavSoundWriterError.invalidBase64
    }
    guard encodedBytes.count <= maximumEncodedCharacters else {
      throw NeuralWavSoundWriterError.audioTooLarge
    }
    guard encodedBytes.count.isMultiple(of: 4), isStrictBase64(encodedBytes) else {
      throw NeuralWavSoundWriterError.invalidBase64
    }
    guard let wavData = Data(base64Encoded: base64Wav, options: []) else {
      throw NeuralWavSoundWriterError.invalidBase64
    }
    guard wavData.count <= maximumDecodedBytes else {
      throw NeuralWavSoundWriterError.audioTooLarge
    }

    let parsedDuration = try validatePCM16Wav(wavData)
    try? FileManager.default.removeItem(at: destinationURL)

    do {
      // WAV is a supported named system-sound container. Keeping its original
      // PCM bytes avoids changing the selected neural voice during transcoding.
      try wavData.write(to: destinationURL, options: .atomic)
      let audioFile = try AVAudioFile(forReading: destinationURL)
      guard audioFile.length > 0, audioFile.fileFormat.sampleRate > 0 else {
        throw NeuralWavSoundWriterError.emptyAudio
      }
      let decodedDuration = Double(audioFile.length) / audioFile.fileFormat.sampleRate
      guard decodedDuration.isFinite, decodedDuration > 0 else {
        throw NeuralWavSoundWriterError.invalidWav
      }
      guard decodedDuration <= maximumDuration else {
        throw NeuralWavSoundWriterError.audioTooLong
      }
      guard abs(decodedDuration - parsedDuration) <= 0.05 else {
        throw NeuralWavSoundWriterError.invalidWav
      }
      return decodedDuration
    } catch {
      try? FileManager.default.removeItem(at: destinationURL)
      throw error
    }
  }

  private static func isStrictBase64(_ bytes: String.UTF8View) -> Bool {
    var paddingCount = 0
    var reachedPadding = false

    for byte in bytes {
      if byte == 0x3d { // "="
        reachedPadding = true
        paddingCount += 1
        if paddingCount > 2 { return false }
        continue
      }
      if reachedPadding { return false }
      let isLetter = (0x41...0x5a).contains(byte) || (0x61...0x7a).contains(byte)
      let isNumber = (0x30...0x39).contains(byte)
      guard isLetter || isNumber || byte == 0x2b || byte == 0x2f else { return false }
    }

    return true
  }

  private static func validatePCM16Wav(_ data: Data) throws -> TimeInterval {
    guard data.count >= 44,
          ascii(data, at: 0) == "RIFF",
          ascii(data, at: 8) == "WAVE",
          let riffPayloadSize = uint32LE(data, at: 4) else {
      throw NeuralWavSoundWriterError.invalidWav
    }

    let riffEnd = Int(riffPayloadSize) + 8
    guard riffEnd >= 44, riffEnd <= data.count else {
      throw NeuralWavSoundWriterError.invalidWav
    }

    var format: (channels: Int, sampleRate: Int, byteRate: Int, blockAlign: Int)?
    var audioByteCount: Int?
    var offset = 12

    while offset + 8 <= riffEnd {
      guard let chunkSizeValue = uint32LE(data, at: offset + 4) else {
        throw NeuralWavSoundWriterError.invalidWav
      }
      let chunkSize = Int(chunkSizeValue)
      let chunkStart = offset + 8
      guard chunkSize <= riffEnd - chunkStart else {
        throw NeuralWavSoundWriterError.invalidWav
      }

      let chunkId = ascii(data, at: offset)
      if chunkId == "fmt " {
        guard format == nil,
              chunkSize >= 16,
              let audioFormat = uint16LE(data, at: chunkStart),
              let channelsValue = uint16LE(data, at: chunkStart + 2),
              let sampleRateValue = uint32LE(data, at: chunkStart + 4),
              let byteRateValue = uint32LE(data, at: chunkStart + 8),
              let blockAlignValue = uint16LE(data, at: chunkStart + 12),
              let bitsPerSample = uint16LE(data, at: chunkStart + 14) else {
          throw NeuralWavSoundWriterError.invalidWav
        }

        let channels = Int(channelsValue)
        let sampleRate = Int(sampleRateValue)
        let byteRate = Int(byteRateValue)
        let blockAlign = Int(blockAlignValue)
        guard audioFormat == 1,
              (1...2).contains(channels),
              (8_000...48_000).contains(sampleRate),
              bitsPerSample == 16,
              blockAlign == channels * 2,
              byteRate == sampleRate * blockAlign else {
          throw NeuralWavSoundWriterError.unsupportedWav
        }
        format = (channels, sampleRate, byteRate, blockAlign)
      } else if chunkId == "data" {
        guard audioByteCount == nil else {
          throw NeuralWavSoundWriterError.invalidWav
        }
        audioByteCount = chunkSize
      }

      let paddedSize = chunkSize + (chunkSize.isMultiple(of: 2) ? 0 : 1)
      guard paddedSize <= riffEnd - chunkStart else {
        throw NeuralWavSoundWriterError.invalidWav
      }
      offset = chunkStart + paddedSize
    }

    guard offset == riffEnd else {
      throw NeuralWavSoundWriterError.invalidWav
    }

    guard let format, let audioByteCount, audioByteCount > 0 else {
      throw NeuralWavSoundWriterError.emptyAudio
    }
    guard audioByteCount.isMultiple(of: format.blockAlign) else {
      throw NeuralWavSoundWriterError.invalidWav
    }

    let duration = Double(audioByteCount) / Double(format.byteRate)
    guard duration.isFinite, duration > 0 else {
      throw NeuralWavSoundWriterError.invalidWav
    }
    guard duration <= maximumDuration else {
      throw NeuralWavSoundWriterError.audioTooLong
    }
    return duration
  }

  private static func ascii(_ data: Data, at offset: Int) -> String? {
    guard offset >= 0, offset + 4 <= data.count else { return nil }
    return String(bytes: data[offset..<(offset + 4)], encoding: .ascii)
  }

  private static func uint16LE(_ data: Data, at offset: Int) -> UInt16? {
    guard offset >= 0, offset + 2 <= data.count else { return nil }
    return UInt16(data[offset]) | (UInt16(data[offset + 1]) << 8)
  }

  private static func uint32LE(_ data: Data, at offset: Int) -> UInt32? {
    guard offset >= 0, offset + 4 <= data.count else { return nil }
    return UInt32(data[offset])
      | (UInt32(data[offset + 1]) << 8)
      | (UInt32(data[offset + 2]) << 16)
      | (UInt32(data[offset + 3]) << 24)
  }
}
