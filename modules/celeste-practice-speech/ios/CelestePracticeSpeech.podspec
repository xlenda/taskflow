Pod::Spec.new do |s|
  s.name             = 'CelestePracticeSpeech'
  s.version          = '1.0.0'
  s.summary          = 'On-device practice speech recognition for Celeste.'
  s.description      = 'An Expo module that recognizes short practice phrases locally with Apple Speech.'
  s.license          = { :type => 'MIT' }
  s.author           = { 'Celeste' => 'dev@localhost' }
  s.homepage         = 'https://example.invalid/celeste'
  s.platforms        = { :ios => '15.1' }
  s.swift_version    = '5.9'
  s.source           = { :git => 'https://example.invalid/celeste-practice-speech.git', :tag => s.version.to_s }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'Speech'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
